<script setup lang="ts">
/**
 * The canvas — the label, true-scale, on the neutral field.
 *
 * It renders the SVG `label-core` produced and does no geometry of its own. The
 * zoom control scales the *presentation* only: at 100% one CSS millimetre is one
 * real millimetre, which is what makes a printed page and the screen agree.
 *
 * The overlays are drawn into a second SVG sharing the first one's `viewBox`, so
 * an annotation sits in the same millimetre space as the thing it annotates and
 * stays registered at any zoom. They are apparatus, never artwork: nothing here
 * is in the exported PDF, and the label underneath is untouched.
 *
 * The paper is the artifact and everything else is apparatus, so the label sits
 * on a plain graphite field with crop marks at its corners and a dimension
 * callout beneath — the notation of a spec sheet rather than a card with a
 * shadow.
 */
import { computed, ref, useId } from 'vue'
import type { ElementId, ResolvedLayout } from '@packwright/label-core'
import { glyphHeightMm, mm, toSVG, UPC_A_HRI_DEFAULT, xDimensionMm } from '@packwright/label-core'
import CheckboxField from './ui/CheckboxField.vue'

const props = withDefaults(
  defineProps<{
    layout: ResolvedLayout
    /** Names the drawing for assistive technology. */
    title: string
    /** Outlined on the canvas, for the finding ↔ canvas ↔ form link. */
    highlightedElementId?: ElementId | null
    /** Hides the overlay toggles where the canvas is decorative, as on the landing page. */
    showOverlayControls?: boolean
  }>(),
  { highlightedElementId: null, showOverlayControls: false },
)

/**
 * `fit` is resolved in CSS rather than as a number, so the browser does the
 * arithmetic and the label stays crisp at any container size.
 */
type Zoom = 'fit' | 1 | 2

// Unconditionally `fit`, not "fit when it would overflow". A conditional
// default is harder to reason about than a constant one, 100% is one click
// away, and the case that matters — a 120mm food label on a 375px phone — is
// the one the editor opens on.
const zoom = ref<Zoom>('fit')
const ZOOMS: ReadonlyArray<{ value: Zoom; label: string }> = [
  { value: 'fit', label: 'Fit' },
  { value: 1, label: '100%' },
  { value: 2, label: '200%' },
]

/**
 * Seeded from whether the controls are offered at all.
 *
 * The overlays used to default on regardless, so the landing page — which shows
 * a label to make the point that it is a real one, and offers no toggles —
 * drew hatched bands across it that a reader had no way to remove.
 */
const showQuietZones = ref(props.showOverlayControls)
const showDimensions = ref(false)

const svg = computed(() => toSVG(props.layout, { title: props.title }))

/**
 * Unique per instance. A hardcoded id collides the moment two canvases share a
 * page, and the first one on the page wins every reference.
 */
const hatchId = `quiet-zone-hatch-${useId()}`

/**
 * Unique for the same reason as `hatchId`. These were hardcoded, so two canvases
 * sharing a page bound both sets of labels to the first one's checkboxes and the
 * second's overlays could not be toggled by their label at all.
 */
const quietZonesId = `overlay-quiet-zones-${useId()}`
const dimensionsId = `overlay-dimensions-${useId()}`

/**
 * At 100% the SVG's own `mm` dimensions are used untouched — that is the whole
 * point of emitting them. Only the fit case overrides, and only in width.
 *
 * **Fit shrinks; it never enlarges**, and it is `width: 100%` that does the
 * shrinking. The `maxWidth` never binds: `widthMm * 4` px is always more than
 * the SVG's own intrinsic width of `widthMm * 3.7795` px, for every label, so
 * the clamp sits above the content and the label draws at true scale wherever
 * there is room for it.
 *
 * Worth stating because the arithmetic invites the opposite reading. A review of
 * the change that made `fit` the default raised exactly that — 4 against 3.7795
 * is 5.8% over, so the desktop preview must now open at 106% and `preview ==
 * print` is broken. Running it says otherwise: measured at 1440, a 120 mm label
 * draws 453.55 px against a true 453.54. The cap is inert, not wrong.
 * `e2e/the-canvas-fits.spec.ts` pins the measurement so the next reader gets the
 * answer rather than the inference.
 */
const frameStyle = computed(() => {
  if (zoom.value === 'fit') return { width: '100%', maxWidth: `${props.layout.widthMm * 4}px` }
  return {
    width: `${props.layout.widthMm * zoom.value}mm`,
    height: `${props.layout.heightMm * zoom.value}mm`,
  }
})

