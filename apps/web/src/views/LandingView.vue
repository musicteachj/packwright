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
import {
  DEFAULT_GHS_STOCK,
  DEFAULT_UPC_A_STOCK,
  DEFAULT_US_FOOD_STOCK,
  layOutGhsLabel,
  layOutUpcALabel,
  layOutUsFoodLabel,
} from '@packwright/label-core'
import LabelCanvas from '../components/LabelCanvas.vue'
import SiteHeader from '../components/SiteHeader.vue'
import { BUTTON, PAGE, PAGE_INNER } from '../components/chrome'
import { FOOD_SAMPLE, GHS_SAMPLE } from './landingSamples'

const GTIN = '036000291452'

const layout = computed(() =>
  layOutUpcALabel(bwip as never, {
    data: { gtin: GTIN },
    stock: DEFAULT_UPC_A_STOCK,
  }),
)

const ghsLayout = computed(() => layOutGhsLabel({ data: GHS_SAMPLE, stock: DEFAULT_GHS_STOCK }))
const foodLayout = computed(() =>
  layOutUsFoodLabel({ data: FOOD_SAMPLE, stock: DEFAULT_US_FOOD_STOCK }),
)

const gtin = computed(() => layout.value.symbols[0]?.value ?? '')
</script>

<template>
  <div :class="PAGE">
    <div :class="PAGE_INNER">
      <SiteHeader current="landing" />

      <main class="flex flex-col gap-12">
        <header class="flex flex-col gap-4">
          <p class="numeric text-chrome-400 text-xs tracking-widest uppercase">
            Packaging label compliance
          </p>
          <h1 class="text-3xl font-semibold tracking-tight">packwright</h1>
          <p class="text-chrome-300 max-w-2xl leading-relaxed">
            Print-accurate GS1 retail, GHS chemical and FDA food labels — with an engine that
            reports why a label is non-compliant and cites the regulation for every finding.
          </p>
        </header>

        <section class="flex flex-col gap-4">
          <h2 class="text-chrome-200 text-sm font-semibold tracking-wide uppercase">
            Three regimes, rendered live in this page
          </h2>
          <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
            None of the labels below is an image. The same three layout engines that produce the PDF
            exports run here in the browser — the retail one resolving
            <span class="numeric text-chrome-200">{{ gtin }}</span> to primitives positioned in
            millimetres, and handing them to the SVG renderer. Both renderers read the same
            geometry, so the preview cannot disagree with the print.
          </p>

          <div class="flex flex-col gap-2">
            <p class="text-chrome-400 text-xs">
              <span class="text-chrome-200 font-semibold">GS1 retail</span> — check digit, 80–200%
              magnification, quiet zones.
              <span class="text-chrome-400">GS1 General Specifications §5.2</span>
            </p>
            <LabelCanvas :layout="layout" :title="`UPC-A label for GTIN ${gtin}`" />
          </div>

          <div class="flex flex-col gap-2">
            <p class="text-chrome-400 text-xs">
              <span class="text-chrome-200 font-semibold">GHS chemical</span> — every H- and
              P-statement looked up from the reference tables rather than written out, so
              <span class="numeric text-chrome-200">H225</span> reads exactly as CLP publishes it.
              <span class="text-chrome-400">CLP Regulation (EC) 1272/2008, Annex III</span>
              <br />
              <span class="text-chrome-200">The pictogram frames are empty on purpose.</span> Annex
              V requires the symbols inside them to conform to published specimens, and those
              specimens could not be verified from an authoritative source — so the engine draws the
              frame, records the missing symbol as an omission, and declines to invent the artwork.
              A label is not finished until they are drawn; saying so is better than guessing.
            </p>
            <LabelCanvas
              :layout="ghsLayout"
              title="GHS chemical label for a five-litre solvent under EU CLP"
            />
          </div>

          <div class="flex flex-col gap-2">
            <p class="text-chrome-400 text-xs">
              <span class="text-chrome-200 font-semibold">FDA food</span> — Nutrition Facts
              typography, ingredient order, and an allergen the ingredient's own name does not give
              away.
              <span class="text-chrome-400">21 CFR 101.9</span>
            </p>
            <LabelCanvas
              :layout="foodLayout"
              title="FDA food label with a Nutrition Facts panel and allergen declarations"
            />
          </div>

          <RouterLink :class="[BUTTON, 'self-start px-4 py-2 text-sm']" to="/labels/new">
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
      </main>
    </div>
  </div>
</template>
