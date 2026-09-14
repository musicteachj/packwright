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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
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
import { blockingOmissions, labelFilename } from '@packwright/label-core'
import { useLabelDocumentStore } from '../stores/labelDocument'
import { BUTTON } from '../components/chrome'
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
  return store.layout?.symbols[0]
    ? `UPC-A label for GTIN ${store.layout.symbols[0].value}`
    : 'Label with no barcode drawn'
})

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
  try {
    const saved =
      mode === 'replace' && store.savedId !== null
        ? await replaceLabel(store.savedId, savedInput.value)
        : await createLabel(savedInput.value)
    store.markSaved(saved.id, saved.name)
    // The URL follows the document, so a reload lands on the same label and a
    // copied link points at it.
    if (route.params.id !== saved.id) await router.replace(`/labels/${saved.id}`)
  } catch (caught) {
    saveError.value =
      caught instanceof SavedLabelError && caught.detail.length > 0
        ? `${caught.message}: ${caught.detail.map((d) => `${d.path} ${d.message}`).join('; ')}`
        : caught instanceof Error
          ? caught.message
          : 'The label could not be saved.'
  } finally {
    saving.value = false
  }
}

async function openFromRoute(id: string) {
  loadError.value = null
  try {
    const saved = await readLabel(id)
    store.loadSaved({
      id: saved.id,
      name: saved.name,
      labelType: saved.labelType as 'gs1-retail' | 'ghs-chemical' | 'us-food',
      stock: saved.stock,
      data: saved.data,
    })
  } catch (caught) {
    loadError.value =
      caught instanceof SavedLabelError && caught.isMissing
        ? 'That label no longer exists. The editor is showing a new document.'
        : caught instanceof Error
          ? caught.message
          : 'The label could not be opened.'
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
      return
    }
    // `/labels/new` is a new document. The fields are left as they are, so
    // "start from this one" still works, but nothing is attached and the name
    // does not carry over — a name belongs to the record it was given to.
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
      const detail = await response.json().catch(() => null)
      exportError.value = detail?.detail
        ? `${detail.error}: ${JSON.stringify(detail.detail)}`
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
  <main class="bg-chrome-950 text-chrome-100 flex h-screen flex-col">
    <header
      class="border-chrome-800 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3 py-3 lg:gap-6 lg:px-6"
    >
      <div class="flex min-w-0 items-baseline gap-3">
        <span class="text-notice text-lg" aria-hidden="true">⊕</span>
        <h1 class="text-sm font-semibold tracking-tight">packwright</h1>
        <label
          for="field-label-type"
          class="text-chrome-400 flex min-w-0 items-baseline gap-2 text-xs"
        >
          <span class="sr-only">Label type</span>
          <select
            id="field-label-type"
            v-model="store.labelType"
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
          v-model="store.savedName"
          type="text"
          maxlength="120"
          placeholder="Name this label to save it"
          class="border-chrome-700 bg-chrome-900 text-chrome-200 min-w-0 grow border px-2 py-0.5 text-xs"
        />
      </label>

      <div class="flex min-w-0 shrink-0 items-center gap-4">
        <span
          v-if="store.savedId !== null"
          class="text-chrome-400 shrink-0 text-xs"
          data-save-state
          >{{ store.isDirty ? 'Unsaved changes' : 'Saved' }}</span
        >
        <button
          type="button"
          :class="[BUTTON, 'shrink-0 px-3 py-1 text-xs']"
          :disabled="saving || !canSave || (store.savedId !== null && !store.isDirty)"
          data-save
          @click="persist('replace')"
        >
          {{ saving ? 'Saving…' : store.savedId !== null && !store.isDirty ? 'Saved' : 'Save' }}
        </button>
        <button
          v-if="store.savedId !== null"
          type="button"
          :class="[BUTTON, 'shrink-0 px-3 py-1 text-xs']"
          :disabled="saving || !canSave"
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
          :disabled="exporting || !store.layout || cannotExport"
          :title="cannotExport ? exportBlockedReason : undefined"
          @click="exportPdf"
        >
          {{ exporting ? 'Exporting…' : 'Export PDF' }}
        </button>
      </div>
    </header>

    <PaneSwitcher v-if="narrow" :current="pane" @select="pane = $event" />

    <!--
      The findings rail carries the only `aria-live` region in the application,
      and below `lg` that rail is `display: none` unless Checks is the pane on
      screen — so a screen-reader user got no compliance announcements at all on a
      narrow window. Measured: one live region in the document, zero client rects.
      This one exists only while that is true, so exactly one is ever live.
    -->
    <p v-if="narrow" class="sr-only" role="status" aria-live="polite">
      {{ store.failures.length }} findings, {{ store.passes.length }} checks passed.
    </p>

    <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_1fr_340px]">
      <div
        id="pane-form"
        :role="narrow ? 'tabpanel' : undefined"
        :aria-labelledby="narrow ? 'tab-form' : undefined"
        class="border-chrome-800 bg-chrome-900 min-h-0 overflow-y-auto lg:overflow-visible lg:border-r"
        :class="paneClass('form')"
      >
        <EditorFormRail />
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
          <LabelCanvas
            v-if="store.layout"
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

        <LabelTextView v-if="store.layout" :layout="store.layout" />
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
          :selected-element-id="store.selectedElementId"
          @select="selectFromFindings($event)"
        />
      </div>
    </div>
  </main>
</template>
