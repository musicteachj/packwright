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
 * label and pretending otherwise produces a worse desktop tool; the collapse to
 * a segmented control is a later phase.
 */
import { computed, ref } from 'vue'
import EditorFormRail from '../components/EditorFormRail.vue'
import FindingsRail from '../components/FindingsRail.vue'
import LabelCanvas from '../components/LabelCanvas.vue'
import LabelTextView from '../components/LabelTextView.vue'
import { useLabelDocumentStore } from '../stores/labelDocument'

const store = useLabelDocumentStore()

const exporting = ref(false)
const exportError = ref<string | null>(null)

/**
 * A label whose barcode could not be drawn is a blank page, and the server now
 * refuses to export one. Offering the button and then showing a 422 would be a
 * worse way of saying the same thing.
 */
// Matches the API's own gate: a missing *element* is a blank page, a missing
// detail is not. The two must agree or the button offers an export the server
// refuses, or hides one it would have served.
const cannotExport = computed(
  () => (store.layout?.omissions.filter((o) => o.scope === 'element').length ?? 0) > 0,
)

const exportBlockedReason = computed(() => store.layout?.omissions[0]?.reason ?? '')

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
  return store.layout?.symbols[0]
    ? `UPC-A label for GTIN ${store.layout.symbols[0].value}`
    : 'Label with no barcode drawn'
})

/** The route and filename follow the label type, so neither is hardcoded. */
const exportPath = computed(() =>
  store.labelType === 'ghs-chemical' ? '/api/labels/ghs/export' : '/api/labels/upc-a/export',
)

const exportFilename = computed(() =>
  store.labelType === 'ghs-chemical'
    ? `${store.ghsData.productIdentifier.replace(/[^a-zA-Z0-9._-]+/g, '-')}.pdf`
    : `${store.data.gtin}.pdf`,
)

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
      body: JSON.stringify(
        store.labelType === 'ghs-chemical'
          ? { ...store.ghsData, stock: store.ghsStock }
          : { ...store.data, stock: store.stock },
      ),
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
    <header class="border-chrome-800 flex items-center justify-between gap-6 border-b px-6 py-3">
      <div class="flex items-baseline gap-3">
        <span class="text-notice text-lg" aria-hidden="true">⊕</span>
        <h1 class="text-sm font-semibold tracking-tight">packwright</h1>
        <label for="field-label-type" class="text-chrome-400 flex items-baseline gap-2 text-xs">
          <span class="sr-only">Label type</span>
          <select
            id="field-label-type"
            v-model="store.labelType"
            class="border-chrome-700 bg-chrome-900 text-chrome-300 numeric border px-2 py-0.5 text-xs"
          >
            <option value="gs1-retail">GS1 retail label</option>
            <option value="ghs-chemical">GHS chemical label</option>
          </select>
        </label>
      </div>

      <div class="flex items-center gap-4">
        <p v-if="exportError" class="text-danger max-w-md text-xs">{{ exportError }}</p>
        <p v-else-if="cannotExport" class="text-chrome-300 max-w-md text-xs">
          Nothing to export — part of the label could not be drawn.
        </p>
        <button
          type="button"
          class="border-chrome-700 bg-chrome-900 text-chrome-100 hover:bg-chrome-800 focus-visible:outline-notice border px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          :disabled="exporting || !store.layout || cannotExport"
          :title="cannotExport ? exportBlockedReason : undefined"
          @click="exportPdf"
        >
          {{ exporting ? 'Exporting…' : 'Export PDF' }}
        </button>
      </div>
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-[380px_1fr_340px]">
      <div class="border-chrome-800 bg-chrome-900 min-h-0 border-r">
        <EditorFormRail />
      </div>

      <div class="flex min-h-0 flex-col overflow-y-auto">
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

      <div class="border-chrome-800 bg-chrome-900 min-h-0 border-l">
        <FindingsRail
          :groups="store.findingsBySeverity"
          :failures="store.failures"
          :passes="store.passes"
          :uncertifiable="store.uncertifiableSymbols"
          :selected-element-id="store.selectedElementId"
          @select="store.select($event ?? null)"
        />
      </div>
    </div>
  </main>
</template>
