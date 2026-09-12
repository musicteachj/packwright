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
  INGREDIENT_THRESHOLD_PERCENTS,
  MAJOR_FOOD_ALLERGENS,
  US_FOOD_ELEMENTS,
  US_FOOD_PACKAGINGS,
  US_FOOD_TYPE_DEFAULT,
  fontSizeMmForGlyphHeight,
  mm,
  minNetQuantityTypeHeightMm,
  regulatedGlyphBasis,
  pdpAreaSqInches,
  type Anchor,
  type Container,
  type ContainerShape,
  type IngredientThresholdPercent,
  type MajorFoodAllergenId,
} from '@packwright/label-core'
import { computed } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorSection from './EditorSection.vue'
import { CHIP, CHIP_REMOVE, INPUT, LABEL } from './formStyles'

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
  regulatedGlyphBasis(
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
    // Rounded *up*. `toFixed` rounds to nearest, so an all-caps declaration
    // needing 6.823066 mm was seeded at 6.82 and reported too small the instant
    // the box was ticked — the same "taking control of the size breaks a
    // compliant label" defect as before, reintroduced by two decimal places.
    if (on) data.netQuantityFontSizeMm = Math.ceil(compliantFontSizeMm.value * 100) / 100
    else delete data.netQuantityFontSizeMm
  },
})

const anchor = computed({
  get: (): Anchor => data.netQuantityAnchor ?? 'bottom-centre',
  set: (next: Anchor) => {
    data.netQuantityAnchor = next
  },
})

/**
 * Ingredients are stored in the order they are printed, and the weight beside
 * each is what makes the order checkable. A rail that only collected names would
 * be asking the user to assert descending predominance and then be unable to
 * test the assertion — 101.4(a)(1) would become a rule with nothing to run on.
 */
const ingredients = computed(() => data.ingredients ?? [])

function setIngredients(next: { name: string; percentByWeight: number }[]): void {
  if (next.length === 0) delete data.ingredients
  else data.ingredients = next
}

function addIngredient(): void {
  setIngredients([...ingredients.value.map((i) => ({ ...i })), { name: '', percentByWeight: 0 }])
}

function removeIngredient(index: number): void {
  const next = ingredients.value.filter((_, i) => i !== index).map((i) => ({ ...i }))
  setIngredients(next)
  // The grouped count has to come down with the list. Left alone it could cover
  // more entries than exist, which drew "INGREDIENTS: ." and left the order rule
  // examining nothing and calling it a pass.
  const grouped = data.ingredientThreshold?.count ?? 0
  if (grouped > next.length) groupedCount.value = next.length
}

/** Moving an entry is how a compliant list is made non-compliant, deliberately. */
function moveIngredient(index: number, by: number): void {
  const next = ingredients.value.map((i) => ({ ...i }))
  const target = index + by
  if (target < 0 || target >= next.length) return
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved!)
  setIngredients(next)
}

const groupedCount = computed({
  get: () => data.ingredientThreshold?.count ?? 0,
  set: (count: number) => {
    const percent = data.ingredientThreshold?.percent ?? 2
    // Bounded by the list itself: a statement cannot cover entries that are not
    // there, and a count past the end is a nonsense the engine should not draw.
    const bounded = Math.min(Math.max(0, count), ingredients.value.length)
    if (bounded <= 0) delete data.ingredientThreshold
    else data.ingredientThreshold = { percent, count: bounded }
  },
})

const thresholdPercent = computed({
  get: (): IngredientThresholdPercent => data.ingredientThreshold?.percent ?? 2,
  set: (percent: IngredientThresholdPercent) => {
    const count = data.ingredientThreshold?.count ?? 0
    if (count > 0) data.ingredientThreshold = { percent, count }
  },
})

const ingredientsExempt = computed({
  get: () => data.ingredientsExempt === true,
  set: (on: boolean) => {
    if (on) data.ingredientsExempt = true
    else delete data.ingredientsExempt
  },
})

/**
 * The firm, and the two facts about it that no inspection of a label can settle.
 * Both are ticked by the user and neither is inferred, the same call the GHS rail
 * makes about small-container labelling.
 */
const firm = computed(() => data.responsibleFirm)

const hasFirm = computed({
  get: () => data.responsibleFirm !== undefined,
  set: (on: boolean) => {
    if (on) {
      data.responsibleFirm = { name: '', isManufacturer: true, city: '', state: '' }
    } else delete data.responsibleFirm
  },
})

