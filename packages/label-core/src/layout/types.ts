/**
 * The resolved layout — a flat list of primitives positioned in millimetres.
 *
 * This is the contract the whole product rests on. A layout engine produces one;
 * the SVG renderer and the PDF renderer both consume it and neither does any
 * arithmetic of its own. That is what makes preview == print true by
 * construction rather than by two code paths happening to agree today.
 *
 * It is also what the rules run against. A rule like "the net quantity
 * declaration must sit within the bottom 30% of the principal display panel" is
 * checked against a resolved `yMm`, not against an intent expressed somewhere in
 * a template — so the rule and the printed artefact cannot drift apart.
 *
 * Everything here is millimetres, named per the units-in-the-field-name
 * convention. There is no pixel, point or inch anywhere in this file: those are
 * renderer concerns, converted at the edge.
 */

import type { BoundingBox, SymbologyId } from '../types/index'

/**
 * Identifies which label element a primitive came from.
 *
 * Carried on every primitive so a finding can point at geometry: click a
 * finding, and the offending element outlines on the canvas.
 */
export type ElementId = string

export interface PrimitiveBase {
  /** Which label element produced this primitive. */
  elementId?: ElementId
}

/** A filled rectangle. Bars, panels, rules and swatches are all rectangles. */
export interface RectPrimitive extends PrimitiveBase {
  kind: 'rect'
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
  /** CSS/PDF hex without the leading hash, e.g. `000000`. */
  fill: string
}

/** A stroked straight line. Die lines, dimension callouts, crop marks. */
export interface LinePrimitive extends PrimitiveBase {
  kind: 'line'
  x1Mm: number
  y1Mm: number
  x2Mm: number
  y2Mm: number
  strokeWidthMm: number
  stroke: string
  /** Dash pattern in millimetres. Omitted means solid. */
  dashMm?: readonly number[]
}

export type TextAnchor = 'start' | 'middle' | 'end'

/**
 * Text, kept as text rather than outlined to paths.
 *
 * Both renderers draw it with a real font — SVG via CSS, PDF via an embedded
 * face — so the exported PDF has selectable, searchable text and the browser
 * canvas has an accessible DOM. Outlining would have made the two renderers
 * agree more cheaply and produced a worse artefact on both sides.
 */
export interface TextPrimitive extends PrimitiveBase {
  kind: 'text'
  xMm: number
  /** Baseline position, not the top of the em box. */
  baselineYMm: number
  text: string
  /**
   * Em size in millimetres — the number handed to a renderer, equivalent to CSS
   * `font-size`. **Not** cap height, and not the height of a lowercase letter.
   *
   * The distinction is load-bearing and this field was mis-documented at first.
   * 21 CFR 101.7(i) sets the net-quantity minimum by the height of the lowercase
   * "o", which for most faces is around half the em — so a rule that compared
   * `minNetQuantityTypeHeightMm` against this number directly would pass type
   * roughly a third under the legal minimum. Deriving x-height needs real font
   * metrics, which `label-core` does not have; until it does, no rule may judge
   * type size from this field alone.
   */
  fontSizeMm: number
  fontFamily: string
  fill: string
  anchor: TextAnchor
}

export type LayoutPrimitive = RectPrimitive | LinePrimitive | TextPrimitive

/**
 * The space the engine allocated to one label element.
 *
 * Primitives are for drawing; this is for measuring. Everything that needs to
 * reason about where an element *is* — a quiet-zone rule, the canvas highlight,
 * the text-equivalent view — reads a box rather than re-deriving one from a bag
 * of rectangles.
 *
 * It exists because a `TextPrimitive` has no width. Deriving one needs font
 * metrics, which `label-core` deliberately does not carry (see the note on
 * `fontSizeMm` above), so measuring encroachment primitive-by-primitive would be
 * guesswork for exactly the elements most likely to encroach — text blocks. The
 * engine, on the other hand, knows precisely what box it set aside. So it says
 * so, once, instead of every consumer guessing.
 */
export interface ResolvedElement {
  elementId: ElementId
  /** Human-readable name, for the findings rail and the canvas text equivalent. */
  label: string
  /** The space the engine allocated. */
  box: BoundingBox
}

