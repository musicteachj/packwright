/**
 * The resolved layout — a flat list of primitives positioned in millimetres.
 *
 * This is the contract the whole product rests on. A layout engine produces one;
 * the SVG renderer and the PDF renderer both consume it and neither does any
 * arithmetic of its own. That is what makes preview == print true by
 * construction rather than by two code paths happening to agree today.
 *
 * It is also what phase 3's rules run against. A rule like "the net quantity
 * declaration must sit within the bottom 30% of the principal display panel" is
 * checked against a resolved `yMm`, not against an intent expressed somewhere in
 * a template — so the rule and the printed artefact cannot drift apart.
 *
 * Everything here is millimetres, named per the units-in-the-field-name
 * convention. There is no pixel, point or inch anywhere in this file: those are
 * renderer concerns, converted at the edge.
 */

import type { SymbologyId } from '../types/index'

/**
 * Identifies which label element a primitive came from.
 *
 * Carried on every primitive so a finding can point at geometry: click a
 * finding, and the offending element outlines on the canvas. Populated now,
 * before the rule engine exists, because retrofitting provenance through a
 * layout engine is far harder than emitting it from the start.
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
 * A barcode's resolved geometry, kept alongside the primitives that draw it.
 *
 * The bars are already in `primitives`; this records what they *mean* so a rule
 * can ask "is this quiet zone wide enough" without re-deriving it from a list of
 * rectangles. Measuring the drawn result rather than restating the intent is the
 * whole point — a rule that trusts the requested X-dimension would pass a symbol
 * the layout engine had silently scaled to fit.
 */
export interface ResolvedSymbol {
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
  quietZoneLeftMm: number
  quietZoneRightMm: number
}

export interface ResolvedLayout {
  /** Finished label dimensions — the PDF MediaBox and the SVG viewBox. */
  widthMm: number
  heightMm: number
  primitives: LayoutPrimitive[]
  /** Every barcode on the label, with its measured geometry. */
  symbols: ResolvedSymbol[]
}
