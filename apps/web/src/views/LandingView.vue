<script setup lang="ts">
/**
 * The landing view.
 *
 * It renders a real label through the real engine rather than showing a picture
 * of one — the same `layOutUpcALabel` the API export calls, in the browser, from
 * TypeScript source. That is the claim the project makes, so the front door
 * should demonstrate it rather than assert it.
 */
import { computed } from 'vue'
import * as bwip from 'bwip-js/generic'
import { DEFAULT_UPC_A_STOCK, layOutUpcALabel } from '@packwright/label-core'
import LabelCanvas from '../components/LabelCanvas.vue'

const GTIN = '036000291452'

const layout = computed(() =>
  layOutUpcALabel(bwip as never, {
    data: { gtin: GTIN },
    stock: DEFAULT_UPC_A_STOCK,
  }),
)

const gtin = computed(() => layout.value.symbols[0]?.value ?? '')
</script>

<template>
  <main class="bg-chrome-950 text-chrome-100 min-h-screen">
    <div class="mx-auto flex max-w-5xl flex-col gap-12 px-8 py-16">
      <header class="border-chrome-800 flex flex-col gap-4 border-b pb-8">
        <p class="numeric text-chrome-400 text-xs tracking-widest uppercase">
          Packaging label compliance
        </p>
        <h1 class="text-3xl font-semibold tracking-tight">packwright</h1>
        <p class="text-chrome-300 max-w-2xl leading-relaxed">
          Print-accurate GS1 retail, GHS chemical and FDA food labels — with an engine that reports
          why a label is non-compliant and cites the regulation for every finding.
        </p>
      </header>

      <section class="flex flex-col gap-4">
        <h2 class="text-chrome-200 text-sm font-semibold tracking-wide uppercase">
          Rendered live, in this page
        </h2>
        <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
          The label below is not an image. The same layout engine that produces the PDF export runs
          here in the browser, resolves
          <span class="numeric text-chrome-200">{{ gtin }}</span> to primitives positioned in
          millimetres, and hands them to the SVG renderer. Both renderers read the same geometry, so
          the preview cannot disagree with the print.
        </p>

        <LabelCanvas :layout="layout" :title="`UPC-A label for GTIN ${gtin}`" />

        <RouterLink
          class="border-chrome-700 bg-chrome-900 text-chrome-100 hover:bg-chrome-800 focus-visible:outline-notice self-start border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          to="/labels/new"
        >
          Open the editor →
        </RouterLink>
      </section>

      <section class="border-chrome-800 flex flex-col gap-4 border-t pt-8">
        <h2 class="text-chrome-200 text-sm font-semibold tracking-wide uppercase">
          Every dimension traced to a source
        </h2>
        <dl class="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <div class="border-chrome-700 flex flex-col gap-1 border-l pl-4">
            <dt class="text-chrome-400">X-dimension at nominal size</dt>
            <dd class="numeric text-chrome-100">0.330 mm</dd>
            <dd class="text-chrome-400 text-xs">GS1 General Specifications §5.2.3.1</dd>
          </div>
          <div class="border-chrome-700 flex flex-col gap-1 border-l pl-4">
            <dt class="text-chrome-400">UPC-A quiet zone</dt>
            <dd class="numeric text-chrome-100">9X either side</dd>
            <dd class="text-chrome-400 text-xs">Figure 5.2.3.4-1</dd>
          </div>
          <div class="border-chrome-700 flex flex-col gap-1 border-l pl-4">
            <dt class="text-chrome-400">Symbol length</dt>
            <dd class="numeric text-chrome-100">113 modules — 37.29 mm</dd>
            <dd class="text-chrome-400 text-xs">Figure 5.2.3.5-1, quiet zones included</dd>
          </div>
          <div class="border-chrome-700 flex flex-col gap-1 border-l pl-4">
            <dt class="text-chrome-400">Bar height at nominal</dt>
            <dd class="numeric text-chrome-100">22.85 mm</dd>
            <dd class="text-chrome-400 text-xs">§5.2.3.2, scaling with magnification</dd>
          </div>
        </dl>
      </section>
    </div>
  </main>
</template>
