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
  DEFAULT_UPC_A_STOCK,
  LayoutError,
  compareSeverity,
  layOutUpcALabel,
  mm,
  runRules,
  type ElementId,
  type Finding,
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

export const useLabelDocumentStore = defineStore('labelDocument', () => {
  const data = reactive<UpcALabelData>({ gtin: STARTING_GTIN })
  const stock = reactive<LabelStock>({ ...DEFAULT_UPC_A_STOCK })

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
      return { layout: layOutUpcALabel(bwip as never, { data, stock }), error: null }
    } catch (error) {
      if (error instanceof LayoutError) return { layout: null, error: error.message }
      throw error
    }
  })

  const layout = computed(() => resolved.value.layout)
  const layoutError = computed(() => resolved.value.error)

  const findings = computed<Finding[]>(() =>
    layout.value ? runRules({ data, stock, layout: layout.value }) : [],
  )

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
    data,
    stock,
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
