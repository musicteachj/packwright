/**
 * The GHS chemical label.
 *
 * The second label type, and the first test of whether this engine generalises.
 * It shares `./stock` with the UPC-A template — stock, panel, anchors — and
 * nothing else: it carries no barcode, so it needs no symbology, no encoder and
 * no quiet zone.
 *
 * **Six required elements.** CLP Article 17 lists what a label must carry; the
 * six modelled here are the ones with geometry. Statement *text* is supplied as
 * data at this stage rather than looked up from a code, because the H- and
 * P-statement tables are a separate piece of work with their own provenance
 * requirements — and a template that can already draw a statement is what makes
 * that work additive rather than a refactor.
 *
 * **Capacity is data, not geometry.** CLP Table 1.3 keys its minimum dimensions
 * on the capacity of the *package*, which no amount of measuring the label can
 * tell you: a 100 ml bottle and a 2 litre drum sit in different bands however
 * large a label is wrapped around either. So `capacityL` is carried, and a rule
 * that tried to infer it from the stock would be inventing its own input.
 */

import type { GhsPictogramCode } from '../ghs/pictograms'
import type { GhsRegime } from '../ghs/statements'
import type { LabelStock } from './stock'

/** Stable element identifiers, so a finding can point at geometry. */
export const GHS_ELEMENTS = {
  productIdentifier: 'ghs-product-identifier',
  signalWord: 'ghs-signal-word',
  pictograms: 'ghs-pictograms',
  hazardStatements: 'ghs-hazard-statements',
  precautionaryStatements: 'ghs-precautionary-statements',
  supplier: 'ghs-supplier',
  border: 'label-border',
} as const

/**
 * The two signal words, exactly as CLP Article 20 spells them.
 *
 * Codified strings, so they are a closed set rather than free text. Article
 * 20(3): "Where the signal word 'Danger' is used on the label, the signal word
 * 'Warning' shall not appear on the label" — which is a rule, and therefore
 * belongs to `rules/`, not to this template. The template's job is to let a
 * label carry the wrong one so the rule has something to catch.
 */
export const GHS_SIGNAL_WORDS = ['Danger', 'Warning'] as const
export type GhsSignalWord = (typeof GHS_SIGNAL_WORDS)[number]

/** CLP Article 17(1)(a): the supplier's name, address and telephone number. */
export interface GhsSupplier {
  name: string
  address: string
  telephone?: string
}

export interface GhsLabelData {
  /**
   * Which market this label is for. **Required, and deliberately not defaulted.**
   *
   * It selects the rules, not just the wording: OSHA recognises eight pictograms
   * to CLP's nine, its precedence rules are fewer and one is narrower, and only
   * CLP sets any dimensional minimum at all. Defaulting it would mean a label
   * silently judged against the wrong regulator — the kind of quiet wrong answer
   * this project exists to avoid.
   */
  regime: GhsRegime
  /** CLP Article 18 — the product identifier. */
  productIdentifier: string
  /**
   * Capacity of the package in litres, which selects the CLP Table 1.3 band.
   * Not the volume of the label, and not derivable from the stock.
   */
  capacityL: number
  /**
   * Signal words present on the label, **plural**.
   *
   * One field holding one value made CLP Article 20(3) — "where the signal word
   * 'Danger' is used, the signal word 'Warning' shall not appear" — impossible
   * to violate, and therefore impossible to check. That is exactly the trap
   * phase 3 documented: the quiet-zone rule could never fail because the engine
   * would not draw a label that failed it.
   *
   * It is also the honest shape for phase 7. A photograph of a real label
   * carrying both words is precisely what the audit path has to be able to
   * report, and a single-valued field could only represent it by discarding half
   * the evidence.
   */
  signalWords?: readonly GhsSignalWord[]
  /**
   * Hazard classifications, as `ANNEX_V_ENTRIES` ids.
   *
   * The input the regulation actually starts from. Pictograms are derived from
   * these rather than asked for, which is what lets Article 26 precedence be
   * enforced — those rules turn on *why* a pictogram is present.
   */
  hazards?: readonly string[]
  /** Annex V codes. Drawn in the order given; precedence is a rule, not a layout. */
  pictograms?: readonly GhsPictogramCode[]
  /**
   * Hazard statement text, verbatim.
   *
   * Supplied rather than looked up **for now**. When the H-statement table lands
   * these become codes and the text comes from the table — which is the only
   * acceptable long-term shape, because a paraphrased H225 is a non-compliant
   * label. Until then the caller owns the exactness and this field is honest
   * about carrying text rather than pretending to carry a verified lookup.
   */
  hazardStatements?: readonly string[]
  precautionaryStatements?: readonly string[]
  supplier?: GhsSupplier
  /**
   * Overrides the drawn pictogram size. Omitted means the CLP minimum for the
   * capacity band, which is the smallest compliant label — and therefore the
   * one most likely to expose a sizing defect.
   */
  pictogramSideMm?: number
}

/**
 * Type sizes for the GHS label — **legible defaults, not regulated figures.**
 *
 * CLP Article 31(3) requires label elements to be "clearly and indelibly marked"
 * and "of such a size and spacing as to be easily read", and sets no millimetre
 * anywhere. So these are a starting point a caller may replace, recorded as
 * unverified in the same way `UPC_A_HRI_DEFAULT` is. No rule may judge type size
 * against them.
 */
export const GHS_TYPE_DEFAULT = {
  fontFamily: 'IBM Plex Sans',
  /**
   * The weight for the signal word — a weight, not a second family name.
   *
   * This went wrong twice. First as `'IBM Plex Sans Bold'`, which the PDF
   * exporter does not embed, so it fell back to regular in print while the
   * browser showed bold. Then as `'IBM Plex Sans SemiBold'`, which the exporter
   * *does* embed but the browser does not declare — the stylesheet has one
   * family at two weights — so the divergence simply swapped sides and the
   * preview fell back to the system sans instead.
   *
   * A weight is the thing both renderers actually understand, and
   * `font-family-is-declared.test.ts` now checks the browser side too, which is
   * what neither earlier fix was tested against.
   */
  emphasisFontWeight: 600,
  productIdentifierMm: 4,
  signalWordMm: 5,
  statementMm: 2.6,
  supplierMm: 2.4,
  /** Leading between stacked statement lines, as a multiple of the type size. */
  lineHeight: 1.35,
  /** Gap between the six element blocks. */
  blockGapMm: 2,
} as const

/** A 74 x 105 mm stock — the CLP minimum for the 3-to-50-litre band. */
export const DEFAULT_GHS_STOCK: LabelStock = {
  widthMm: 74,
  heightMm: 105,
  marginMm: 4,
}
