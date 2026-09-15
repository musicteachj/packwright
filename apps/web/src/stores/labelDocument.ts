/**
 * The label being edited.
 *
 * In memory only. Persistence and `/labels/:id` are a later phase, and standing
 * up a browser-storage layer now would mean building something to throw away —
 * the route shape is cheaper to change than a storage format is to unpick.
 *
 * **The layout and the findings are computed, never stored.** A stored finding
 * is a finding from whichever rule set was current when it was written, and it
 * goes stale the moment a rule is added or a citation corrected. Recomputing
 * from the document on every keystroke is cheap, and it means the rail cannot
 * disagree with the canvas.
 */

import {
  DEFAULT_GHS_STOCK,
  DEFAULT_UPC_A_STOCK,
  DEFAULT_US_FOOD_STOCK,
  LayoutError,
  compareSeverity,
  layOutGhsLabel,
  layOutUpcALabel,
  layOutUsFoodLabel,
  mm,
  normaliseScannedGtin,
  runRules,
  type ElementId,
  type Finding,
  type GhsLabelData,
  type LabelStock,
  type LabelType,
  type ResolvedLayout,
  type ScannedGtin,
  type Severity,
  type UpcALabelData,
  type UsFoodLabelData,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import { defineStore } from 'pinia'
import { sameDocument, type DocumentSnapshot } from './documentIdentity'
import { computed, reactive, ref, watch } from 'vue'

/** A real GTIN-12, so the editor opens on something that resolves. */
const STARTING_GTIN = '036000291452'

/**
 * A GHS label that resolves, for the same reason the GTIN above is real.
 *
 * Fixed data rather than an editable form: the GHS form rail is a later stage,
 * and the statements here are placeholder text rather than looked-up H- and
 * P-statements, which is why nothing in this object may be presented as
 * regulatory content. It exists so the canvas has a real GHS layout to draw.
 */
const STARTING_GHS: GhsLabelData = {
  regime: 'eu-clp',
  productIdentifier: 'Example solvent',
  capacityL: 5,
  signalWords: ['Danger'],
  pictograms: ['GHS02', 'GHS07'],
  hazardStatementCodes: ['H225'],
  precautionaryStatementCodes: ['P210', 'P233'],
  supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way, Leeds' },
}

/**
 * A US food label that resolves, and that complies.
 *
 * It states no `netQuantityFontSizeMm`, so the engine derives the em that meets
 * 21 CFR 101.7(i) for this panel — which means the editor opens on a label the
 * rules pass, and shrinking the type in the form is what makes it fail. The
 * container matches the stock because a rectangular carton's front *is* its
 * principal display panel; changing the shape is how the other two branches of
 * 101.1 get exercised.
 */
const STARTING_FOOD: UsFoodLabelData = {
  statementOfIdentity: 'Oat and almond granola',
  container: { shape: 'rectangular', widthMm: 120, heightMm: 240 },
  netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
  // Oats are not wheat. The editor opens on this label, so a false allergen
  // declaration here would be the first thing a user learns from the tool.
  ingredients: [
    { name: 'whole grain rolled oats', percentByWeight: 90 },
    {
      name: 'almonds',
      percentByWeight: 7,
      allergen: 'tree-nuts',
      allergenSpecificType: 'almonds',
      declareInline: true,
    },
    { name: 'sugar', percentByWeight: 2 },
    { name: 'salt', percentByWeight: 1 },
  ],
  ingredientThreshold: { percent: 2, count: 2 },
  containsStatement: ['tree-nuts'],
  nutritionFacts: {
    servingSize: '1/2 cup (40g)',
    servingsPerContainer: 8,
    amounts: {
      calories: 150,
      'total-fat': 3,
      'saturated-fat': 0.5,
      'trans-fat': 0,
      cholesterol: 0,
      sodium: 0,
      'total-carbohydrate': 27,
      'dietary-fiber': 4,
      'total-sugars': 1,
      'added-sugars': 0,
      protein: 5,
      'vitamin-d': 2,
      calcium: 260,
      iron: 8,
      potassium: 235,
    },
  },
  responsibleFirm: {
    name: 'Example Foods Inc',
    isManufacturer: true,
    streetAddress: '1 Example Way',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
  },
}

export const useLabelDocumentStore = defineStore('labelDocument', () => {
  /**
   * Which label type the editor is showing.
   *
   * The store carries both documents rather than one polymorphic one, so
   * switching type does not discard what the other was holding — and so the
   * discriminated `runRules` context can be built without a cast.
   */
  const labelType = ref<'gs1-retail' | 'ghs-chemical' | 'us-food'>('gs1-retail')

  const data = reactive<UpcALabelData>({ gtin: STARTING_GTIN })
  const stock = reactive<LabelStock>({ ...DEFAULT_UPC_A_STOCK })
  const ghsData = reactive<GhsLabelData>({ ...STARTING_GHS })
  const ghsStock = reactive<LabelStock>({ ...DEFAULT_GHS_STOCK })
  const foodData = reactive<UsFoodLabelData>({
    ...STARTING_FOOD,
    container: { ...STARTING_FOOD.container },
    netQuantity: { ...STARTING_FOOD.netQuantity },
    ingredients: (STARTING_FOOD.ingredients ?? []).map((i) => ({ ...i })),
    ...(STARTING_FOOD.ingredientThreshold === undefined
      ? {}
      : { ingredientThreshold: { ...STARTING_FOOD.ingredientThreshold } }),
    ...(STARTING_FOOD.nutritionFacts === undefined
      ? {}
      : {
          nutritionFacts: {
            ...STARTING_FOOD.nutritionFacts,
            amounts: { ...STARTING_FOOD.nutritionFacts.amounts },
          },
        }),
    ...(STARTING_FOOD.containsStatement === undefined
      ? {}
      : { containsStatement: [...STARTING_FOOD.containsStatement] }),
    ...(STARTING_FOOD.responsibleFirm === undefined
      ? {}
      : { responsibleFirm: { ...STARTING_FOOD.responsibleFirm } }),
  })
  const foodStock = reactive<LabelStock>({ ...DEFAULT_US_FOOD_STOCK })

  /**
   * The element a finding or a form field is currently pointing at.
   *
   * One piece of state carries the whole finding ↔ canvas ↔ form link. Both
   * directions write it and everything else reads it, so the two halves cannot
   * drift into disagreeing about what is selected.
   */
  const selectedElementId = ref<ElementId | null>(null)

  /**
   * Resolved once per change, because both the canvas and the rules need it and
   * laying out twice would let them disagree.
   *
   * A `LayoutError` here is ordinary rather than exceptional: a half-typed GTIN
   * is not twelve digits yet. That is a form state, not a compliance verdict, so
   * it is surfaced as one and no finding is invented for it.
   */
  const resolved = computed<{ layout: ResolvedLayout | null; error: string | null }>(() => {
    try {
      const layout =
        labelType.value === 'gs1-retail'
          ? layOutUpcALabel(bwip as never, { data, stock })
          : labelType.value === 'ghs-chemical'
            ? layOutGhsLabel({ data: ghsData, stock: ghsStock })
            : layOutUsFoodLabel({ data: foodData, stock: foodStock })
      return { layout, error: null }
    } catch (error) {
      if (error instanceof LayoutError) return { layout: null, error: error.message }
      throw error
    }
  })

  const layout = computed(() => resolved.value.layout)
  const layoutError = computed(() => resolved.value.error)

  /**
   * Narrowed on `labelType` rather than cast, matching how `runRules` dispatches.
   *
   * All three label types have rules now. The rail still distinguishes "no check
   * ran" from "everything passed", because a rule that declines returns nothing
   * and an empty list must not read as a clean bill of health.
   */
  const findings = computed<Finding[]>(() => {
    const resolvedLayout = layout.value
    if (!resolvedLayout) return []
    switch (labelType.value) {
      case 'gs1-retail':
        return runRules({ labelType: 'gs1-retail', data, stock, layout: resolvedLayout })
      case 'ghs-chemical':
        return runRules({
          labelType: 'ghs-chemical',
          data: ghsData,
          stock: ghsStock,
          layout: resolvedLayout,
        })
      case 'us-food':
        return runRules({
          labelType: 'us-food',
          data: foodData,
          stock: foodStock,
          layout: resolvedLayout,
        })
      default: {
        // The same exhaustiveness guard `runRules` uses. The lint rule cannot
        // see that the switch covers the union, and a fourth label type should
        // fail to compile here rather than return `undefined` to a rail that
        // would render it as "everything passed".
        const unreachable: never = labelType.value
        return unreachable
      }
    }
  })

  /** Most severe first; passes last, where the rail collapses them. */
  const findingsBySeverity = computed<ReadonlyArray<[Severity, Finding[]]>>(() => {
    const groups = new Map<Severity, Finding[]>()
    for (const finding of findings.value) {
      const group = groups.get(finding.severity)
      if (group) group.push(finding)
      else groups.set(finding.severity, [finding])
    }
    return [...groups.entries()].sort(([a], [b]) => compareSeverity(a, b))
  })

  const failures = computed(() => findings.value.filter((f) => f.severity !== 'pass'))
  const passes = computed(() => findings.value.filter((f) => f.severity === 'pass'))
  const hasBlocking = computed(() => findings.value.some((f) => f.severity === 'blocking'))

  /**
   * Everything that could not be certified, and why.
   *
   * Two sources, one list, because they are one thing to a reader. Symbols carry
   * conditions no rule judges — no clause covering them has been verified against
   * a source document, and this project does not ship rules it cannot cite.
   * Elements carry the engine's own record of what it could not draw.
   *
   * The second half is what makes the withheld passes legible. `runRules` now
   * declines to certify an element the engine did not print, which is correct and
   * was silent: the rail simply showed five fewer passes for a net quantity drawn
   * off the label, with nothing saying why. A check that was declined has to read
   * as declined, or it is indistinguishable from a check that was never written.
   */
  const uncertifiable = computed(() => {
    const byElement = new Map<string, string[]>()
    const add = (elementId: string, reason: string) => {
      const existing = byElement.get(elementId)
      if (existing === undefined) byElement.set(elementId, [reason])
      else existing.push(reason)
    }

    for (const symbol of layout.value?.symbols ?? []) {
      if (symbol.overprintedBy.length > 0) {
        add(
          symbol.elementId,
          `Artwork is printed over the ${symbol.symbology} symbol. A symbol with ink through ` +
            'it will not scan whatever its margins measure.',
        )
      }
      if (symbol.verticalOverflowMm > 0) {
        add(
          symbol.elementId,
          `The ${symbol.symbology} symbol runs ${mm(symbol.verticalOverflowMm)} off ` +
            'the top or bottom of the stock, so part of it will not be printed.',
        )
      }
    }

    // The engine's reasons are already written as sentences for a reader — the
    // omission type exists so that nothing is ever dropped silently — so they are
    // passed through rather than restated here.
    for (const omission of layout.value?.omissions ?? []) add(omission.elementId, omission.reason)

    return [...byElement.entries()].map(([elementId, reasons]) => ({ elementId, reasons }))
  })

  const elementLabels = computed(() => {
    const labels = new Map<ElementId, string>()
    for (const element of layout.value?.elements ?? []) labels.set(element.elementId, element.label)
    return labels
  })

  function select(elementId: ElementId | null | undefined) {
    selectedElementId.value = elementId ?? null
  }

  /**
   * The most recent scan or paste into the GTIN field, accepted or refused.
   *
   * Kept so the rail can say *why* a read was not taken. A refusal that only
   * results in the field staying as it was is indistinguishable from the camera
   * not having fired.
   */
  const lastScan = ref<ScannedGtin | null>(null)

  /**
   * Takes a scanned or pasted symbol value, if it is a GTIN-12 or narrows to one.
   *
   * An action rather than a `v-model` because a scan is not typing: it arrives
   * whole, in whatever form the symbol carried, and has to be turned into the
   * twelve digits this form takes — or refused with a reason. `normaliseScannedGtin`
   * decides; nothing here is permitted to repair a check digit or shorten a code
   * to fit.
   */
  function applyScan(raw: string): ScannedGtin {
    const result = normaliseScannedGtin(raw)
    lastScan.value = result
    if (result.ok) data.gtin = result.gtin
    return result
  }

  /** Clears the note, for when the user starts typing over it. */
  function clearScan() {
    lastScan.value = null
  }

  /**
   * Which saved label the editor is attached to, if any.
   *
   * `null` means the document has never been written, so Save creates. An id
   * means Save replaces that record — which is the only reason the editor can
   * export a saved label at its own stock rather than at a default.
   */
  const savedId = ref<string | null>(null)
  const savedName = ref('')
  /** What was last written, for telling an edited document from an opened one. */
  const baseline = ref<DocumentSnapshot | null>(null)

  /**
   * One type's document, in the shape the API stores.
   *
   * Parameterised rather than reading `labelType` directly, because the type
   * watcher has to ask what the document looked like on the type it has just
   * left — by the time that watcher runs, `labelType` has already moved, and
   * comparing the new type's document against a baseline recorded for the old
   * one answers nothing.
   */
  const snapshotFor = (type: LabelType): DocumentSnapshot => ({
    name: savedName.value,
    labelType: type,
    stock: type === 'gs1-retail' ? stock : type === 'ghs-chemical' ? ghsStock : foodStock,
    data: type === 'gs1-retail' ? data : type === 'ghs-chemical' ? ghsData : foodData,
  })

  /** The active type's document, in the shape the API stores. */
  const snapshot = computed<DocumentSnapshot>(() => snapshotFor(labelType.value))

  /**
   * Whether the document has moved since it was last written — or, for one that
   * has never been written, since the editor opened.
   *
   * **A never-saved document has a baseline too.** Gating this on having been
   * saved made both guards inert for a brand-new label, which is the case they
   * most exist for: an hour of work on something never written is the work most
   * easily lost. The baseline starts at the seeded document, so an untouched
   * editor is clean and the first edit is not.
   */
  const isDirty = computed(
    () => baseline.value !== null && !sameDocument(snapshot.value, baseline.value),
  )

  /**
   * A plain, detached copy of the live document.
   *
   * Through JSON rather than `structuredClone`, because the baseline it produces
   * is compared against a document that has been through JSON on the way back
   * from the server — so both sides lose `undefined` the same way, and an
   * optional field the editor never touched compares equal to one the server
   * omitted.
   */
  const detachedSnapshot = (): DocumentSnapshot =>
    JSON.parse(JSON.stringify(snapshot.value)) as DocumentSnapshot

  /** Replaces a reactive document wholesale, rather than merging into it. */
  function replaceReactive(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(target)) delete target[key]
    Object.assign(target, structuredClone(source))
  }

  /**
   * Opens a saved label, stock included.
   *
   * **The stock matters as much as the data.** `docs/BACKLOG.md` records what
   * happens without it: the export request defaults a missing stock, so a label
   * opened without its own would print at whatever the default is rather than at
   * the size it was designed at — silently, and first visible on a printed
   * sheet.
   */
  function loadSaved(saved: {
    id: string
    name: string
    labelType: 'gs1-retail' | 'ghs-chemical' | 'us-food'
    stock: LabelStock
    data: unknown
  }): void {
    labelTypeIsLoading = true
    labelType.value = saved.labelType
    labelTypeIsLoading = false

    if (saved.labelType === 'gs1-retail') {
      replaceReactive(
        data as unknown as Record<string, unknown>,
        saved.data as Record<string, unknown>,
      )
      replaceReactive(
        stock as unknown as Record<string, unknown>,
        saved.stock as unknown as Record<string, unknown>,
      )
    } else if (saved.labelType === 'ghs-chemical') {
      replaceReactive(
        ghsData as unknown as Record<string, unknown>,
        saved.data as Record<string, unknown>,
      )
      replaceReactive(
        ghsStock as unknown as Record<string, unknown>,
        saved.stock as unknown as Record<string, unknown>,
      )
    } else {
      replaceReactive(
        foodData as unknown as Record<string, unknown>,
        saved.data as Record<string, unknown>,
      )
      replaceReactive(
        foodStock as unknown as Record<string, unknown>,
        saved.stock as unknown as Record<string, unknown>,
      )
    }

    savedId.value = saved.id
    savedName.value = saved.name
    baseline.value = detachedSnapshot()
  }

  /**
   * Opens a document that belongs to no saved record.
   *
   * The audit hand-off. `loadSaved` needs an id and marks the result as what the
   * server holds; this one deliberately does neither, because a label rebuilt
   * from a photograph has never been saved and pretending otherwise would make
   * the editor's Save a `PUT` over a record that does not exist.
   *
   * The baseline is left where it was rather than rebased, so the document reads
   * as unsaved work the moment it arrives — which it is. Rebasing it, or
   * clearing it, tells the leave guards there is nothing to defend.
   */
  function loadUnsaved(incoming: {
    labelType: 'gs1-retail' | 'ghs-chemical' | 'us-food'
    stock: LabelStock
    data: unknown
  }): void {
    // The baseline from before the hand-off is put back, because `loadSaved`
    // rebases it to whatever it has just loaded. Keeping the old one is what
    // makes `isDirty` true, and an audited label *is* unsaved work worth
    // defending — someone who photographed a drum, confirmed six fields and
    // then navigated away should be asked. Setting it to `null` was the first
    // version, and it did the opposite of the sentence above it: `isDirty` is
    // gated on a baseline existing, so both leave guards went quiet.
    const before = baseline.value
    loadSaved({ id: '', name: '', ...incoming })
    savedId.value = null
    savedName.value = ''
    baseline.value = before
  }

  /** Records that the current document is now what the server holds. */
  function markSaved(id: string, name: string): void {
    savedId.value = id
    savedName.value = name
    baseline.value = detachedSnapshot()
  }

  /**
   * Lets go of the saved label without touching the document.
   *
   * Switching label type does this, because a saved label is one type and its
   * `data` is a discriminated union keyed on it. The API would accept the
   * conversion without complaint, which is exactly why the client must not offer
   * it: a stored record would change kind because somebody clicked a tab, and
   * its name would still describe what it used to be.
   *
   * **The baseline is left exactly where it is**, and that is the whole of this
   * function's care. The baseline records what was last *written*; detaching
   * writes nothing, so moving it is the one thing this must not do. An earlier
   * version rebased it to the document in front of it, beneath a comment saying
   * that document “is still worth defending” — and rebasing is precisely what
   * stops defending it, because every edit made before the detach is absorbed
   * into the new baseline and stops counting as unsaved.
   *
   * Found in a browser, not in a test. Open a saved label, edit a field, switch
   * the label type: leaving the page raised no prompt, and closing the tab would
   * have lost the edit without a word from `beforeunload` either.
   *
   * **The leave guards are what this restores, and they are not the whole of
   * what a user sees.** `EditorView`'s “Unsaved changes” indicator is gated on
   * being attached to a record, so a detached document shows nothing whether it
   * is dirty or not — true before this change and true after it, and true of the
   * audit hand-off as well, which `e2e/the-label-audit.spec.ts` pins. That gap is
   * in `docs/BACKLOG.md`; it is a separate decision from this one.
   *
   * `docs/BACKLOG.md` asked a narrower version of the defect itself, about
   * `/labels/new`, where the answer turns out to be no — the route watcher only
   * reaches a document that came from a saved label, and that path is this one.
   *
   * It also subsumes the phase 7 guard that used to stand here, for the path
   * that guard was written for. `if (savedId === null) return` existed so a
   * document handed over from `/audit` could not be rebased by `EditorView`'s
   * route watcher on mount; nothing rebases here any more, so there is no rebase
   * left to prevent and an assignment of `null` over `null` is not worth
   * guarding. **The type watcher below keeps its own `savedId` check, and it is
   * not the same guard** — it protects the same hand-off from a different
   * rebase, the one that watcher does itself. Removing it produced a false
   * clearance; the note there says how.
   */
  function detach(): void {
    savedId.value = null
  }

  // The seeded document is the baseline until something is written, so an
  // untouched editor is clean and an edited one is not.
  baseline.value = detachedSnapshot()

  let labelTypeIsLoading = false
  /**
   * Synchronously, because the gap matters.
   *
   * A watcher flushed on the next tick leaves a window in which `labelType` has
   * already changed and `savedId` has not — and a Save in that window replaces
   * the stored record with a document of a different kind, which is the one
   * thing detaching exists to prevent.
   */
  watch(
    labelType,
    (_next, previous) => {
      // **Attached documents only, and that restriction is load-bearing.** A
      // detached one may be an audit hand-off, whose baseline `loadUnsaved`
      // deliberately leaves describing a different type — that mismatch is what
      // holds `isDirty` true over work somebody did with a camera in their hand.
      // Rebasing a detached document reads that mismatch as “nothing to lose”
      // the moment the user switches type away and back, and writes the
      // confirmed audit data into the baseline: both guards then go silent on a
      // document that has never been saved. Reproduced, and it is the reason
      // this condition is not the tidier `labelTypeIsLoading` alone.
      if (labelTypeIsLoading || savedId.value === null) return

      // Asked of the type being *left*, and before detaching. A switch moves
      // `snapshot` to the new type, so measuring it against a baseline recorded
      // for the old one reports “edited” however untouched the label was — the
      // comparison is only meaningful on one side of the change, and this is
      // that side.
      const carriedUnsavedWork =
        baseline.value !== null && !sameDocument(snapshotFor(previous), baseline.value)

      detach()

      // **Only a document with nothing to lose is rebased.** A saved label the
      // user merely looked at is not unsaved work, and prompting on the way out
      // of a type switch nobody typed into is a false positive they cannot
      // argue with. One they had edited is, and its baseline stays where it is
      // so the leave guards keep asking about it — which is the defect this
      // replaced.
      if (!carriedUnsavedWork) baseline.value = detachedSnapshot()
    },
    { flush: 'sync' },
  )

  return {
    savedId,
    savedName,
    isDirty,
    snapshot,
    loadSaved,
    loadUnsaved,
    markSaved,
    detach,
    labelType,
    data,
    stock,
    ghsData,
    ghsStock,
    foodData,
    foodStock,
    selectedElementId,
    layout,
    layoutError,
    findings,
    findingsBySeverity,
    failures,
    passes,
    hasBlocking,
    uncertifiable,
    elementLabels,
    select,
    lastScan,
    applyScan,
    clearScan,
  }
})
