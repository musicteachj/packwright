<script setup lang="ts">
/**
 * The canvas — the label, true-scale, on the neutral field.
 *
 * It renders the SVG `label-core` produced and does no geometry of its own. The
 * zoom control scales the *presentation* only: at 100% one CSS millimetre is one
 * real millimetre, which is what makes a printed page and the screen agree.
 *
 * The paper is the artifact and everything else is apparatus, so the label sits
 * on a plain graphite field with crop marks at its corners and a dimension
 * callout beneath — the notation of a spec sheet rather than a card with a
 * shadow.
 */
import { computed, ref } from 'vue'
import type { ResolvedLayout } from '@packwright/label-core'
import { toSVG } from '@packwright/label-core'

const props = defineProps<{
  layout: ResolvedLayout
  /** Names the drawing for assistive technology. */
  title: string
}>()

/**
 * `fit` is resolved in CSS rather than as a number, so the browser does the
 * arithmetic and the label stays crisp at any container size.
 */
type Zoom = 'fit' | 1 | 2

const zoom = ref<Zoom>(1)
const ZOOMS: ReadonlyArray<{ value: Zoom; label: string }> = [
  { value: 'fit', label: 'Fit' },
  { value: 1, label: '100%' },
  { value: 2, label: '200%' },
]

const svg = computed(() => toSVG(props.layout, { title: props.title }))

/**
 * At 100% the SVG's own `mm` dimensions are used untouched — that is the whole
 * point of emitting them. Only the fit case overrides, and only in width.
 */
const frameStyle = computed(() => {
  if (zoom.value === 'fit') return { width: '100%', maxWidth: `${props.layout.widthMm * 4}px` }
  return {
    width: `${props.layout.widthMm * zoom.value}mm`,
    height: `${props.layout.heightMm * zoom.value}mm`,
  }
})

const dimensions = computed(
  () => `${props.layout.widthMm.toFixed(1)} × ${props.layout.heightMm.toFixed(1)} mm`,
)

const symbol = computed(() => props.layout.symbols[0])
</script>

<template>
  <!--
    The field the artboard floats on sits a step off the page, the way a design
    tool separates canvas from chrome. Without it the label reads as content in
    a document rather than as an artifact on a work surface.
  -->
  <figure class="bg-chrome-900 border-chrome-800 flex flex-col items-center gap-6 border p-10">
    <div class="relative" :style="frameStyle">
      <!--
        Crop marks. Four corners, hairline, sitting outside the trim — the
        printer's convention, and a quiet reminder that this is a physical thing
        with an edge.
      -->
      <span
        v-for="corner in [
          '-top-2 -left-2 border-t border-l',
          '-top-2 -right-2 border-t border-r',
          '-bottom-2 -left-2 border-b border-l',
          '-bottom-2 -right-2 border-b border-r',
        ]"
        :key="corner"
        :class="corner"
        class="border-chrome-600 pointer-events-none absolute h-3 w-3"
        aria-hidden="true"
      />
      <!--
        toSVG builds this string itself and escapes every value it interpolates —
        text, font family, element id and colour alike. Nothing from a label
        document reaches the DOM unescaped.

        A block disable rather than disable-next-line: the rule reports at the
        v-html attribute, not at the opening tag, so a next-line comment above
        the tag silently suppresses nothing and the warning stands.
      -->
      <!-- eslint-disable vue/no-v-html -->
      <div
        class="bg-paper h-full w-full shadow-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        v-html="svg"
      />
      <!-- eslint-enable vue/no-v-html -->
    </div>

    <!--
      Dimension callout — a rule with tick ends and a measurement, straight out
      of an engineering drawing. The app is about measuring things against a
      standard, so measurement notation is the house style.
    -->
    <figcaption class="flex flex-col items-center gap-3">
      <div class="text-chrome-400 flex items-center gap-2" aria-hidden="true">
        <span class="h-2 w-px bg-current" />
        <span class="h-px w-16 bg-current" />
        <span class="numeric text-chrome-300 text-xs">{{ dimensions }}</span>
        <span class="h-px w-16 bg-current" />
        <span class="h-2 w-px bg-current" />
      </div>

      <dl v-if="symbol" class="numeric text-chrome-400 flex gap-6 text-xs">
        <div class="flex gap-2">
          <dt>GTIN</dt>
          <dd class="text-chrome-200">{{ symbol.value }}</dd>
        </div>
        <div class="flex gap-2">
          <dt>X</dt>
          <dd class="text-chrome-200">{{ symbol.xDimensionMm.toFixed(3) }} mm</dd>
        </div>
        <div class="flex gap-2">
          <dt>Quiet zone</dt>
          <dd class="text-chrome-200">
            {{ symbol.quietZoneLeftMm.toFixed(2) }} / {{ symbol.quietZoneRightMm.toFixed(2) }} mm
          </dd>
        </div>
      </dl>

      <div class="flex items-center gap-px" role="group" aria-label="Zoom">
        <button
          v-for="option in ZOOMS"
          :key="String(option.value)"
          type="button"
          class="numeric border-chrome-700 text-chrome-300 hover:bg-chrome-800 focus-visible:outline-notice border px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          :class="zoom === option.value ? 'bg-chrome-800 text-chrome-100' : 'bg-chrome-900'"
          :aria-pressed="zoom === option.value"
          @click="zoom = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </figcaption>
  </figure>
</template>
