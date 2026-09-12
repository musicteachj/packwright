<script setup lang="ts">
/**
 * The US food label's form.
 *
 * **The package is declared separately from the label.** Every other rail in
 * this editor has one geometry, the stock. Here the minimum type size keys off
 * the area of the package's principal display panel, which 21 CFR 101.1
 * computes differently for a carton, a bottle and a wedge of cheese — so the
 * container is its own section, and changing its shape changes the requirement
 * without changing a millimetre of the artwork.
 *
 * **The requirement is shown, not just enforced.** The panel area and the letter
 * height it demands update as the container is typed, both read from
 * `label-core` rather than restated here. A regulatory figure written out twice
 * is one that drifts silently, and this rail would go on quoting 3/16 inch after
 * the table had been corrected.
 *
 * **The form can express a wrong label**, the same way the GHS rail lets both
 * signal words be ticked. Type size is derived by default and overridable, and
 * the declaration can be anchored anywhere on the panel — so 101.7(i) and
 * 101.7(f) are enforced by rules that report, rather than by a form that
 * prevents.
 */
import {
  ANCHORS,
  US_FOOD_ELEMENTS,
  US_FOOD_PACKAGINGS,
  US_FOOD_TYPE_DEFAULT,
  fontSizeMmForGlyphHeight,
  mm,
  minNetQuantityTypeHeightMm,
  netQuantityGlyphBasis,
  pdpAreaSqInches,
  type Anchor,
  type Container,
  type ContainerShape,
} from '@packwright/label-core'
import { computed } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorSection from './EditorSection.vue'
import { INPUT, LABEL } from './formStyles'

const store = useLabelDocumentStore()
const data = store.foodData
const select = (elementId: string) => store.select(elementId)

const SHAPE_NAMES: Record<ContainerShape, string> = {
  rectangular: 'Rectangular — one face is the panel',
  cylindrical: 'Cylindrical — 40% of height × circumference',
  other: 'Other shape — 40% of total surface',
}

const PACKAGING_NAMES: Record<(typeof US_FOOD_PACKAGINGS)[number], string> = {
  standard: 'Standard — both measurement systems required',
  random: 'Random weight — SI declaration optional',
  'packaged-at-retail': 'Packaged at the retail store — SI does not apply',
}

/**
 * Swapping shape replaces the whole container rather than merging fields.
 *
 * The three shapes are a discriminated union and carry different dimensions;
 * keeping a stale `circumferenceMm` around after a switch to rectangular would
 * leave the document describing two containers at once. The replacements start
 * from the label's own size so the panel stays plausible across a switch.
 */
const shape = computed({
  get: () => data.container.shape,
  set: (next: ContainerShape) => {
    const { widthMm, heightMm } = store.foodStock
    const replacement: Container =
      next === 'rectangular'
        ? { shape: 'rectangular', widthMm, heightMm }
        : next === 'cylindrical'
          ? { shape: 'cylindrical', heightMm, circumferenceMm: widthMm * 3 }
          : { shape: 'other', totalSurfaceAreaSqMm: widthMm * heightMm * 2 }
    data.container = replacement
  },
})

const panelSqInches = computed(() => pdpAreaSqInches(data.container))

/** 21 CFR 101.7(i), read from the table rather than restated in this rail. */
const requiredLetterMm = computed(() =>
  minNetQuantityTypeHeightMm(panelSqInches.value, data.markingMethod ?? 'printed'),
)

/**
 * Formatted with the same helper the findings use, not with `toFixed`.
 *
 * 3/16 inch is 4.7625 mm, which in binary lands a hair *below* the boundary two-
 * decimal rounding turns on — so `toFixed(3)` printed "4.762 mm" here while the
 * finding alongside it said "4.76 mm" for the identical number. A user reading
 * a tool whose whole claim is that it measures accurately would see two answers.
 * `mm()` collapses that noise before rounding, which is why it exists.
 */
const requiredLetterText = computed(() => mm(requiredLetterMm.value))

/** 21 CFR 101.7(h)(2) — which letter that height is measured on. */
const glyphBasis = computed(() =>
  netQuantityGlyphBasis(
    [data.netQuantity.inchPound, data.netQuantity.metric].filter(Boolean).join(' '),
  ),
)

const measuredLetter = computed(() =>
  glyphBasis.value === 'lowercase-o' ? 'the lowercase “o”' : 'capital letters',
)

