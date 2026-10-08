<script setup lang="ts">
/**
 * The editor. This is the app.
 *
 * Three panes: the form, the label, and what is wrong with it. The link between
 * them is the point — click a finding and the offending element outlines on the
 * canvas and its form field rings; focus a field and the same element outlines.
 * That one connection is what turns a compliance engine from a wall of text into
 * something you can see, and it is why it belongs here rather than in polish
 * afterwards.
 *
 * Desktop-first, deliberately. A phone is a bad place to lay out a 100 × 150 mm
 * label and pretending otherwise produces a worse desktop tool — so below 1024px
 * the three panes do not shrink, they take turns behind a Form / Preview / Checks
 * control. Shrinking them would have produced three unusable columns instead of
 * one usable one.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  SavedLabelError,
  createLabel,
  readLabel,
  replaceLabel,
  type SavedLabelInput,
} from '../api/savedLabels'
import EditorFormRail from '../components/EditorFormRail.vue'
import FindingsRail from '../components/FindingsRail.vue'
import LabelCanvas from '../components/LabelCanvas.vue'
import LabelTextView from '../components/LabelTextView.vue'
import { blockingOmissions, labelFilename, type DeclinedFact } from '@packwright/label-core'
import { DECLINED_FACT_FIELDS } from '../declinedFacts'
import { useLabelDocumentStore } from '../stores/labelDocument'
import { BUTTON } from '../components/chrome'
import { useDocumentTitle } from '../documentTitle'
import PaneSwitcher from '../components/PaneSwitcher.vue'
import { DEFAULT_EDITOR_PANE, useNarrowEditor, type EditorPane } from '../panes'

const store = useLabelDocumentStore()

/**
 * Which pane a narrow screen is showing. Inert at `lg` and above, where all three
 * are displayed and nothing reads it.
 */
const pane = ref<EditorPane>(DEFAULT_EDITOR_PANE)

/**
 * Whether the panes are taking turns. Drives the ARIA rather than the pixels —
 * the layout is still CSS — because a role cannot be set by a media query.
 */
const narrow = useNarrowEditor()

const previewPane = useTemplateRef<HTMLElement>('previewPane')

/**
 * Classes that hide a pane on a narrow screen and always show it on a wide one.
 *
 * The display value is a parameter because the preview pane is a flex column —
 * the canvas grows and the text-equivalent view sits under it — and the other two
 * are ordinary blocks. Handing all three `block` silently neutered `flex-col` on
 * the preview, which nothing in jsdom could have noticed: the element was still
 * there, still "visible", and laid out completely differently.
 *
 * Expressed once rather than three times, because three copies of a rule about
 * which pane is visible is how two of them end up visible at once.
 */
const paneClass = (id: EditorPane, display: 'block' | 'flex' = 'block') => [
  pane.value === id ? display : 'hidden',
  display === 'flex' ? 'lg:flex' : 'lg:block',
]

/**
 * Clicking a finding outlines the offending element on the canvas — the
 * interaction this editor is built around. Below `lg` the canvas is not on
 * screen when the findings are, so following the link means going to it: without
 * this, the signature interaction silently does nothing on a phone, which is
 * worse than not offering it.
 */
async function selectFromFindings(elementId: string | undefined) {
  store.select(elementId ?? null)
  if (elementId === undefined || !narrow.value) return

  pane.value = 'preview'
  // Switching panes hides the button that was just activated, and a focused
  // element inside a `display: none` subtree is dropped by the browser — measured
  // as `document.activeElement` becoming `BODY`. A keyboard or screen-reader user
  // would follow the link and land nowhere, with nothing announced: the same
  // silent nothing this function exists to prevent, one step further on.
  await nextTick()
  previewPane.value?.focus()
}

/**
 * A check that did not run, followed to the field that would let it run.
 *
 * The rail hands back the fact — it is shared with the audit view and knows
 * nothing of this form — and `DECLINED_FACT_FIELDS` says where it is stated.
 * Below `lg` the form is a pane of its own and may not be the one on screen,
 * so it is shown first: a focus moved into a `display: none` pane is dropped by
 * the browser, which is the silent nothing `selectFromFindings` documents.
 *
 * Focus goes to the control, or to the first control of a group — the GHS
 * classification is forty-four checkboxes, and the one to start from is the
 * first — and the field is brought into view around it.
 */