const qualifyingPhrase = computed({
  get: () => data.responsibleFirm?.qualifyingPhrase ?? '',
  set: (next: string) => {
    if (data.responsibleFirm === undefined) return
    if (next.trim() === '') delete data.responsibleFirm.qualifyingPhrase
    else data.responsibleFirm.qualifyingPhrase = next
  },
})

const streetAddress = computed({
  get: () => data.responsibleFirm?.streetAddress ?? '',
  set: (next: string) => {
    if (data.responsibleFirm === undefined) return
    if (next.trim() === '') delete data.responsibleFirm.streetAddress
    else data.responsibleFirm.streetAddress = next
  },
})

const zip = computed({
  get: () => data.responsibleFirm?.zip ?? '',
  set: (next: string) => {
    if (data.responsibleFirm === undefined) return
    if (next.trim() === '') delete data.responsibleFirm.zip
    else data.responsibleFirm.zip = next
  },
})

const streetInDirectory = computed({
  get: () => data.responsibleFirm?.streetAddressInDirectory === true,
  set: (on: boolean) => {
    if (data.responsibleFirm === undefined) return
    if (on) data.responsibleFirm.streetAddressInDirectory = true
    else delete data.responsibleFirm.streetAddressInDirectory
  },
})

/**
 * The allergen sits on the ingredient because it is a fact about the recipe, not
 * about the word. "Natural flavor" may carry milk protein and "cocoa butter"
 * carries no dairy at all, so no amount of reading the name settles it.
 */
function setAllergen(index: number, allergen: string): void {
  setIngredients(
    ingredients.value.map((entry, i) => {
      if (i !== index) return { ...entry }
      if (allergen === '') {
        const { allergen: _a, allergenSpecificType: _t, declareInline: _d, ...rest } = entry
        return rest
      }
      // The specific type belongs to the allergen that was there, not the one
      // arriving. Carried across, fish/"cod" followed by tree-nuts produced
      // `walnut pieces (cod)` — a fabricated food source name that the rule then
      // accepted, because as far as it could tell the label had declared one.
      const { allergenSpecificType: _stale, ...rest } = entry
      return { ...rest, allergen: allergen as MajorFoodAllergenId, declareInline: true }
    }),
  )
}

function setIngredientField(
  index: number,
  patch: Partial<(typeof ingredients.value)[number]>,
): void {
  setIngredients(
    ingredients.value.map((entry, i) => (i === index ? { ...entry, ...patch } : { ...entry })),
  )
}

const allergenOf = (index: number) => ingredients.value[index]?.allergen ?? ''

/** Whether §403(w)(2) wants a specific type or species for this ingredient. */
const needsSpecificType = (index: number): boolean =>
  MAJOR_FOOD_ALLERGENS.find((a) => a.id === ingredients.value[index]?.allergen)
    ?.requiresSpecificType === true

const specificTypeExamples = (index: number): string =>
  MAJOR_FOOD_ALLERGENS.find((a) => a.id === ingredients.value[index]?.allergen)?.examples.join(
    ', ',
  ) ?? ''

/**
 * What the "Contains" statement names, separate from what the recipe holds. The
 * two being separate is what lets a statement that omits an allergen be drawn —
 * the same split as the GHS rail's stated versus derived pictogram set.
 */
const containsStatement = computed(() => data.containsStatement ?? [])

function toggleContains(id: MajorFoodAllergenId, on: boolean): void {
  const next = on
    ? [...containsStatement.value, id]
    : containsStatement.value.filter((entry) => entry !== id)
  if (next.length === 0) delete data.containsStatement
  else data.containsStatement = next
}

/**
 * The allergens the recipe carries, **plus any the statement still names**.
 *
 * Offering only the former made an orphaned id unrecoverable: clear an
 * ingredient's allergen and its checkbox vanished while the id stayed in
 * `containsStatement`, so the statement went on naming something the user had no
 * control left over. A tickbox that cannot be unticked is worse than one that
 * should not have been there.
 */