/**
 * Formatted through `label-core`'s own helpers rather than `toFixed`.
 *
 * The rail uses them, and hand-rolling the same thing here reproduced exactly
 * the defect `collapseFloatNoise` exists to prevent: the caption read
 * "14.33 / 14.32 mm" for a symmetric label while the rail three inches away read
 * 14.33 for both.
 */
const dimensions = computed(() => `${mm(props.layout.widthMm)} × ${mm(props.layout.heightMm)}`)

const symbol = computed(() => props.layout.symbols[0])

const viewBox = computed(() => `0 0 ${props.layout.widthMm} ${props.layout.heightMm}`)

/** The box the engine allocated to the highlighted element, if there is one. */
const highlight = computed(() => {
  if (!props.highlightedElementId) return null
  return props.layout.elements.find((e) => e.elementId === props.highlightedElementId) ?? null
})

/**
 * The bands the specification requires to stay clear, either side of each bar
 * pattern — the requirement drawn where it applies. Whether this label actually
 * leaves them clear is the rule engine's answer, not the overlay's.
 */
const quietZoneBands = computed(() =>
  props.layout.symbols.flatMap((s) => [
    {
      key: `${s.elementId}-left`,
      xMm: s.xMm - s.requiredQuietZoneLeftMm,
      widthMm: s.requiredQuietZoneLeftMm,
      yMm: s.yMm,
      heightMm: s.drawnHeightMm,
    },
    {
      key: `${s.elementId}-right`,
      xMm: s.xMm + s.barPatternWidthMm,
      widthMm: s.requiredQuietZoneRightMm,
      yMm: s.yMm,
      heightMm: s.drawnHeightMm,
    },
  ]),
)

/**
 * Where a callout's figure sits, in the label's own millimetres.
 *
 * **The figure used to be drawn over the barcode's digits.** The rule went 2 mm
 * below the symbol and the figure 1.2 mm *above* the rule — but an SVG
 * `<text>`'s `y` is its baseline, so the glyphs reached back up into the band
 * the human-readable digits print in, and at 200% the figure read across
 * `36000` and `29145`. Found by screenshotting the preview; no test looked.
 *
 * So the figure is placed from where its ink starts rather than from its
 * baseline: clear of the symbol's drawn box by `CALLOUT_CLEARANCE_MM`, with
 * the ink's height taken from the engine's own measurement of Plex Mono's
 * capitals — digits stand that tall — rather than estimated here. The rule sits
 * under the figure, which is the engineering-drawing order of a dimension
 * line, and nothing in the figure descends below its baseline.
 */
const CALLOUT_FONT_MM = 1.8
const CALLOUT_CLEARANCE_MM = 0.6
const CALLOUT_BASELINE_TO_RULE_MM = 0.6
// Measured in the face the engine sets a symbol's digits in, which is also the
// mono face `numeric` gives this figure — named once, there, rather than
// spelled again here. `e2e/the-canvas-apparatus.spec.ts` checks the figure
// really does render in it, so the two cannot drift apart unnoticed.
const CALLOUT_INK_MM = glyphHeightMm(CALLOUT_FONT_MM, UPC_A_HRI_DEFAULT.fontFamily, 'cap-height')