async function stateFact(fact: DeclinedFact) {
  const { fieldId } = DECLINED_FACT_FIELDS[fact]
  // Found before the pane changes, not after. The panes are hidden by CSS and
  // never unmounted, so the field is in the document whichever is showing. The
  // first version switched first and looked second, so a field that was not
  // there — renamed, or rendered under a condition the decline did not share —
  // hid the Checks pane, dropped focus with it, and left the user on an empty
  // form. Found by `/code-review high` on PR #60.
  const field = document.getElementById(fieldId)
  if (field === null) return
  if (narrow.value) pane.value = 'form'
  await nextTick()
  const control = field.matches('input, select, textarea, button')
    ? field
    : field.querySelector<HTMLElement>('input, select, textarea, button')
  field.scrollIntoView({ block: 'center' })
  control?.focus({ preventScroll: true })
}

const exporting = ref(false)
const exportError = ref<string | null>(null)

/**
 * A label whose barcode could not be drawn is a blank page, and the server now
 * refuses to export one. Offering the button and then showing a 422 would be a
 * worse way of saying the same thing.
 */
// The same predicate the API uses, imported rather than restated, so the button
// and the server cannot disagree about what blocks an export.
const blocking = computed(() => (store.layout ? blockingOmissions(store.layout) : []))
const cannotExport = computed(() => blocking.value.length > 0)

// The reason must come from the omission that actually blocks. Reading
// `omissions[0]` explained whichever came first, which after the scope split
// could be a detail the export ships happily.
const exportBlockedReason = computed(() => blocking.value[0]?.reason ?? '')

/**
 * Names what was actually drawn rather than assuming a barcode.
 *
 * This is the canvas's accessible name, so "Label with no barcode drawn" was a
 * reasonable fallback while UPC-A was the only label type and a misleading one
 * the moment a GHS label — which has no barcode by design — reached the canvas.
 */
const canvasTitle = computed(() => {
  if (store.labelType === 'ghs-chemical') {
    return `GHS chemical label for ${store.ghsData.productIdentifier}`
  }
  if (store.labelType === 'us-food') {
    return `US food label for ${store.foodData.statementOfIdentity}`
  }
  if (!store.layout?.symbols[0]) return 'Label with no barcode drawn'
  const label = `UPC-A label for GTIN ${store.layout.symbols[0].value}`
  // The placeholder is drawn without its bars; the title says so, as the landing page's does.
  if (store.encoderFailed && store.encoderPending) return `${label}, its bars could not be loaded`
  return store.encoderPending ? `${label}, its bars still loading` : label
})

/**
 * Export waits for the barcode to be judged.
 *
 * Findings are held back until the encoder is here, so `hasBlocking` reads false and the
 * "non-compliant as drawn" confirm was skipped — while the server, which has its own
 * encoder, would print the label anyway. A non-compliant PDF downloaded with no warning,
 * on exactly the label the rail could not judge. Found by review.
 */
const exportWaitsForEncoder = computed(() => store.encoderPending)

/**
 * Saving, and what the editor is saving *to*.
 *
 * The route decides: `/labels/:id` opens that record and attaches the editor to
 * it, `/labels/new` leaves it unattached. Attachment is what makes Save replace
 * rather than duplicate, and it is also what lets an export use the stock a
 * label was saved at — `docs/BACKLOG.md` records what happens without it.
 */
const route = useRoute()
const router = useRouter()
const saving = ref(false)
const saveError = ref<string | null>(null)
const loadError = ref<string | null>(null)

const savedInput = computed(() => ({
  name: store.savedName.trim(),
  labelType: store.labelType,
  stock: JSON.parse(JSON.stringify(store.snapshot.stock)) as SavedLabelInput['stock'],
  data: JSON.parse(JSON.stringify(store.snapshot.data)) as unknown,
}))

