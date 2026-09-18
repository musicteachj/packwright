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
  NUTRIENTS,
  NUTRITION_FORMATS,
  DUAL_COLUMN_BASES,
  printedPercentDailyValue,
  DAILY_VALUE_POPULATIONS,
  dailyValuePopulationOf,
  roundNutrientAmount,
  US_FOOD_ELEMENTS,
  US_FOOD_INGREDIENTS_EXEMPTIONS,
  US_FOOD_NUTRITION_EXEMPTIONS,
  US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE,
  UNIT_CONTAINER_STATEMENTS,
  UNIT_CONTAINER_WORDINGS,
  US_FOOD_EGG_CARTON_PRESENTATIONS,
  US_FOOD_EGG_CARTON_PRESENTED,
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
  type DualColumnBasis,
  type IngredientThresholdPercent,
  type NutritionFormat,
  type MajorFoodAllergenId,
  type NutrientId,
  type UsFoodIngredientsExemptionKind,
  type UsFoodUnitContainerExemption,
  type UsFoodEggCartonExemption,
  type UsFoodEggCartonPresentation,
  type UnitContainerWording,
  type DailyValuePopulation,
} from '@packwright/label-core'
import { computed, ref } from 'vue'
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
 * The exemptions by the paragraph that grants them. Named here for the picker; the
 * rules hold what each one leaves unchecked, and say it on the finding.
 */
const INGREDIENTS_EXEMPTION_NAMES: Record<(typeof US_FOOD_INGREDIENTS_EXEMPTIONS)[number], string> =
  {
    assortment: '§ 101.100(a)(1) — assortment, with a statement of what may be present',
    'bulk-at-retail': '§ 101.100(a)(2) — received in bulk, displayed at retail',
  }