/** A dimension callout under each symbol footprint, in engineering-drawing notation. */
const symbolCallouts = computed(() =>
  props.layout.symbols.map((s) => {
    const leftMm = s.xMm - s.requiredQuietZoneLeftMm
    const widthMm = s.requiredQuietZoneLeftMm + s.barPatternWidthMm + s.requiredQuietZoneRightMm
    const baselineMm = s.yMm + s.drawnHeightMm + CALLOUT_CLEARANCE_MM + CALLOUT_INK_MM
    return {
      key: s.elementId,
      leftMm,
      rightMm: leftMm + widthMm,
      baselineMm,
      yMm: baselineMm + CALLOUT_BASELINE_TO_RULE_MM,
      midMm: leftMm + widthMm / 2,
      label: mm(widthMm),
    }
  }),
)
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

      <!--
        Overlays. Same viewBox as the label, so one user unit is one millimetre
        here too and an annotation cannot drift from what it annotates.
        `aria-hidden` because every fact drawn here is also stated in words — in
        the findings rail and in the text-equivalent view.
      -->
      <svg
        class="pointer-events-none absolute inset-0 h-full w-full"
        :viewBox="viewBox"
        aria-hidden="true"
      >
        <defs>
          <!--
            The class belongs on the pattern, not on the group that references
            it. Pattern content inherits from its own DOM ancestors — `<defs>` —
            never from the element pointing at it via `fill="url(#…)"`, so the
            hatch was resolving `currentColor` to the body text colour and
            rendering near-white on paper at roughly 1.1:1. Ticking "Quiet zones"
            appeared to do nothing at all.
          -->
          <pattern
            :id="hatchId"
            class="text-notice"
            width="1.4"
            height="1.4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="1.4" stroke="currentColor" stroke-width="0.28" />
          </pattern>
        </defs>

        <g v-if="showQuietZones" opacity="0.55">
          <rect
            v-for="band in quietZoneBands"
            :key="band.key"
            :x="band.xMm"
            :y="band.yMm"
            :width="band.widthMm"
            :height="band.heightMm"
            :fill="`url(#${hatchId})`"
          />
        </g>

        <g v-if="showDimensions" class="text-chrome-600">
          <g v-for="callout in symbolCallouts" :key="callout.key">
            <line
              :x1="callout.leftMm"
              :y1="callout.yMm"
              :x2="callout.rightMm"
              :y2="callout.yMm"
              stroke="currentColor"
              stroke-width="0.12"
            />
            <line
              v-for="tick in [callout.leftMm, callout.rightMm]"
              :key="tick"
              :x1="tick"
              :y1="callout.yMm - 0.8"
              :x2="tick"
              :y2="callout.yMm + 0.8"
              stroke="currentColor"
              stroke-width="0.12"
            />
            <!--
              `numeric` rather than a `font-family` attribute: the class is the
              one place the mono face and tabular figures are declared together,
              and this is a live millimetre figure — the case that utility was
              written for. `font-size` stays an attribute because 1.8 is 1.8mm
              of the shared `viewBox`, and CSS `font-size` has no unitless form.
            -->
            <text
              :x="callout.midMm"
              :y="callout.baselineMm"
              class="numeric"
              :font-size="CALLOUT_FONT_MM"
              fill="currentColor"
              text-anchor="middle"
            >
              {{ callout.label }}
            </text>
          </g>
        </g>

        <!--
          Selection, not severity. Dashed and inset so it cannot be mistaken for
          the hatched quiet-zone band or read as a compliance colour — selection
          is transient interface state and says nothing about the label.
        -->
        <rect
          v-if="highlight"
          :x="highlight.box.xMm - 0.6"
          :y="highlight.box.yMm - 0.6"
          :width="highlight.box.widthMm + 1.2"
          :height="highlight.box.heightMm + 1.2"
          class="text-notice"
          fill="none"
          stroke="currentColor"
          stroke-width="0.35"
          stroke-dasharray="1.6 1"
        />
      </svg>
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

      <dl v-if="symbol" class="numeric text-chrome-400 flex flex-wrap justify-center gap-6 text-xs">
        <div class="flex gap-2">
          <dt>GTIN</dt>
          <dd class="text-chrome-200">{{ symbol.value }}</dd>
        </div>
        <div class="flex gap-2">
          <dt>X</dt>
          <dd class="text-chrome-200">{{ xDimensionMm(symbol.xDimensionMm) }}</dd>
        </div>
        <!--
          Clear space, not the requirement. `requiredQuietZoneLeftMm` is 9X and
          is true of every UPC-A ever drawn; what a reader wants to know is what
          this label actually leaves blank, which is the figure that can fail.
        -->
        <div class="flex gap-2">
          <dt>Clear space</dt>
          <dd class="text-chrome-200">
            {{ mm(symbol.clearSpaceLeftMm) }} / {{ mm(symbol.clearSpaceRightMm) }}
          </dd>
        </div>
        <div class="flex gap-2">
          <dt>Needs</dt>
          <dd class="text-chrome-200">{{ mm(symbol.requiredQuietZoneLeftMm) }}</dd>
        </div>
      </dl>

      <div class="flex flex-wrap items-center justify-center gap-6">
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

        <!--
          `CheckboxField`, which these were listed as getting in stage 1 and did
          not: that migration was scoped to the form rails. Measured as bare
          inputs, each was a 13×13 box in a 17px row with 0px between box and
          word — under WCAG 2.2's 24px target, and the shape the component
          exists to end everywhere else.
        -->
        <div v-if="showOverlayControls" class="flex items-center gap-4">
          <CheckboxField :id="quietZonesId" v-model="showQuietZones" label="Quiet zones" />
          <CheckboxField :id="dimensionsId" v-model="showDimensions" label="Dimensions" />
        </div>
      </div>
    </figcaption>
  </figure>
</template>