/** A label the schema will refuse for want of a name is refused here first. */
const canSave = computed(() => savedInput.value.name.length > 0)

async function persist(mode: 'replace' | 'create') {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null
  // **Which document this Save was made about, so its answer is only applied
  // to that one.** A Save still in flight when the user moved to another label
  // resolved onto that one: `markSaved` attached the label now on screen to the
  // record just written, and `router.replace` moved the URL back to it — so the
  // next Save wrote one label's content over another's. The record is still
  // written, as asked; it is the label now on screen that must not be told it
  // is that record. Keyed on the store's `documentGeneration`, not on the
  // route: the first version compared paths, and a path can be returned to.
  const madeAbout = store.documentGeneration
  // The payload, kept: it is what the server will hold, so it is what "saved"
  // means once the answer comes back — not whatever is on screen by then.
  const sending = savedInput.value
  try {
    const saved =
      mode === 'replace' && store.savedId !== null
        ? await replaceLabel(store.savedId, sending)
        : await createLabel(sending)
    if (store.documentGeneration !== madeAbout) return
    store.markSaved(saved.id, saved.name, sending)
    // The URL follows the document, so a reload lands on the same label and a
    // copied link points at it — while this editor is still the page. Leaving
    // it moves no generation, because the store still holds the same document,
    // so a Save answering after the user had gone to the audit view dragged
    // them back here. The answer above is still recorded; only the navigation
    // is no longer the Save's to make. Found by review.
    if (stillHere && route.params.id !== saved.id) await router.replace(`/labels/${saved.id}`)
  } catch (caught) {
    const reason =
      caught instanceof SavedLabelError && caught.detail.length > 0
        ? `${caught.message}: ${caught.detail.map((d) => `${d.path} ${d.message}`).join('; ')}`
        : caught instanceof Error
          ? caught.message
          : 'The label could not be saved.'
    // **A failure is said even once the user has moved on — naming the label
    // it was for.** Dropped, the edits that were never written vanished without
    // a word beside a header reading "Saved" for the next label; said plainly,
    // it would read as that next label failing. A first version of this fix
    // dropped it, and review found it worse than the defect it replaced.
    saveError.value =
      store.documentGeneration === madeAbout
        ? reason
        : `“${sending.name}” was not saved: ${reason.trim().replace(/[.!?]$/, '')}. ` +
          'Its changes were not written.'
  } finally {
    saving.value = false
  }
}

/**
 * The label the editor is currently fetching, or `null` when it holds what the
 * route asked for.
 *
 * **The editor used to present a different label while this was in flight**, and
 * there was nothing to say so. The store is a singleton seeded at construction,
 * so `store.layout` is non-null from the first frame: under a URL naming
 * somebody else's label, the canvas drew the seeded document, the rail offered
 * its fields for editing, and the findings rail reported "All 6 checks passed"
 * about it. Then `loadSaved` called `replaceReactive`, which deletes every key
 * before assigning — so anything typed in that window went, with no warning.
 *
 * Holding the request rather than a flag or an id, because two route changes
 * can overlap and every weaker key has let the wrong read win. A boolean lets
 * the first arrival declare the second finished. An id cannot tell two reads of
 * the *same* label apart — `/labels/abc123` to `/labels/new` and back leaves
 * two outstanding, and the abandoned one, failing, put "That label no longer
 * exists" in front of a label that was loading perfectly well. Object identity
 * is a per-request token by construction, which is the same trick
 * `UsFoodFormRail`'s refusals use to tell one document from another.
 *
 * `shallowRef`, and not for performance. A plain `ref` wraps an object in a
 * reactive proxy on the way in, so `opening.value` hands back the proxy and
 * never equals the request that was put there — every guard below fails, the
 * wait never lifts, and five tests said so at once.
 */
const opening = shallowRef<{ id: string } | null>(null)

/**
 * The header names the label on screen, and during an open there is none.
 *
 * The panes withhold the document while the next label is read, and the header
 * used to go on naming the one being left — its name in the field, "Saved"
 * beside it — which asserted an identity about something no longer shown. The
 * field reads empty instead, with a placeholder saying why; it is disabled for
 * the wait, so the setter is never reached through it then.
 */