/**
 * Something the engine could not draw, and why.
 *
 * An omission is a fact, not a verdict: it records that a GTIN whose check digit
 * is wrong has no symbol because no encoder will produce one, and leaves the
 * judging — and the citation — to `rules/`.
 *
 * It exists so that nothing is ever dropped silently. A label missing its
 * barcode with no explanation is the worst artefact this engine could hand back,
 * because it looks like a rendering bug rather than a compliance problem.
 */
export interface LayoutOmission {
  elementId: ElementId
  /** Plain sentence naming what could not be drawn and why. */
  reason: string
}

/**
 * A barcode's geometry as placed, before its surroundings are known.
 *
 * Split from `ResolvedSymbol` because clear space is not a property of a symbol
 * — it is a property of a symbol *and everything around it*, which the symbol
 * adapter cannot see. The adapter reports what it drew; the engine measures the
 * neighbourhood and completes the record.
 */
export interface PlacedSymbol {
  elementId: ElementId
  symbology: SymbologyId
  /** The payload as encoded, check digit included. */
  value: string
  xDimensionMm: number
  /** Bars only, excluding quiet zones. */
  barPatternWidthMm: number
  barHeightMm: number
  /** Left edge of the bar pattern, so quiet-zone width is measurable either side. */
  xMm: number
  yMm: number
  /** Full drawn height — bars, guard-bar extension and the HRI band. */
  drawnHeightMm: number
  /**
   * Vertical extent of the bar ink alone — data bars plus the guard-bar
   * extension, excluding the human-readable band beneath.
   *
   * Distinct from `drawnHeightMm` because the two answer different questions and
   * confusing them caused a real defect: artwork level with the printed digits
   * was treated as artwork printed over the bars, which silenced every
   * quiet-zone verdict on a label whose quiet zone was in fact zero.
   */
  guardBarHeightMm: number
  /** What the specification demands, as a width in mm at this X-dimension. */
  requiredQuietZoneLeftMm: number
  requiredQuietZoneRightMm: number
}

/**
 * A barcode's resolved geometry, kept alongside the primitives that draw it.
 *
 * The bars are already in `primitives`; this records what they *mean* so a rule
 * can ask "is this quiet zone wide enough" without re-deriving it from a list of
 * rectangles.
 *
 * The `required` and `clearSpace` pairs are the whole point, and conflating them
 * is the mistake this type is shaped to prevent. `requiredQuietZoneLeftMm` is
 * `9 * X` for a UPC-A — a restatement of the specification, true of every UPC-A
 * ever drawn. `clearSpaceLeftMm` is what this label actually leaves blank. Only
 * the second can fail, and an earlier version of this file carried only the
 * first, under a name that read like a measurement — so a quiet-zone rule
 * written against it would have passed every label put to it.
 */
export interface ResolvedSymbol extends PlacedSymbol {
  /**
   * Blank space actually available to the left of the bar pattern, measured to
   * the nearest encroaching element box or to the trim edge, whichever is
   * closer. Negative when the bars themselves run off the label.
   */
  clearSpaceLeftMm: number
  clearSpaceRightMm: number
  /**
   * Elements drawn over the bar ink. Empty on a symbol nothing overprints.
   *
   * A measured fact, not a verdict: no rule here judges it, because no clause
   * covering it has been verified against a source document. What it does is
   * stop the quiet-zone rule *certifying* a symbol it cannot meaningfully
   * certify. It must never suppress a violation — see `rules/gs1/quietZone.ts`.
   */
  overprintedBy: ElementId[]
  /**
   * How far the drawn symbol extends above the top or below the bottom of the
   * stock, in millimetres. Zero when it sits entirely on the label.
   *
   * Vertical only. Horizontal overhang already shows up as negative clear space,
   * which is why the changelog's claim that "clipped bars measure as negative
   * clear space" held horizontally and was silently false the other way: a
   * symbol drawn off the top and bottom of its stock reported every check
   * passing.
   */
  verticalOverflowMm: number
}

export interface ResolvedLayout {
  /** Finished label dimensions — the PDF MediaBox and the SVG viewBox. */
  widthMm: number
  heightMm: number
  primitives: LayoutPrimitive[]
  /** Every element the engine placed, with the box it was given. */
  elements: ResolvedElement[]
  /** Every barcode on the label, with its measured geometry. */
  symbols: ResolvedSymbol[]
  /** Anything the engine could not draw. Empty on a label that resolved fully. */
  omissions: LayoutOmission[]
}