const allergensPresent = computed(() =>
  MAJOR_FOOD_ALLERGENS.filter(
    (allergen) =>
      ingredients.value.some((entry) => entry.allergen === allergen.id) ||
      containsStatement.value.includes(allergen.id),
  ),
)

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

    <EditorSection
      title="Ingredients"
      :element-id="US_FOOD_ELEMENTS.ingredients"
      :selected-element-id="store.selectedElementId"
      :status="ingredientsExempt ? 'exempt' : `${ingredients.length} listed`"
      @select="select"
    >
      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-ing-exempt">
        <input id="field-food-ing-exempt" v-model="ingredientsExempt" type="checkbox" />
        Exempt from ingredient labelling under § 101.100
      </label>
      <p v-if="ingredientsExempt" class="text-chrome-400 text-xs">
        The statement is not required. Listing one anyway is allowed — and a list that is printed
        still runs in descending order, because a reader has no way of knowing it was voluntary.
      </p>

      <p class="text-chrome-400 text-xs">
        Listed in the order printed. The weight beside each is what makes that order checkable — 21
        CFR 101.4(a)(1) runs the statement in descending order of predominance by weight.
      </p>

      <div
        v-for="(ingredient, index) in ingredients"
        :key="index"
        class="border-chrome-800 flex items-end gap-1 border-b pb-2"
      >
        <label :class="LABEL" class="flex-1" :for="`field-food-ing-name-${index}`">
          <span class="sr-only">Ingredient {{ index + 1 }} name</span>
          <input
            :id="`field-food-ing-name-${index}`"
            :value="ingredient.name"
            :class="INPUT"
            type="text"
            placeholder="common or usual name"
            @input="
              setIngredients(
                ingredients.map((entry, i) =>
                  i === index
                    ? { ...entry, name: ($event.target as HTMLInputElement).value }
                    : { ...entry },
                ),
              )
            "
          />
        </label>
        <label :class="LABEL" class="w-20" :for="`field-food-ing-pct-${index}`">
          <span class="sr-only">Ingredient {{ index + 1 }} percent by weight</span>
          <input
            :id="`field-food-ing-pct-${index}`"
            :value="ingredient.percentByWeight"
            :class="INPUT"
            type="number"
            min="0"
            max="100"
            step="0.1"
            @input="
              setIngredients(
                ingredients.map((entry, i) =>
                  i === index
                    ? {
                        ...entry,
                        percentByWeight: Number(($event.target as HTMLInputElement).value),
                      }
                    : { ...entry },
                ),
              )
            "
          />
        </label>
        <button
          :class="CHIP_REMOVE"
          type="button"
          :aria-label="`Move ${ingredient.name || 'ingredient ' + (index + 1)} up`"
          @click="moveIngredient(index, -1)"
        >
          ↑
        </button>
        <button
          :class="CHIP_REMOVE"
          type="button"
          :aria-label="`Move ${ingredient.name || 'ingredient ' + (index + 1)} down`"
          @click="moveIngredient(index, 1)"
        >
          ↓
        </button>
        <button
          :class="CHIP_REMOVE"
          type="button"
          :aria-label="`Remove ${ingredient.name || 'ingredient ' + (index + 1)}`"
          @click="removeIngredient(index)"
        >
          ×
        </button>
      </div>

      <div v-for="(ingredient, index) in ingredients" :key="`allergen-${index}`">
        <label :class="LABEL" :for="`field-food-ing-allergen-${index}`">
          <span class="sr-only">
            Major food allergen in {{ ingredient.name || `ingredient ${index + 1}` }}
          </span>
          <select
            :id="`field-food-ing-allergen-${index}`"
            :value="allergenOf(index)"
            :class="INPUT"
            @change="setAllergen(index, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              {{ ingredient.name || `Ingredient ${index + 1}` }} — no major food allergen
            </option>
            <option
              v-for="allergen in MAJOR_FOOD_ALLERGENS"
              :key="allergen.id"
              :value="allergen.id"
            >
              {{ ingredient.name || `Ingredient ${index + 1}` }} — {{ allergen.name }}
            </option>
          </select>
        </label>

        <label
          v-if="needsSpecificType(index)"
          :class="LABEL"
          :for="`field-food-ing-source-${index}`"
        >
          Specific type or species
          <input
            :id="`field-food-ing-source-${index}`"
            :value="ingredient.allergenSpecificType ?? ''"
            :class="INPUT"
            type="text"
            :placeholder="specificTypeExamples(index)"
            @input="
              setIngredientField(index, {
                allergenSpecificType: ($event.target as HTMLInputElement).value,
              })
            "
          />
        </label>

        <label
          v-if="ingredient.allergen"
          class="text-chrome-300 flex items-center gap-2 text-xs"
          :for="`field-food-ing-inline-${index}`"
        >
          <input
            :id="`field-food-ing-inline-${index}`"
            type="checkbox"
            :checked="ingredient.declareInline === true"
            @change="
              setIngredientField(index, {
                declareInline: ($event.target as HTMLInputElement).checked,
              })
            "
          />
          Name the source in parentheses after this ingredient
        </label>
      </div>

      <button id="field-food-ing-add" :class="CHIP" type="button" @click="addIngredient">
        Add an ingredient
      </button>

      <label :class="LABEL" for="field-food-grouped">
        Entries grouped behind a quantifying statement
        <input
          id="field-food-grouped"
          v-model.number="groupedCount"
          :class="INPUT"
          type="number"
          min="0"
          :max="ingredients.length"
        />
      </label>

      <label v-if="groupedCount > 0" :class="LABEL" for="field-food-threshold">
        Threshold
        <select id="field-food-threshold" v-model.number="thresholdPercent" :class="INPUT">
          <option v-for="percent in INGREDIENT_THRESHOLD_PERCENTS" :key="percent" :value="percent">
            {{ percent }} percent or less
          </option>
        </select>
      </label>
      <p v-if="groupedCount > 0" class="text-chrome-400 text-xs">
        The last {{ groupedCount }} may run out of order, and none of them may exceed the threshold.
        101.4(a)(2) permits only these four figures.
      </p>
    </EditorSection>

    <EditorSection
      title="Contains statement"
      :element-id="US_FOOD_ELEMENTS.containsStatement"
      :selected-element-id="store.selectedElementId"
      :status="containsStatement.length === 0 ? 'none' : `${containsStatement.length} named`"
      @select="select"
    >
      <p v-if="allergensPresent.length === 0" class="text-chrome-400 text-xs">
        No ingredient declares a major food allergen, so there is nothing for a “Contains” statement
        to name.
      </p>
      <template v-else>
        <p class="text-chrome-400 text-xs">
          FD&amp;C Act §403(w)(1) takes either this or a parenthetical after the ingredient. What
          the recipe holds and what the statement names are separate, so a statement that leaves one
          out can be drawn — and reported.
        </p>
        <label
          v-for="allergen in allergensPresent"
          :key="allergen.id"
          class="text-chrome-300 flex items-center gap-2 text-xs"
          :for="`field-food-contains-${allergen.id}`"
        >
          <input
            :id="`field-food-contains-${allergen.id}`"
            type="checkbox"
            :checked="containsStatement.includes(allergen.id)"
            @change="toggleContains(allergen.id, ($event.target as HTMLInputElement).checked)"
          />
          {{ allergen.name }}
        </label>
      </template>
    </EditorSection>

    <EditorSection
      title="Responsible firm"
      :element-id="US_FOOD_ELEMENTS.responsibleFirm"
      :selected-element-id="store.selectedElementId"
      @select="select"
    >
      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-has-firm">
        <input id="field-food-has-firm" v-model="hasFirm" type="checkbox" />
        The label names a manufacturer, packer or distributor
      </label>

      <template v-if="firm">
        <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-is-mfr">
          <input id="field-food-is-mfr" v-model="firm.isManufacturer" type="checkbox" />
          This firm manufactured the food
        </label>

        <label v-if="!firm.isManufacturer" :class="LABEL" for="field-food-qualifier">
          Qualifying phrase
          <input
            id="field-food-qualifier"
            v-model="qualifyingPhrase"
            :class="INPUT"
            type="text"
            placeholder="Distributed by"
          />
        </label>
        <p v-if="!firm.isManufacturer" class="text-chrome-400 text-xs">
          Free text, because 101.5(c) permits “any other wording that expresses the facts”.
        </p>

        <label :class="LABEL" for="field-food-firm-name">
          Name
          <input id="field-food-firm-name" v-model="firm.name" :class="INPUT" type="text" />
        </label>
        <label :class="LABEL" for="field-food-street">
          Street address
          <input id="field-food-street" v-model="streetAddress" :class="INPUT" type="text" />
        </label>
        <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-directory">
          <input id="field-food-directory" v-model="streetInDirectory" type="checkbox" />
          The address is in a current city or telephone directory
        </label>
        <label :class="LABEL" for="field-food-city">
          City
          <input id="field-food-city" v-model="firm.city" :class="INPUT" type="text" />
        </label>
        <label :class="LABEL" for="field-food-state">
          State
          <input id="field-food-state" v-model="firm.state" :class="INPUT" type="text" />
        </label>
        <label :class="LABEL" for="field-food-zip">
          ZIP code
          <input id="field-food-zip" v-model="zip" :class="INPUT" type="text" />
        </label>
      </template>
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