const nameField = computed({
  get: () => (opening.value !== null ? '' : store.savedName),
  set: (name: string) => {
    store.savedName = name
  },
})

useDocumentTitle(() => {
  if (opening.value !== null) return 'Opening a label'
  // Not the route's own title: at `/labels/:id` that says "Saved label", and an
  // open that failed has detached — the editor holds a new document there.
  if (store.savedId === null) return 'New label'
  return store.savedName.trim() === '' ? 'Unnamed label' : store.savedName
})

async function openFromRoute(id: string) {
  const request = { id }
  loadError.value = null
  opening.value = request
  // Anything in flight about the label being left is now stale — see
  // `supersede`. The store's generation moves here rather than when the next
  // label lands, which is too late for a Save that answers during the wait.
  store.supersede()
  try {
    const saved = await readLabel(id)
    // Nobody is waiting for this one any more. Guarding only in the `finally`
    // left a stale read writing the document anyway, so landing `def456` first
    // and `abc123` second put `abc123` on screen at `/labels/def456` with no
    // wait and no error — this change's own defect, by the other ordering.
    if (opening.value !== request) return
    store.loadSaved({
      id: saved.id,
      name: saved.name,
      labelType: saved.labelType as 'gs1-retail' | 'ghs-chemical' | 'us-food',
      stock: saved.stock,
      data: saved.data,
    })
  } catch (caught) {
    // Same test, same reason: a failure nobody is waiting for is not an error
    // to put in front of the label that replaced it.
    if (opening.value !== request) return
    // **Let go of whatever was attached, for any failure.** This said "the
    // editor is showing a new document" and left the previous label attached,
    // so the next Save issued a `PUT` over a record the user believed they had
    // left — the bug the route watcher's `/labels/new` branch exists to
    // prevent, reached through the error path. A 500 is not "no longer
    // exists", but the label on screen is still not the one the URL names, and
    // that is the only fact a Save needs. Detached exactly as `/labels/new`
    // detaches: the fields stay, so nothing typed is lost, and nothing is
    // attached, so a Save creates.
    store.detach()
    store.savedName = ''
    // Framed the same way whatever arrives. The server's text may or may not
    // end in a full stop ("Internal server error"), and a network failure is
    // "Failed to fetch"; appended raw, a second sentence ran into the first.
    const said = (caught instanceof Error ? caught.message : '').trim().replace(/[.!?]$/, '')
    loadError.value =
      caught instanceof SavedLabelError && caught.isMissing
        ? 'That label no longer exists. The editor is showing a new document.'
        : `The label could not be opened${said === '' ? '' : `: ${said}`}. ` +
          'The editor is showing a new document.'
  } finally {
    // Only if this read is still the one the editor is waiting on. A failed
    // open falls through to the document already held, detached, which is
    // what `loadError` is there to explain.
    if (opening.value === request) opening.value = null
  }
}

/**
 * The route decides what the editor is holding, on every change of it.
 *
 * **`onMounted` alone was a way to overwrite somebody's label.** The store is a
 * singleton and the editor is the same component at `/labels/new` and at
 * `/labels/:id`, so arriving at `/labels/new` from a saved label — the header's
 * own "Editor" link does exactly that — left `savedId` set. The document still
 * read "Saved", and the next edit followed by Save issued a `PUT` over the
 * record the user thought they had navigated away from.
 */
watch(
  () => route.params.id,
  (id) => {
    loadError.value = null
    saveError.value = null
    if (typeof id === 'string' && id.length > 0) {
      if (id !== store.savedId) void openFromRoute(id)
      // Already holding it, so there is nothing to wait for — and anything
      // still in flight belongs to a label this route has left. Without this,
      // going to another label and straight back stranded the editor on the
      // wait, and the abandoned read then attached *its* label to this URL.
      else opening.value = null
      return
    }
    // `/labels/new` is a new document. The fields are left as they are, so
    // "start from this one" still works, but nothing is attached and the name
    // does not carry over — a name belongs to the record it was given to.
    //
    // Abandoning the read first, which is not bookkeeping. Leaving it set left
    // the editor on "Opening this label…" at a URL with nothing to open, and
    // let the abandoned read attach this new document to the old record when it
    // landed — the bug the comment above is about, reached from the other side.
    opening.value = null
    store.detach()
    store.savedName = ''
  },
  { immediate: true },
)