/**
 * The em that makes this label comply — what the engine derives when the size is
 * left alone, and therefore what taking the size by hand must start from.
 *
 * Seeding the field with `requiredLetterMm` instead put a *letter height* into a
 * field that holds an *em*: ticking the box on a compliant label wrote 4.76 mm
 * and immediately reported the declaration at 54% of the minimum. That is the
 * exact conflation this whole stage exists to remove, reintroduced one layer up.
 */
const compliantFontSizeMm = computed(() =>
  fontSizeMmForGlyphHeight(
    requiredLetterMm.value,
    US_FOOD_TYPE_DEFAULT.fontFamily,
    glyphBasis.value,
  ),
)

const molded = computed({
  get: () => data.markingMethod === 'blown-embossed-or-molded',
  set: (on: boolean) => {
    if (on) data.markingMethod = 'blown-embossed-or-molded'
    else delete data.markingMethod
  },
})

/**
 * The SI declaration is typed, never generated.
 *
 * This was a checkbox that wrote `(340 g)` when ticked — so `NET WT 5 LB` gained
 * a metric half that was simply false, and the dual-declaration rule passed it.
 * Converting 5 lb to grams is arithmetic this tool has no business doing on the
 * user's behalf and no way of getting audited on; a wrong conversion printed
 * confidently is worse than a missing one the rule reports. Empty means absent,
 * which is a violation the rule states rather than something the form fills in.
 */
const metric = computed({
  get: () => data.netQuantity.metric ?? '',
  set: (next: string) => {
    if (next.trim() === '') delete data.netQuantity.metric
    else data.netQuantity.metric = next
  },
})

/**
 * Off, the engine derives the size 101.7(i) requires and the label complies. On,
 * whatever is typed is drawn — which is the only way to produce the undersized
 * declaration the type-size rule exists to report.
 */
const overrideTypeSize = computed({
  get: () => data.netQuantityFontSizeMm !== undefined,
  set: (on: boolean) => {
    if (on) data.netQuantityFontSizeMm = Number(compliantFontSizeMm.value.toFixed(2))
    else delete data.netQuantityFontSizeMm
  },
})

const anchor = computed({
  get: (): Anchor => data.netQuantityAnchor ?? 'bottom-centre',
  set: (next: Anchor) => {
    data.netQuantityAnchor = next
  },
})

const packaging = computed({
  get: () => data.netQuantity.packaging ?? 'standard',
  set: (next: (typeof US_FOOD_PACKAGINGS)[number]) => {
    if (next === 'standard') delete data.netQuantity.packaging
    else data.netQuantity.packaging = next
  },
})
</script>