const NUTRITION_EXEMPTION_NAMES: Record<(typeof US_FOOD_NUTRITION_EXEMPTIONS)[number], string> = {
  'small-business': '§ 101.9(j)(1) — direct sales to consumers, low annual sales',
  'food-service': '§ 101.9(j)(2) — restaurants and other food service',
  'retail-prepared': '§ 101.9(j)(3) — prepared and sold in one retail establishment',
  'insignificant-nutrients': '§ 101.9(j)(4) — insignificant amounts of every nutrient',
  'medical-food': '§ 101.9(j)(8) — medical food',
  'bulk-for-manufacture': '§ 101.9(j)(9) — shipped in bulk, not for consumers',
  'raw-produce-or-fish': '§ 101.9(j)(10) — raw fruit, vegetables or fish',
  'custom-processed-fish-or-game': '§ 101.9(j)(11)(ii) — custom processed fish or game meat',
  'small-package': '§ 101.9(j)(13)(i) — package under 12 in², with a line to ask',
  'egg-carton': '§ 101.9(j)(14) — egg carton, information beneath the lid or in an insert',
  'unit-container': '§ 101.9(j)(15) — unit of a multiunit package, marked not for retail sale',
  'bulk-at-retail': '§ 101.9(j)(16) — sold from bulk containers',
  'low-volume': '§ 101.9(j)(18) — low-volume product of a small business',
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

/**
 * The § 101.100 paragraph claimed, `''` for none. A label saved with the old bare
 * flag reads `'unstated'` until a paragraph is picked — which clears the flag, so a
 * document never carries both answers to one question.
 */
const ingredientsExemption = computed({
  get: () => data.ingredientsExemption?.kind ?? (data.ingredientsExempt === true ? 'unstated' : ''),
  set: (next: string) => {
    if (next === 'unstated') return
    delete data.ingredientsExempt
    if (next === '') delete data.ingredientsExemption
    else if (next === 'assortment') {
      data.ingredientsExemption = { kind: 'assortment', statement: '', mayBePresent: [] }
    } else {
      data.ingredientsExemption = {
        kind: next as Exclude<UsFoodIngredientsExemptionKind, 'assortment'>,
      }
    }
  },
})

/** The assortment's statement and names, where that is the exemption claimed. */
const assortment = () =>
  data.ingredientsExemption?.kind === 'assortment' ? data.ingredientsExemption : undefined

const assortmentStatement = computed({
  get: () => assortment()?.statement ?? '',
  set: (next: string) => {
    const claimed = assortment()
    if (claimed !== undefined) claimed.statement = next
  },
})

/**
 * The names the statement must carry, typed as one comma-separated field. Bound lazily,
 * so the list is rewritten when the field is left rather than on every keystroke — which
 * would swallow a trailing comma the moment it was typed.
 */
const assortmentNames = computed({
  get: () => (assortment()?.mayBePresent ?? []).join(', '),
  set: (next: string) => {
    const claimed = assortment()
    if (claimed === undefined) return
    claimed.mayBePresent = next
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '')
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

/**
 * The Nutrition Facts panel.
 *
 * The amounts are what the food contains; everything the panel *prints* derives
 * from them unless stated. That split is what lets a wrong panel exist at all,
 * so the overrides are offered rather than hidden — behind one toggle, because
 * three inputs on every one of fifteen rows is not a form anyone reads.
 */
/** The 101.9(j) paragraph claimed, read and written as `ingredientsExemption` is. */
const nutritionExemption = computed({
  get: () =>
    data.nutritionExemption?.kind ?? (data.nutritionFactsExempt === true ? 'unstated' : ''),
  set: (next: string) => {
    if (next === 'unstated') return
    delete data.nutritionFactsExempt
    if (next === '') delete data.nutritionExemption
    else if (next === 'small-package') {
      // No area is seeded. The label stock is not the package, and any figure put here
      // would grant the exemption to a package nobody measured — so it starts blank,
      // and the rule says the claim has not been shown to qualify until one is typed.
      data.nutritionExemption = {
        kind: 'small-package',
        availableSurfaceSqInches: Number.NaN,
        contactLine: '',
      }
    } else if (next === 'egg-carton') {
      // The information moves beneath the lid and is kept, so the panel's figures are
      // left as they are: nothing here clears them, and the rules still judge them.
      data.nutritionExemption = { kind: 'egg-carton', presentedIn: 'beneath-lid' }
    } else if (next === 'unit-container') {
      // The statement as the paragraph writes it; the other two wordings are offered beside it.
      data.nutritionExemption = { kind: 'unit-container', wording: 'retail' }
    } else {
      data.nutritionExemption = {
        kind: next as (typeof US_FOOD_NUTRITION_EXEMPTIONS_CLAIMED_ALONE)[number],
      }
    }
  },
})

const hasPanel = computed({
  get: () => data.nutritionFacts !== undefined,
  set: (on: boolean) => {
    if (on) data.nutritionFacts = { servingSize: '', amounts: {} }
    else delete data.nutritionFacts
  },
})

const panelRows = NUTRIENTS

const amountOf = (id: NutrientId): number | '' => data.nutritionFacts?.amounts[id] ?? ''

function setAmount(id: NutrientId, raw: string): void {
  const facts = data.nutritionFacts
  if (facts === undefined) return
  if (raw.trim() === '') delete facts.amounts[id]
  else facts.amounts[id] = Number(raw)
}

/**
 * The second column's figures, which have to be typed.
 *
 * There is no "×2" button and there will not be one. Multiplying the serving
 * amounts by the servings per container is arithmetic this tool has no business
 * doing on a labeller's behalf — the same call the SI net quantity gets — and
 * 101.9(c) rounds each declared amount in its own right, so a derived column
 * would be wrong at every half-gram boundary.
 *
 * Without these fields the checkbox above produced a panel that declared two
 * columns and drew one, which the engine now reports rather than clearing.
 */
function secondAmountOf(id: NutrientId): number | undefined {
  return data.nutritionFacts?.columns?.secondAmounts?.[id]
}

function setSecondAmount(id: NutrientId, raw: string): void {
  const columns = data.nutritionFacts?.columns
  if (columns === undefined) return
  const amounts = { ...(columns.secondAmounts ?? {}) }
  if (raw.trim() === '') delete amounts[id]
  else amounts[id] = Number(raw)
  columns.secondAmounts = amounts
}

/** What the second column prints in its % Daily Value cells, where it states its own. */
const secondPercentOf = (id: NutrientId): number | '' =>
  data.nutritionFacts?.columns?.secondPercentDv?.[id] ?? ''

function setSecondPercent(id: NutrientId, raw: string): void {
  const columns = data.nutritionFacts?.columns
  if (columns === undefined) return
  const stated = { ...(columns.secondPercentDv ?? {}) }
  if (raw.trim() === '') delete stated[id]
  else stated[id] = Number(raw)
  if (Object.keys(stated).length === 0) delete columns.secondPercentDv
  else columns.secondPercentDv = stated
}

/** What the panel will print, so the form shows the rounding as it happens. */
const printedAmount = (id: NutrientId): string => {
  const facts = data.nutritionFacts
  if (facts === undefined) return ''
  const stated = facts.declaredAmounts?.[id]
  if (stated !== undefined) return String(stated)
  const analysed = facts.amounts[id]
  return analysed === undefined ? '' : String(roundNutrientAmount(id, analysed))
}

const printedPercent = (id: NutrientId): string => {
  const facts = data.nutritionFacts
  if (facts === undefined) return ''
  const stated = facts.declaredPercentDv?.[id]
  if (stated !== undefined) return `${stated}%`
  const printed = printedAmount(id)
  if (printed === '') return ''
  // The same function the renderer uses, so this column says what the panel
  // beside it will actually print. Spelled separately it showed Protein at 10%
  // against a panel that prints none, which 101.9(d)(7)(ii) permits it to omit.
  const value = printedPercentDailyValue(id, Number(printed), dailyValuePopulationOf(facts))
  return value === undefined ? '—' : `${value}%`
}

const showOverrides = ref(false)

function setOverride(
  kind: 'declaredAmounts' | 'declaredPercentDv',
  id: NutrientId,
  raw: string,
): void {
  const facts = data.nutritionFacts
  if (facts === undefined) return
  const existing = facts[kind] ?? {}
  if (raw.trim() === '') delete existing[id]
  else existing[id] = Number(raw)
  if (Object.keys(existing).length === 0) delete facts[kind]
  else facts[kind] = existing
}

const overrideOf = (kind: 'declaredAmounts' | 'declaredPercentDv', id: NutrientId): number | '' =>
  data.nutritionFacts?.[kind]?.[id] ?? ''

/**
 * A multiplier on every size in the panel. Every figure in 101.9(d) is a
 * minimum, so a panel drawn from them complies by construction — shrinking it is
 * how a real one goes wrong, and the only way the type-size rule can fail.
 */
/**
 * A number field whose blank means "unset" rather than a number.
 *
 * `v-model.number` runs Vue's `looseToNumber`, which hands back the **string**
 * when `parseFloat` returns NaN — so clearing the box writes `''` into the
 * document. Bound straight through, that string reached the API, where
 * `z.number()` rejected the whole label with a raw 400, and reached the engine,
 * where it drew " servings per container" with a hole where the count goes.
 *
 * A 400 on Export for a cleared optional field is the same defect as the
 * `min(1)`s this stage removed, arriving by a different route: the user is told
 * the request is malformed when what they did was decline to state something the
 * regulation lets them omit. 101.9(d)(3)(i) excuses the servings count outright
 * on a single-serving container, and an absent `netQuantityFontSizeMm` means the
 * engine derives the size 101.7(i) requires.
 *
 * `typeScalePercent` has carried a guard for this since the panel was drawn at
 * zero-size type; these are the other two optional numbers in the rail. The
 * container and stock dimensions are **not** included: they are required, so a
 * blank has no defined meaning there, and deciding what one should do is a
 * separate question from this one.
 */
const optionalNumber = <T extends object, K extends keyof T>(target: () => T | undefined, key: K) =>
  computed({
    get: () => target()?.[key] as number | undefined,
    set: (next: number | undefined) => {
      const object = target()
      if (object === undefined) return
      if (typeof next !== 'number' || !Number.isFinite(next)) delete object[key]
      else object[key] = next as T[K]
    },
  })

/**
 * A required dimension, kept a number even when the box is empty.
 *
 * `v-model.number` hands back the original string when `parseFloat` gives NaN, so
 * clearing a box wrote `''` into a field the type declares as `number`. That is a
 * type lie, and this removes it: a blank becomes `NaN`, which is a number and is
 * not a measurement.
 *
 * **It is not a false clearance, and `BACKLOG.md` said it was.** That entry
 * claimed the empty string multiplied out to a zero-area panel and cleared every
 * 101.7 rule on the strength of a 0.0 in² package. The arithmetic is real — `''
 * * 240` is `0` and `isNetQuantityZoneRequired(0)` is `0 > 5`, which is false —
 * and the path is not: `assertContainerDrawable` reaches the container first, and
 * `Number.isFinite('')` is `false` because it does not coerce. The label never
 * resolved, so no rule ever ran. Running it says so plainly: layout `null`, zero
 * findings, "Container panel width must be a positive finite number".
 *
 * The entry was written from reading the predicate rather than from running the
 * path, and it said so approvingly. So this is worth having for the type alone,
 * and worth none of the urgency it was given.
 *
 * The getter hands back `undefined` rather than `NaN` so the input renders empty
 * rather than showing the word.
 */
const requiredNumber = <T extends object, K extends keyof T>(target: () => T | undefined, key: K) =>
  computed({
    get: () => {
      const value = target()?.[key] as number | undefined
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined
    },
    set: (next: number | undefined) => {
      const object = target()
      if (object === undefined) return
      object[key] = (typeof next === 'number' && Number.isFinite(next) ? next : NaN) as T[K]
    },
  })

/**
 * The container dimensions 21 CFR 101.1 computes a panel area from. Each is
 * required — a blank has no meaning the regulation recognises — so each goes
 * through `requiredNumber` rather than `v-model.number`.
 */
/**
 * Narrowed per shape rather than cast with `as never`.
 *
 * `data.container` is a discriminated union, so no single key is a key of every
 * member and `as never` was silencing that — which also silenced the check that
 * the key exists at all: rename `widthMm` on the rectangular member and the old
 * form still compiled, writing a dead property while the engine refused the
 * layout. The narrowing below keeps `K extends keyof T` doing its job, and each
 * accessor returns `undefined` when the container is not the shape that has the
 * field, which is exactly when its input is not rendered.
 */
const shaped = <S extends Container['shape']>(shape: S) =>
  data.container.shape === shape ? (data.container as Extract<Container, { shape: S }>) : undefined

const panelWidthMm = requiredNumber(() => shaped('rectangular'), 'widthMm')
const panelHeightMm = requiredNumber(
  () => shaped('rectangular') ?? shaped('cylindrical'),
  'heightMm',
)
const containerCircumferenceMm = requiredNumber(() => shaped('cylindrical'), 'circumferenceMm')

/** The small package's particulars, where that is the exemption claimed. */
const smallPackage = () =>
  data.nutritionExemption?.kind === 'small-package' ? data.nutritionExemption : undefined

const smallPackageAreaSqInches = requiredNumber(smallPackage, 'availableSurfaceSqInches')

const smallPackageContactLine = computed({
  get: () => smallPackage()?.contactLine ?? '',
  set: (next: string) => {
    const claimed = smallPackage()
    if (claimed !== undefined) claimed.contactLine = next
  },
})

/** The unit container's particulars, where that is the exemption claimed. */
const unitContainer = (): UsFoodUnitContainerExemption | undefined =>
  data.nutritionExemption?.kind === 'unit-container' ? data.nutritionExemption : undefined

/** The egg carton's particulars, where that is the exemption claimed. */
const eggCarton = (): UsFoodEggCartonExemption | undefined =>
  data.nutritionExemption?.kind === 'egg-carton' ? data.nutritionExemption : undefined

/** Where (j)(14) has the carton's nutrition information presented. */
const eggCartonPresentedIn = computed({
  get: (): UsFoodEggCartonPresentation => eggCarton()?.presentedIn ?? 'beneath-lid',
  set: (next: UsFoodEggCartonPresentation) => {
    const claimed = eggCarton()
    if (claimed !== undefined) claimed.presentedIn = next
  },
})

/** Which of (j)(15)(iii)'s three wordings the unit bears. */
const unitContainerWording = computed({
  get: (): UnitContainerWording => unitContainer()?.wording ?? 'retail',
  set: (next: UnitContainerWording) => {
    const claimed = unitContainer()
    if (claimed !== undefined) claimed.wording = next
  },
})
const containerSurfaceAreaSqMm = requiredNumber(() => shaped('other'), 'totalSurfaceAreaSqMm')

const servingsPerContainer = optionalNumber(() => data.nutritionFacts, 'servingsPerContainer')
const netQuantityFontSizeMm = optionalNumber(() => data, 'netQuantityFontSizeMm')

const typeScalePercent = computed({
  get: () => Math.round((data.nutritionFacts?.typeScale ?? 1) * 100),
  set: (percent: number) => {
    const facts = data.nutritionFacts
    if (facts === undefined) return
    // An emptied number field arrives as `''`, and `'' / 100` is 0 — which drew
    // the whole panel at zero-size type. A blank means "no scale", not "none".
    if (!Number.isFinite(percent) || percent <= 0 || percent === 100) delete facts.typeScale
    else facts.typeScale = percent / 100
  },
})

/**
 * The Nutrition Facts display, and the facts that decide which one a package may
 * use.
 *
 * Everything here was unreachable from the editor until now: the tabular and
 * linear displays, the dual column, and the areas and declarations the
 * entitlement turns on. A rule nobody can provoke from the app is a rule nobody
 * has seen work, and "preview == print" is a claim about displays a user can
 * actually select.
 *
 * Two of these are facts about a package that no artwork shows — whether its
 * shape can take a vertical column, and whether its label will take a tabular
 * one — so they are declared here as checkboxes rather than inferred, which is
 * the call `fda/nutritionFormats.ts` records making.
 */
const FORMAT_NAMES: Record<NutritionFormat, string> = {
  vertical: 'Standard vertical — 101.9(d)(12)',
  tabular: 'Tabular — 101.9(d)(11) or (j)(13)(ii)(A)(1)',
  linear: 'Linear — 101.9(j)(13)(ii)(A)(2)',
}

const BASIS_NAMES: Record<DualColumnBasis, string> = {
  'as-prepared': 'As packaged and as prepared — (e)',
  combination: 'Common combination of foods — (e), (h)(4)',
  'per-unit-measure': 'A different unit, e.g. per 100 g — (e)',
  'rdi-groups': 'Two groups with RDIs — (e)(5)',
  'per-cup-popped': 'Per cup popped — (b)(10)(iii)',
  'per-container': 'Per serving and per container — (b)(12)(i)',
  'per-unit': 'Per serving and per unit — (b)(2)(i)(D)',
}

/**
 * Whom the food is represented or purported to be for, by the columns of the Daily Value
 * tables. Named from those columns' own headings in 21 CFR 101.9(c)(8)(iv) and (c)(9).
 */
const DAILY_VALUE_POPULATION_NAMES: Record<DailyValuePopulation, string> = {
  'adults-and-children-4-plus': 'Adults and children 4 years and older',
  'children-1-through-3': 'Children 1 through 3 years',
}

const representedFor = computed({
  get: (): DailyValuePopulation =>
    data.nutritionFacts?.representedFor ?? 'adults-and-children-4-plus',
  set: (next: DailyValuePopulation) => {
    const facts = data.nutritionFacts
    if (facts === undefined) return
    // Omitted means adults and children 4 or more years, as (c)(8)(i)'s "all other foods"
    // does, so choosing that group clears the field rather than writing the default back.
    if (next === 'adults-and-children-4-plus') delete facts.representedFor
    else facts.representedFor = next
  },
})

const displayFormat = computed({
  get: (): NutritionFormat => data.nutritionFacts?.format ?? 'vertical',
  set: (next: NutritionFormat) => {
    const facts = data.nutritionFacts
    if (facts === undefined) return
    // Omitted means vertical, so selecting it clears the field rather than
    // writing the default back into the document.
    if (next === 'vertical') delete facts.format
    else facts.format = next
  },
})

const availableSurfaceSqInches = optionalNumber(
  () => data.nutritionFacts,
  'availableSurfaceSqInches',
)
const continuousVerticalSpaceInches = optionalNumber(
  () => data.nutritionFacts,
  'continuousVerticalSpaceInches',
)

const declaredFact = (key: 'cannotAccommodateVertical' | 'cannotAccommodateTabular') =>
  computed({
    get: () => data.nutritionFacts?.[key] === true,
    set: (on: boolean) => {
      const facts = data.nutritionFacts
      if (facts === undefined) return
      if (on) facts[key] = true
      else delete facts[key]
    },
  })

const cannotAccommodateVertical = declaredFact('cannotAccommodateVertical')
const cannotAccommodateTabular = declaredFact('cannotAccommodateTabular')

/**
 * The four facts 101.9(b)(12)(i) and (b)(2)(i)(D) turn on.
 *
 * Until these had inputs, `us-food/dual-column-required` could not fire for
 * anyone working in the browser — the one rule in the set that reports a label
 * for *omitting* a required display, silent on every label built here, because
 * the facts it reads had no way in. The type and the API schema carried them
 * all along; only the rail did not.
 *
 * **A blank is not a zero and not a no.** Each of these deletes its key when
 * cleared, so the duty reads as undetermined rather than as answered — §101.12(b)'s
 * reference amounts are not carried here, so a figure nobody stated is a question
 * this tool has not asked.
 */
/**
 * A figure has to be one of these before it goes in the document.
 *
 * Zero and negatives are not measurements, and writing one is worse than
 * leaving the field blank: the engine cannot divide by it, so the duty it
 * governs reads as *answered* rather than as unasked. The API schema refuses
 * them too, so a document carrying one also fails to save.
 */
const asMeasurement = (next: unknown): number | undefined =>
  typeof next === 'number' && Number.isFinite(next) && next > 0 ? next : undefined

/**
 * The unit chosen before there is a record to put it in.
 *
 * The select is shown from the start, so somebody picking millilitres and then
 * typing the figure would otherwise have their choice silently replaced by the
 * default when the record was created. Found by review.
 */
const pendingReferenceUnit = ref<'g' | 'mL'>('g')

const referenceAmount = computed({
  get: () => data.nutritionFacts?.referenceAmount?.amount,
  set: (next: number | undefined) => {
    const facts = data.nutritionFacts
    if (facts === undefined) return
    const amount = asMeasurement(next)
    if (amount === undefined) {
      delete facts.referenceAmount
      return
    }
    // The three travel together, so entering an amount creates the whole record
    // rather than leaving a half-built one the type says is complete.
    facts.referenceAmount = {
      unit: pendingReferenceUnit.value,
      category: '',
      ...facts.referenceAmount,
      amount,
    }
  },
})

const referenceAmountUnit = computed({
  get: (): 'g' | 'mL' => data.nutritionFacts?.referenceAmount?.unit ?? pendingReferenceUnit.value,
  set: (next: 'g' | 'mL') => {
    pendingReferenceUnit.value = next
    const record = data.nutritionFacts?.referenceAmount
    if (record !== undefined) record.unit = next
  },
})

const referenceAmountCategory = computed({
  get: () => data.nutritionFacts?.referenceAmount?.category ?? '',
  set: (next: string) => {
    const record = data.nutritionFacts?.referenceAmount
    if (record !== undefined) record.category = next
  },
})

const contentFigure = (key: 'packageContent' | 'unitContent') =>
  computed({
    get: () => data.nutritionFacts?.[key],
    set: (next: number | undefined) => {
      const facts = data.nutritionFacts
      if (facts === undefined) return
      const measured = asMeasurement(next)
      if (measured === undefined) delete facts[key]
      else facts[key] = measured
    },
  })

const packageContent = contentFigure('packageContent')
const unitContent = contentFigure('unitContent')

/**
 * Three states, not two, and the third is the point.
 *
 * A checkbox can only say "yes" or say nothing, and saying nothing is what left
 * every browser-built label with an unanswerable duty. "No" is a real answer —
 * a multi-serving box is not packaged and sold individually, and (b)(12)(i)
 * does not reach it — and it is a different answer from having not said.
 */
const SOLD_INDIVIDUALLY = ['unstated', 'yes', 'no'] as const
type SoldIndividually = (typeof SOLD_INDIVIDUALLY)[number]

const SOLD_INDIVIDUALLY_NAMES: Record<SoldIndividually, string> = {
  unstated: 'Not stated',
  yes: 'Yes — packaged and sold individually',
  no: 'No',
}

const packagedAndSoldIndividually = computed({
  get: (): SoldIndividually => {
    const stated = data.nutritionFacts?.packagedAndSoldIndividually
    return stated === undefined ? 'unstated' : stated ? 'yes' : 'no'
  },
  set: (next: SoldIndividually) => {
    const facts = data.nutritionFacts
    if (facts === undefined) return
    if (next === 'unstated') delete facts.packagedAndSoldIndividually
    else facts.packagedAndSoldIndividually = next === 'yes'
  },
})

const hasSecondColumn = computed({
  get: () => data.nutritionFacts?.columns?.mode === 'dual',
  set: (on: boolean) => {
    const facts = data.nutritionFacts
    if (facts === undefined) return
    if (on)
      facts.columns = {
        mode: 'dual',
        basis: 'per-container',
        headings: ['Per serving', 'Per container'],
      }
    else delete facts.columns
  },
})

const columnBasis = computed({
  get: (): DualColumnBasis => data.nutritionFacts?.columns?.basis ?? 'per-container',
  set: (next: DualColumnBasis) => {
    const columns = data.nutritionFacts?.columns
    if (columns !== undefined) columns.basis = next
  },
})

const columnHeading = (index: 0 | 1) =>
  computed({
    get: () => data.nutritionFacts?.columns?.headings?.[index] ?? '',
    set: (next: string) => {
      const columns = data.nutritionFacts?.columns
      if (columns === undefined) return
      const current = columns.headings ?? ['', '']
      columns.headings = index === 0 ? [next, current[1]] : [current[0], next]
    },
  })

const firstHeading = columnHeading(0)
const secondHeading = columnHeading(1)

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
            v-model.number="panelWidthMm"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
        <label :class="LABEL" for="field-food-panel-height">
          Panel height (mm)
          <input
            id="field-food-panel-height"
            v-model.number="panelHeightMm"
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
            v-model.number="panelHeightMm"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
        <label :class="LABEL" for="field-food-circumference">
          Circumference (mm)
          <input
            id="field-food-circumference"
            v-model.number="containerCircumferenceMm"
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
            v-model.number="containerSurfaceAreaSqMm"
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
          v-model.number="netQuantityFontSizeMm"
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
      :status="
        ingredientsExemption !== '' && ingredientsExemption !== 'assortment'
          ? 'exempt'
          : `${ingredients.length} listed`
      "
      @select="select"
    >
      <label :class="LABEL" for="field-food-ing-exemption">
        Exemption from ingredient labelling
        <select id="field-food-ing-exemption" v-model="ingredientsExemption" :class="INPUT">
          <option value="">None claimed</option>
          <option v-if="ingredientsExemption === 'unstated'" value="unstated">
            Exempt — paragraph not stated
          </option>
          <option v-for="(name, value) in INGREDIENTS_EXEMPTION_NAMES" :key="value" :value="value">
            {{ name }}
          </option>
        </select>
      </label>
      <template v-if="ingredientsExemption === 'assortment'">
        <label :class="LABEL" for="field-food-ing-assortment-statement">
          Statement of other ingredients that may be present
          <input
            id="field-food-ing-assortment-statement"
            v-model="assortmentStatement"
            :class="INPUT"
            type="text"
          />
        </label>
        <label :class="LABEL" for="field-food-ing-may-be-present">
          Ingredients it must name, separated by commas
          <input
            id="field-food-ing-may-be-present"
            v-model.lazy="assortmentNames"
            :class="INPUT"
            type="text"
          />
        </label>
        <p class="text-chrome-400 text-xs">
          § 101.100(a)(1) exempts an assortment from listing the ingredients not common to every
          package, on the condition that the label bears a statement naming the others which may be
          present. The list below holds the ingredients common to all packages. The statement is
          printed as typed; the regulation asks only that it be as informative as practicable and
          not misleading.
        </p>
      </template>
      <p
        v-if="ingredientsExemption !== '' && ingredientsExemption !== 'assortment'"
        class="text-chrome-400 text-xs"
      >
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
      title="Nutrition Facts"
      :element-id="US_FOOD_ELEMENTS.nutritionPanel"
      :selected-element-id="store.selectedElementId"
      :status="nutritionExemption !== '' ? 'exempt' : hasPanel ? 'present' : 'none'"
      @select="select"
    >
      <label :class="LABEL" for="field-food-nf-exemption">
        Exemption from nutrition labelling
        <select id="field-food-nf-exemption" v-model="nutritionExemption" :class="INPUT">
          <option value="">None claimed</option>
          <option v-if="nutritionExemption === 'unstated'" value="unstated">
            Exempt — paragraph not stated
          </option>
          <option v-for="(name, value) in NUTRITION_EXEMPTION_NAMES" :key="value" :value="value">
            {{ name }}
          </option>
        </select>
      </label>

      <template v-if="nutritionExemption === 'small-package'">
        <label :class="LABEL" for="field-food-nf-small-area">
          Package surface available to bear labeling (in²)
          <input
            id="field-food-nf-small-area"
            v-model.number="smallPackageAreaSqInches"
            :class="INPUT"
            type="number"
            min="0.1"
            step="0.1"
          />
        </label>
        <label :class="LABEL" for="field-food-nf-contact">
          Line for obtaining the nutrition information
          <input
            id="field-food-nf-contact"
            v-model="smallPackageContactLine"
            :class="INPUT"
            type="text"
            placeholder="For nutrition information, call 1-800-123-4567"
          />
        </label>
        <p class="text-chrome-400 text-xs">
          21 CFR 101.9(j)(13)(i) exempts a package with less than 12 in² of total surface available
          to bear labeling — the package, not this label — on the condition that the label bears an
          address or telephone number a consumer can use to obtain the nutrition information. Typed
          as it should print; the placeholder is the regulation's own example.
        </p>
      </template>

      <template v-if="nutritionExemption === 'egg-carton'">
        <label :class="LABEL" for="field-food-nf-egg-location">
          Where the nutrition information is presented
          <select id="field-food-nf-egg-location" v-model="eggCartonPresentedIn" :class="INPUT">
            <option
              v-for="presentation in US_FOOD_EGG_CARTON_PRESENTATIONS"
              :key="presentation"
              :value="presentation"
            >
              {{ US_FOOD_EGG_CARTON_PRESENTED[presentation] }}
            </option>
          </select>
        </label>
        <p class="text-chrome-400 text-xs">
          21 CFR 101.9(j)(14) exempts shell eggs in a carton whose top lid conforms to the shape of
          the eggs from outer carton label requirements, where the required nutrition information is
          clearly presented immediately beneath the lid or in an insert that can be clearly seen
          when the carton is opened. The information moves rather than going away: it is declared
          below, and its figures are judged, but no panel is drawn on the outer carton. Where and
          how it is presented is not checked.
        </p>
      </template>

      <template v-if="nutritionExemption === 'unit-container'">
        <label :class="LABEL" for="field-food-nf-unit-wording">
          Statement the unit bears
          <select id="field-food-nf-unit-wording" v-model="unitContainerWording" :class="INPUT">
            <option v-for="wording in UNIT_CONTAINER_WORDINGS" :key="wording" :value="wording">
              {{ UNIT_CONTAINER_STATEMENTS[wording] }}
            </option>
          </select>
        </label>
        <p class="text-chrome-400 text-xs">
          21 CFR 101.9(j)(15) exempts the unit containers of a multiunit retail package whose
          labeling carries the nutrition information, where the units are securely enclosed and not
          intended to be separated, and each is labeled "This Unit Not Labeled For Retail Sale" in
          type not less than 1/16 inch high — "individual" may stand in lieu of or before "Retail".
          The statement is the regulation's own words, printed where the panel would sit and
          measured; the two conditions on the outer package are not checked.
        </p>
      </template>

      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-nf-present">
        <input id="field-food-nf-present" v-model="hasPanel" type="checkbox" />
        The label bears a Nutrition Facts panel
      </label>

      <template v-if="data.nutritionFacts">
        <label :class="LABEL" for="field-food-nf-serving">
          Serving size
          <input
            id="field-food-nf-serving"
            v-model="data.nutritionFacts.servingSize"
            :class="INPUT"
            type="text"
            placeholder="1/2 cup (40g)"
          />
        </label>
        <label :class="LABEL" for="field-food-nf-servings">
          Servings per container
          <input
            id="field-food-nf-servings"
            v-model.number="servingsPerContainer"
            :class="INPUT"
            type="number"
            min="1"
          />
        </label>
        <label :class="LABEL" for="field-food-nf-represented-for">
          Represented or purported to be for
          <select id="field-food-nf-represented-for" v-model="representedFor" :class="INPUT">
            <option
              v-for="population in DAILY_VALUE_POPULATIONS"
              :key="population"
              :value="population"
            >
              {{ DAILY_VALUE_POPULATION_NAMES[population] }}
            </option>
          </select>
        </label>
        <p v-if="representedFor === 'children-1-through-3'" class="text-chrome-400 text-xs">
          21 CFR 101.9(c)(8)(i) labels a food for children 1 through 3 against that group's Daily
          Values, and (d)(9) substitutes "1,000 calories" in its footnote. Both follow this choice.
          Its protein percentage, which (c)(7)(i) requires, is not calculated: state it among the
          printed figures below. The rules check that it is printed, not its value.
        </p>

        <p class="text-chrome-400 text-xs">
          The amounts are what the food contains. What the panel prints is rounded from them by 21
          CFR 101.9(c), and the percentages by (d)(7)(ii) and (c)(8)(iii) — two different rules on
          one column.
        </p>

        <div
          v-for="entry in panelRows"
          :key="entry.id"
          class="border-chrome-800 flex items-end gap-1 border-b pb-1"
        >
          <label :class="LABEL" class="flex-1" :for="`field-food-nf-${entry.id}`">
            {{ entry.name }}
            <input
              :id="`field-food-nf-${entry.id}`"
              :value="amountOf(entry.id)"
              :class="INPUT"
              type="number"
              step="0.1"
              min="0"
              @input="setAmount(entry.id, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label
            v-if="data.nutritionFacts.columns"
            :class="LABEL"
            class="w-24"
            :for="`field-food-nf2-${entry.id}`"
          >
            <span class="sr-only">{{ entry.name }}, second column</span>
            <input
              :id="`field-food-nf2-${entry.id}`"
              :value="secondAmountOf(entry.id)"
              :class="INPUT"
              type="number"
              step="any"
              @input="setSecondAmount(entry.id, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <p
            :data-testid="`field-food-nf-readout-${entry.id}`"
            class="text-chrome-400 numeric w-24 pb-2 text-right text-xs"
          >
            {{ printedAmount(entry.id) }}{{ entry.id === 'calories' ? '' : entry.unit }}
            <span class="text-chrome-300">{{ printedPercent(entry.id) }}</span>
          </p>
        </div>

        <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-nf-override">
          <input id="field-food-nf-override" v-model="showOverrides" type="checkbox" />
          Print figures other than the ones derived
        </label>

        <template v-if="showOverrides">
          <p class="text-chrome-400 text-xs">
            What the panel says, where it differs from what the food contains. This is how a panel
            that rounds wrongly or shows the wrong percentage gets drawn — and reported.
          </p>
          <div v-for="entry in panelRows" :key="`ovr-${entry.id}`" class="flex items-end gap-1">
            <label :class="LABEL" class="flex-1" :for="`field-food-nf-amt-${entry.id}`">
              <span class="sr-only">{{ entry.name }} as printed</span>
              <input
                :id="`field-food-nf-amt-${entry.id}`"
                :value="overrideOf('declaredAmounts', entry.id)"
                :class="INPUT"
                type="number"
                step="0.1"
                :placeholder="`${entry.name} as printed`"
                @input="
                  setOverride(
                    'declaredAmounts',
                    entry.id,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label :class="LABEL" class="w-20" :for="`field-food-nf-dv-${entry.id}`">
              <span class="sr-only">{{ entry.name }} percent Daily Value as printed</span>
              <input
                :id="`field-food-nf-dv-${entry.id}`"
                :value="overrideOf('declaredPercentDv', entry.id)"
                :class="INPUT"
                type="number"
                placeholder="% DV"
                @input="
                  setOverride(
                    'declaredPercentDv',
                    entry.id,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label
              v-if="data.nutritionFacts.columns"
              :class="LABEL"
              class="w-20"
              :for="`field-food-nf2-dv-${entry.id}`"
            >
              <span class="sr-only">
                {{ entry.name }} percent Daily Value as printed, second column
              </span>
              <input
                :id="`field-food-nf2-dv-${entry.id}`"
                :value="secondPercentOf(entry.id)"
                :class="INPUT"
                type="number"
                placeholder="% DV, 2nd"
                @input="setSecondPercent(entry.id, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
        </template>

        <label :class="LABEL" for="field-food-nf-scale">
          Panel type size (% of the minimum)
          <input
            id="field-food-nf-scale"
            v-model.number="typeScalePercent"
            :class="INPUT"
            type="number"
            min="10"
            max="300"
            step="5"
          />
        </label>
        <p class="text-chrome-400 text-xs">
          Every size in 101.9(d) is a minimum, so anything under 100% puts the panel below one.
        </p>
      </template>
    </EditorSection>

    <EditorSection
      v-if="data.nutritionFacts"
      title="Nutrition Facts display"
      :element-id="US_FOOD_ELEMENTS.nutritionPanel"
      :selected-element-id="store.selectedElementId"
      @select="select"
    >
      <label :class="LABEL" for="field-food-nf-format">
        Display
        <select id="field-food-nf-format" v-model="displayFormat" :class="INPUT">
          <option v-for="value in NUTRITION_FORMATS" :key="value" :value="value">
            {{ FORMAT_NAMES[value] }}
          </option>
        </select>
      </label>

      <label :class="LABEL" for="field-food-nf-area">
        Surface available to bear labeling (in²)
        <input
          id="field-food-nf-area"
          v-model.number="availableSurfaceSqInches"
          :class="INPUT"
          type="number"
          min="0"
          step="0.1"
        />
        <span class="text-chrome-400 numeric text-xs">
          101.9(j)(13) measures the whole package, not the 101.1 principal display panel. The two
          are different numbers answering different questions.
        </span>
      </label>

      <label :class="LABEL" for="field-food-nf-vertical-space">
        Continuous vertical space for the panel (in)
        <input
          id="field-food-nf-vertical-space"
          v-model.number="continuousVerticalSpaceInches"
          :class="INPUT"
          type="number"
          min="0"
          step="0.1"
        />
        <span class="text-chrome-400 numeric text-xs">
          Under 101.9(d)(11)(iii), less than approximately 3 in entitles a package of any size to
          the tabular display.
        </span>
      </label>

      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-nf-no-vert">
        <input id="field-food-nf-no-vert" v-model="cannotAccommodateVertical" type="checkbox" />
        The package shape or size cannot take a standard vertical column
      </label>

      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-nf-no-tab">
        <input id="field-food-nf-no-tab" v-model="cannotAccommodateTabular" type="checkbox" />
        The label will not take a tabular display
      </label>

      <p class="text-chrome-400 text-xs">
        A package holding 200 to 300 percent of its reference amount must carry a second column
        under 21 CFR 101.9(b)(12)(i), and one whose individual unit does under (b)(2)(i)(D). Those
        figures are not checked against §101.12(b)'s table, which this tool does not carry — state
        them and the check runs; leave them blank and it cannot.
      </p>

      <div class="flex gap-2">
        <label :class="LABEL" class="flex-1" for="field-food-nf-racc">
          Reference amount
          <input
            id="field-food-nf-racc"
            v-model.number="referenceAmount"
            :class="INPUT"
            min="0"
            step="any"
            type="number"
          />
        </label>
        <label :class="LABEL" for="field-food-nf-racc-unit">
          Unit
          <select id="field-food-nf-racc-unit" v-model="referenceAmountUnit" :class="INPUT">
            <option value="g">g</option>
            <option value="mL">mL</option>
          </select>
        </label>
      </div>

      <label v-if="data.nutritionFacts.referenceAmount" :class="LABEL" for="field-food-nf-racc-cat">
        Reference amount category
        <input
          id="field-food-nf-racc-cat"
          v-model="referenceAmountCategory"
          :class="INPUT"
          placeholder="the §101.12(b) row this figure comes from"
          type="text"
        />
      </label>

      <div class="flex gap-2">
        <label :class="LABEL" class="flex-1" for="field-food-nf-package-content">
          The whole package holds
          <input
            id="field-food-nf-package-content"
            v-model.number="packageContent"
            :class="INPUT"
            min="0"
            step="any"
            type="number"
          />
        </label>
        <label :class="LABEL" class="flex-1" for="field-food-nf-unit-content">
          One individual unit holds
          <input
            id="field-food-nf-unit-content"
            v-model.number="unitContent"
            :class="INPUT"
            min="0"
            step="any"
            type="number"
          />
        </label>
      </div>

      <label :class="LABEL" for="field-food-nf-sold-individually">
        Packaged and sold individually
        <select
          id="field-food-nf-sold-individually"
          v-model="packagedAndSoldIndividually"
          :class="INPUT"
        >
          <option v-for="value in SOLD_INDIVIDUALLY" :key="value" :value="value">
            {{ SOLD_INDIVIDUALLY_NAMES[value] }}
          </option>
        </select>
      </label>

      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-food-nf-dual">
        <input id="field-food-nf-dual" v-model="hasSecondColumn" type="checkbox" />
        The panel carries a second column of values
      </label>

      <template v-if="data.nutritionFacts.columns">
        <label :class="LABEL" for="field-food-nf-basis">
          What the second column counts
          <select id="field-food-nf-basis" v-model="columnBasis" :class="INPUT">
            <option v-for="value in DUAL_COLUMN_BASES" :key="value" :value="value">
              {{ BASIS_NAMES[value] }}
            </option>
          </select>
        </label>

        <div class="flex gap-2">
          <label :class="LABEL" class="flex-1" for="field-food-nf-heading-0">
            First column heading
            <input id="field-food-nf-heading-0" v-model="firstHeading" :class="INPUT" type="text" />
          </label>
          <label :class="LABEL" class="flex-1" for="field-food-nf-heading-1">
            Second column heading
            <input
              id="field-food-nf-heading-1"
              v-model="secondHeading"
              :class="INPUT"
              type="text"
            />
          </label>
        </div>
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