/**
 * Unsaved work does not leave quietly.
 *
 * Two guards because there are two ways out: the router covers navigation inside
 * the application, and `beforeunload` covers closing the tab. The second cannot
 * carry a message — every browser shows its own wording — which makes it a blunt
 * instrument, and it is here because losing an edited label to a closed tab is
 * worse than a prompt nobody can word.
 */
const warnOnUnload = (event: BeforeUnloadEvent) => {
  if (!store.isDirty) return
  event.preventDefault()
}

onMounted(() => window.addEventListener('beforeunload', warnOnUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnOnUnload))

/** Whether this editor is still the page — see the redirect at the end of `persist`. */
let stillHere = true
onBeforeUnmount(() => {
  stillHere = false
})

onBeforeRouteLeave(() => {
  if (!store.isDirty) return true
  return window.confirm('This label has unsaved changes. Leave without saving?')
})

/** The route and filename follow the label type, so neither is hardcoded. */
const EXPORT_PATHS = {
  'gs1-retail': '/api/labels/upc-a/export',
  'ghs-chemical': '/api/labels/ghs/export',
  'us-food': '/api/labels/us-food/export',
} as const

const exportPath = computed(() => EXPORT_PATHS[store.labelType])

const exportFilename = computed(() => {
  switch (store.labelType) {
    case 'ghs-chemical':
      return labelFilename(store.ghsData.productIdentifier)
    case 'us-food':
      return labelFilename(store.foodData.statementOfIdentity)
    case 'gs1-retail':
      return labelFilename(store.data.gtin)
    default: {
      const unreachable: never = store.labelType
      return unreachable
    }
  }
})

/** The body each route expects. Narrowed rather than cast, as everywhere else. */
const exportBody = computed(() => {
  switch (store.labelType) {
    case 'ghs-chemical':
      return { ...store.ghsData, stock: store.ghsStock }
    case 'us-food':
      return { ...store.foodData, stock: store.foodStock }
    case 'gs1-retail':
      return { ...store.data, stock: store.stock }
    default: {
      // The exhaustiveness guard `runRules` uses, for the reason the store
      // records: the lint rule cannot see that this covers the union.
      const unreachable: never = store.labelType
      return unreachable
    }
  }
})

