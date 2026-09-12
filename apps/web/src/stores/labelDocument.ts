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
  LayoutError,
  compareSeverity,
  layOutGhsLabel,
  layOutUpcALabel,
  mm,
  runRules,
  type ElementId,
  type Finding,
  type GhsLabelData,
  type LabelStock,
  type ResolvedLayout,
  type Severity,
  type UpcALabelData,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'

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
  productIdentifier: 'Example solvent',
  capacityL: 5,
  signalWords: ['Danger'],
  pictograms: ['GHS02', 'GHS07'],
  hazardStatements: ['(hazard statement text is not yet looked up from the H-statement table)'],
  precautionaryStatements: ['(precautionary statement text likewise)'],
  supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way, Leeds' },
}

export const useLabelDocumentStore = defineStore('labelDocument', () => {
  /**
   * Which label type the editor is showing.
   *
   * The store carries both documents rather than one polymorphic one, so
   * switching type does not discard what the other was holding — and so the
   * discriminated `runRules` context can be built without a cast.
   */
  const labelType = ref<'gs1-retail' | 'ghs-chemical'>('gs1-retail')

  const data = reactive<UpcALabelData>({ gtin: STARTING_GTIN })
  const stock = reactive<LabelStock>({ ...DEFAULT_UPC_A_STOCK })
  const ghsData = reactive<GhsLabelData>({ ...STARTING_GHS })
  const ghsStock = reactive<LabelStock>({ ...DEFAULT_GHS_STOCK })

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
          : layOutGhsLabel({ data: ghsData, stock: ghsStock })
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
   * A GHS label currently produces no findings, because no GHS rule has shipped.
   * The rail already distinguishes "no check ran" from "everything passed", so
   * an empty list reads correctly rather than as a clean bill of health.
   */
  const findings = computed<Finding[]>(() => {
    const resolvedLayout = layout.value
    if (!resolvedLayout) return []
    return labelType.value === 'gs1-retail'
      ? runRules({ labelType: 'gs1-retail', data, stock, layout: resolvedLayout })
      : runRules({
          labelType: 'ghs-chemical',
          data: ghsData,
          stock: ghsStock,
          layout: resolvedLayout,
        })
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
   * Symbols that could not be certified, and why.
   *
   * Surfaced separately from the findings because no rule judges either
   * condition — no clause covering them has been verified against a source
   * document, and this project does not ship rules it cannot cite. Without it
   * the rail showed nothing but passes for a barcode with a block of ink through
   * the middle of it, or one drawn half off the stock.
   */
  const uncertifiableSymbols = computed(() =>
    (layout.value?.symbols ?? []).flatMap((symbol) => {
      const reasons: string[] = []
      if (symbol.overprintedBy.length > 0) {
        reasons.push(
          `Artwork is printed over the ${symbol.symbology} symbol. A symbol with ink through ` +
            'it will not scan whatever its margins measure.',
        )
      }
      if (symbol.verticalOverflowMm > 0) {
        reasons.push(
          `The ${symbol.symbology} symbol runs ${mm(symbol.verticalOverflowMm)} off ` +
            'the top or bottom of the stock, so part of it will not be printed.',
        )
      }
      return reasons.length > 0 ? [{ elementId: symbol.elementId, reasons }] : []
    }),
  )

  const elementLabels = computed(() => {
    const labels = new Map<ElementId, string>()
    for (const element of layout.value?.elements ?? []) labels.set(element.elementId, element.label)
    return labels
  })

  function select(elementId: ElementId | null | undefined) {
    selectedElementId.value = elementId ?? null
  }

  return {
    labelType,
    data,
    stock,
    ghsData,
    ghsStock,
    selectedElementId,
    layout,
    layoutError,
    findings,
    findingsBySeverity,
    failures,
    passes,
    hasBlocking,
    uncertifiableSymbols,
    elementLabels,
    select,
  }
})