<template>
  <div>
    <EditorSection
      title="Product"
      :element-id="US_FOOD_ELEMENTS.statementOfIdentity"
      :selected-element-id="store.selectedElementId"
      @select="select"
    >
      <label :class="LABEL" for="field-food-identity">
        Statement of identity
        <input
          id="field-food-identity"
          v-model="data.statementOfIdentity"
          :class="INPUT"
          type="text"
        />
      </label>
      <p class="text-chrome-400 text-xs">
        What the food is, under 21 CFR 101.3. The net quantity must stand clear of it.
      </p>
    </EditorSection>

    <EditorSection
      title="Package"
      :element-id="US_FOOD_ELEMENTS.principalDisplayPanel"
      :selected-element-id="store.selectedElementId"
      @select="select"
    >
      <label :class="LABEL" for="field-food-shape">
        Container shape
        <select id="field-food-shape" v-model="shape" :class="INPUT">
          <option v-for="(name, value) in SHAPE_NAMES" :key="value" :value="value">
            {{ name }}
          </option>
        </select>
      </label>

      <template v-if="data.container.shape === 'rectangular'">
        <label :class="LABEL" for="field-food-panel-width">
          Panel width (mm)
          <input
            id="field-food-panel-width"
            v-model.number="data.container.widthMm"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
        <label :class="LABEL" for="field-food-panel-height">
          Panel height (mm)
          <input
            id="field-food-panel-height"
            v-model.number="data.container.heightMm"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
      </template>

      <template v-else-if="data.container.shape === 'cylindrical'">
        <label :class="LABEL" for="field-food-cylinder-height">
          Container height (mm)
          <input
            id="field-food-cylinder-height"
            v-model.number="data.container.heightMm"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
        <label :class="LABEL" for="field-food-circumference">
          Circumference (mm)
          <input
            id="field-food-circumference"
            v-model.number="data.container.circumferenceMm"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
      </template>

      <template v-else>
        <label :class="LABEL" for="field-food-surface">
          Total surface area (mm²)
          <input
            id="field-food-surface"
            v-model.number="data.container.totalSurfaceAreaSqMm"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
      </template>

      <p class="text-chrome-400 text-xs">
        Principal display panel
        <span class="text-chrome-200 numeric">{{ panelSqInches.toFixed(2) }} in²</span>
        — 21 CFR 101.7(i) requires
        <span class="text-chrome-200 numeric">{{ requiredLetterText }}</span>
        measured on {{ measuredLetter }}.
      </p>
    </EditorSection>

    <EditorSection
      title="Net quantity"
      :element-id="US_FOOD_ELEMENTS.netQuantity"
      :selected-element-id="store.selectedElementId"
      @select="select"
    >
      <label :class="LABEL" for="field-food-inch-pound">
        Inch/pound declaration
        <input
          id="field-food-inch-pound"
          v-model="data.netQuantity.inchPound"
          :class="INPUT"
          type="text"
          placeholder="NET WT 12 OZ"
        />
      </label>

      <label :class="LABEL" for="field-food-metric">
        SI metric declaration
        <input
          id="field-food-metric"
          v-model="metric"
          :class="INPUT"
          type="text"
          placeholder="(340 g)"
        />
      </label>
      <p class="text-chrome-400 text-xs">
        Typed, not converted. Working out the equivalent is the labeller's job — this tool will not
        author half of a regulated statement.
      </p>

      <label :class="LABEL" for="field-food-packaging">
        How the package is put up
        <select id="field-food-packaging" v-model="packaging" :class="INPUT">
          <option v-for="(name, value) in PACKAGING_NAMES" :key="value" :value="value">
            {{ name }}
          </option>
        </select>
      </label>
      <p class="text-chrome-400 text-xs">
        Both measurement systems are required by the Fair Packaging and Labeling Act, 15 U.S.C.
        1453(a)(2) — not by 21 CFR 101, which was never amended to ask for the metric half.
      </p>
    </EditorSection>

    <EditorSection
      title="Declaration type"
      :element-id="US_FOOD_ELEMENTS.netQuantity"
      :selected-element-id="store.selectedElementId"
      :scroll-on-select="false"
      @select="select"
    >
      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-molded">
        <input id="field-food-molded" v-model="molded" type="checkbox" />
        Blown, embossed or molded into the surface
      </label>
      <p class="text-chrome-400 text-xs">
        Adds one sixteenth of an inch to the minimum, under the closing sentence of 21 CFR 101.7(i).
      </p>

      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-override-type">
        <input id="field-food-override-type" v-model="overrideTypeSize" type="checkbox" />
        Set the type size by hand
      </label>

      <label v-if="overrideTypeSize" :class="LABEL" for="field-food-type-size">
        Type size, em (mm)
        <input
          id="field-food-type-size"
          v-model.number="data.netQuantityFontSizeMm"
          :class="INPUT"
          type="number"
          min="0.1"
          step="0.1"
        />
      </label>
      <p v-else class="text-chrome-400 text-xs">
        Derived from the panel area, so the label complies as drawn.
      </p>

      <label :class="LABEL" for="field-food-anchor">
        Placement on the panel
        <select id="field-food-anchor" v-model="anchor" :class="INPUT">
          <option v-for="value in ANCHORS" :key="value" :value="value">{{ value }}</option>
        </select>
      </label>
      <p class="text-chrome-400 text-xs">
        21 CFR 101.7(f) wants the declaration in the bottom 30% of the panel, on all but the
        smallest packages.
      </p>
    </EditorSection>

    <EditorSection title="Stock" :selected-element-id="store.selectedElementId" @select="select">
      <label :class="LABEL" for="field-food-width">
        Width (mm)
        <input
          id="field-food-width"
          v-model.number="store.foodStock.widthMm"
          :class="INPUT"
          type="number"
          min="1"
        />
      </label>
      <label :class="LABEL" for="field-food-height">
        Height (mm)
        <input
          id="field-food-height"
          v-model.number="store.foodStock.heightMm"
          :class="INPUT"
          type="number"
          min="1"
        />
      </label>
      <label :class="LABEL" for="field-food-margin">
        Margin (mm)
        <input
          id="field-food-margin"
          v-model.number="store.foodStock.marginMm"
          :class="INPUT"
          type="number"
          min="0"
        />
      </label>
    </EditorSection>
  </div>
</template>