async function exportPdf() {
  // "Non-compliant as drawn" is what blocking means, and exporting anyway is the
  // user's call — but it should be a decision rather than a click. Nothing is
  // prevented; the warning simply makes sure the finding was seen.
  if (store.hasBlocking) {
    const proceed = window.confirm(
      'This label has a blocking finding — it is non-compliant as drawn. Export anyway?',
    )
    if (!proceed) return
  }

  exporting.value = true
  exportError.value = null
  try {
    const response = await fetch(exportPath.value, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportBody.value),
    })

    if (!response.ok) {
      // The server's own sentence wherever there is one, with its detail appended
      // where there is that too. Keyed on `detail` alone, a 429 from the export
      // quota — which carries an error and no detail — was reported to the user
      // as "The export failed (429)", discarding the one line that said why and
      // that waiting would fix it. Found by review.
      const body = await response.json().catch(() => null)
      const detail = Array.isArray(body?.detail) ? body.detail.join('; ') : ''
      exportError.value =
        typeof body?.error === 'string'
          ? `${body.error}${detail === '' ? '' : `: ${detail}`}`
          : `The export failed (${response.status}).`
      return
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFilename.value
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : 'The export failed.'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <!-- `#main` and `tabindex` for the skip link; see `AppShell.vue`. -->
  <main
    id="main"
    tabindex="-1"
    class="bg-chrome-950 text-chrome-100 flex h-screen flex-col focus:outline-none"
  >
    <header
      class="border-chrome-800 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3 py-3 lg:gap-6 lg:px-6"
    >
      <div class="flex min-w-0 items-baseline gap-3">
        <!--
          A way out. The editor has no masthead, and its wordmark was the only
          one in the application that went nowhere.
        -->
        <RouterLink
          to="/"
          class="focus-visible:outline-notice flex items-baseline gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span class="text-notice text-lg" aria-hidden="true">⊕</span>
          <h1 class="text-sm font-semibold tracking-tight">packwright</h1>
        </RouterLink>
        <label
          for="field-label-type"
          class="text-chrome-400 flex min-w-0 items-baseline gap-2 text-xs"
        >
          <span class="sr-only">Label type</span>
          <select
            id="field-label-type"
            v-model="store.labelType"
            :disabled="opening !== null"
            class="border-chrome-700 bg-chrome-900 text-chrome-300 numeric min-w-0 border px-2 py-0.5 text-xs"
          >
            <option value="gs1-retail">GS1 retail label</option>
            <option value="ghs-chemical">GHS chemical label</option>
            <option value="us-food">US food label</option>
          </select>
        </label>
      </div>

      <!--
        The name is a field rather than a dialog. It is required by the schema, so
        it has to be asked for somewhere, and a modal to collect one string would
        be the first dialog this application owns.
      -->
      <label for="field-label-name" class="flex min-w-0 grow items-baseline gap-2 text-xs">
        <span class="sr-only">Label name</span>
        <input
          id="field-label-name"
          v-model="nameField"
          type="text"
          :disabled="opening !== null"
          maxlength="120"
          :placeholder="opening !== null ? 'Opening a label…' : 'Name this label to save it'"
          class="border-chrome-700 bg-chrome-900 text-chrome-200 min-w-0 grow border px-2 py-0.5 text-xs"
        />
      </label>

      <div class="flex min-w-0 shrink-0 items-center gap-4">
        <span
          v-if="store.savedId !== null && opening === null"
          class="text-chrome-400 shrink-0 text-xs"
          data-save-state
          >{{ store.isDirty ? 'Unsaved changes' : 'Saved' }}</span
        >
        <button
          type="button"
          :class="[BUTTON, 'shrink-0 px-3 py-1 text-xs']"
          :disabled="
            opening !== null || saving || !canSave || (store.savedId !== null && !store.isDirty)
          "
          data-save
          @click="persist('replace')"
        >
          {{
            saving
              ? 'Saving…'
              : opening === null && store.savedId !== null && !store.isDirty
                ? 'Saved'
                : 'Save'
          }}
        </button>
        <button
          v-if="store.savedId !== null"
          type="button"
          :class="[BUTTON, 'shrink-0 px-3 py-1 text-xs']"
          :disabled="opening !== null || saving || !canSave"
          data-save-as
          @click="persist('create')"
        >
          Save as new
        </button>
        <p v-if="exportError" class="text-danger max-w-md text-xs">{{ exportError }}</p>
        <p v-else-if="cannotExport" class="text-chrome-300 max-w-md text-xs">
          Nothing to export — part of the label could not be drawn.
        </p>
        <!--
          After the pair above, not between them. Inserted in the middle, these
          two rebound `v-else-if` onto `loadError`, so a failed open suppressed
          the only explanation beside a disabled Export button.

          A save that failed and a label that could not be opened both have to be
          said out loud: a Save button that quietly does nothing reads as a
          document that is safe, which is the worst thing it could read as.
        -->
        <p v-if="saveError" class="text-danger max-w-md text-xs" role="alert">{{ saveError }}</p>
        <p v-if="loadError" class="text-danger max-w-md text-xs" role="alert">{{ loadError }}</p>
        <button
          type="button"
          :class="[BUTTON, 'px-3 py-1.5 text-xs']"
          :disabled="
            opening !== null || exporting || !store.layout || cannotExport || exportWaitsForEncoder
          "
          :title="
            exportWaitsForEncoder
              ? store.encoderFailed
                ? 'The barcode encoder could not be loaded, so the label cannot be checked or exported. Reload the page to try again.'
                : 'The barcode has not been checked yet, so it cannot be exported.'
              : cannotExport
                ? exportBlockedReason
                : undefined
          "
          @click="exportPdf"
        >
          {{ exporting ? 'Exporting…' : 'Export PDF' }}
        </button>
      </div>
    </header>

    <PaneSwitcher v-if="narrow" :current="pane" @select="pane = $event" />

    <!--
      There used to be a second live region here, below `lg`, because the findings
      rail is `display: none` there unless Checks is showing and its own region
      went silent with it. It was gated on the width alone, so on Checks both
      were perceivable and said the same counts in two wordings — measured. The
      application now says the summary once, through the announcer mounted at its
      root, at every width and on every pane. See `stores/announcer.ts`.
    -->

    <!--
      Nothing of the document while the route is still being answered — but the
      panes stay, and each withholds its own content.

      The first version swapped this whole grid for a waiting panel with a live
      region of its own, which unmounted the findings rail's region and rebuilt it
      full on arrival, so opening a saved label was silent. The rail's summary now
      goes through the announcer, which nothing here can unmount; it says the wait
      and then the counts as two changes to one line.
    -->
    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_1fr_340px]">
      <div
        id="pane-form"
        :role="narrow ? 'tabpanel' : undefined"
        :aria-labelledby="narrow ? 'tab-form' : undefined"
        class="border-chrome-800 bg-chrome-900 min-h-0 overflow-y-auto lg:overflow-visible lg:border-r"
        :class="paneClass('form')"
      >
        <EditorFormRail v-if="opening === null" />
        <!--
          \`lg:hidden\` because at that width Preview is on screen beside it and
          already says so; below it the panes take turns and this may be the only
          one showing.
        -->
        <p v-else class="text-chrome-300 px-4 py-6 text-sm lg:hidden">Opening this label…</p>
      </div>

      <div
        id="pane-preview"
        ref="previewPane"
        :role="narrow ? 'tabpanel' : undefined"
        :aria-labelledby="narrow ? 'tab-preview' : undefined"
        :tabindex="narrow ? -1 : undefined"
        class="min-h-0 flex-col overflow-y-auto"
        :class="paneClass('preview', 'flex')"
      >
        <div class="flex flex-1 items-center justify-center p-8">
          <p v-if="opening !== null" class="text-chrome-300 text-sm">Opening this label…</p>
          <LabelCanvas
            v-else-if="store.layout"
            :layout="store.layout"
            :title="canvasTitle"
            :highlighted-element-id="store.selectedElementId"
            show-overlay-controls
          />
          <!--
            A layout that cannot be resolved is an ordinary state here — a GTIN
            half typed is not twelve digits yet. It is a form condition, not a
            compliance verdict, so it says so plainly and no finding is invented
            for it.
          -->
          <p v-else class="text-chrome-300 max-w-md text-sm leading-relaxed">
            {{ store.layoutError }}
          </p>
        </div>

        <LabelTextView v-if="opening === null && store.layout" :layout="store.layout" />
      </div>

      <div
        id="pane-checks"
        :role="narrow ? 'tabpanel' : undefined"
        :aria-labelledby="narrow ? 'tab-checks' : undefined"
        class="border-chrome-800 bg-chrome-900 min-h-0 lg:border-l"
        :class="paneClass('checks')"
      >
        <FindingsRail
          :groups="store.findingsBySeverity"
          :failures="store.failures"
          :passes="store.passes"
          :uncertifiable="store.uncertifiable"
          :declined="store.declined"
          :selected-element-id="store.selectedElementId"
          :pending="opening !== null || store.encoderPending"
          :pending-text="
            opening !== null
              ? 'Opening this label…'
              : store.encoderFailed
                ? 'The barcode encoder could not be loaded. Reload the page to try again.'
                : 'Loading the barcode encoder…'
          "
          @select="selectFromFindings($event)"
          @state="stateFact($event)"
        />
      </div>
    </div>
  </main>
</template>
