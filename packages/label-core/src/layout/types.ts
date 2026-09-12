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
  /**
   * Optional outline, for bordered blocks. Omitted means fill only, which is
   * what every rectangle drawn before the GHS label needed.
   */
  stroke?: string
  strokeWidthMm?: number
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
   * 21 CFR 101.7(i) sets the net-quantity minimum as a printed letter height and
   * 101.7(h)(2) names which letter — a capital, or the lowercase "o" where any
   * lower case is used. For IBM Plex Sans an em is 1.433 capitals or 1.852 "o"s,
   * so a rule comparing `minNetQuantityTypeHeightMm` against this number
   * directly would clear type at 54% of the legal minimum.
   *
   * **No rule may judge a regulated type size from this field alone.** Convert
   * first, with `glyphHeightMm` from `text/measure`, which reads the per-face
   * outline heights generated from the embedded TTFs.
   */
  fontSizeMm: number
  fontFamily: string
  /**
   * CSS weight, defaulting to 400.
   *
   * Expressed as intent, like `anchor`, because the two renderers satisfy it
   * differently: a browser resolves family plus weight against `@font-face`
   * rules, while PDFKit registers one face per weight under its own name.
   *
   * Naming the bold face as a *family* instead — `'IBM Plex Sans SemiBold'` —
   * looks like it works and silently does not. The exporter registers a face by
   * that literal name and renders correctly, but the browser has no such family
   * (the stylesheet declares `'IBM Plex Sans'` at `font-weight: 600`), so the
   * SVG falls back to the system sans. That put the single most prominent word
   * on a hazard label in a different typeface in preview than in print, which is
   * the precise divergence this architecture exists to prevent.
   */
  fontWeight?: number
  fill: string
  anchor: TextAnchor
}

/**
 * One segment of a path, in millimetres, with absolute coordinates.
 *
 * Deliberately *not* an SVG `d` string.
 *
 * A `d` string would be cheaper — pictogram artwork arrives as one, and PDFKit
 * will parse it. But that makes preview == print depend on two independent SVG
 * path parsers, the browser's and PDFKit's, producing identical geometry from
 * the same text. This project already declined that trade once: it throws away
 * bwip-js's own vertical output and draws the human-readable digits separately,
 * because letting the library's metrics feed back into bar positions made the
 * result true by coincidence rather than by construction. A path is geometry,
 * and geometry belongs in numbers the engine resolved.
 *
 * So `d` strings are an authoring-time input. Converting one into these commands
 * is a separate, tested step, and what ships in a layout is the result.
 *
 * Cubic only, no arcs and no shorthand: every curve an arc can express, a cubic
 * can approximate to well under a printing tolerance, and one curve form means
 * one thing for each renderer to get right.
 */
export type PathCommand =
  | { op: 'move'; xMm: number; yMm: number }
  | { op: 'line'; xMm: number; yMm: number }
  | {
      op: 'cubic'
      c1xMm: number
      c1yMm: number
      c2xMm: number
      c2yMm: number
      xMm: number
      yMm: number
    }
  | { op: 'close' }

/**
 * An arbitrary filled or stroked shape.
 *
 * Rectangles and lines cover a barcode label entirely. A GHS pictogram does not:
 * it is a red square-on-point frame around a glyph — a flame, a skull, a
 * corroding surface — and no composition of rectangles draws one.
 */
export interface PathPrimitive extends PrimitiveBase {
  kind: 'path'
  commands: readonly PathCommand[]
  /** Hex without the leading hash. Omitted means the shape is not filled. */
  fill?: string
  /** Omitted means the shape is not stroked. A path with neither draws nothing. */
  stroke?: string
  strokeWidthMm?: number
  /**
   * How overlapping subpaths combine.
   *
   * `evenodd` is what makes a counter a hole rather than more ink — the skull's
   * eye sockets, the gaps in the exploding-bomb rays. Defaults to `nonzero`,
   * matching both SVG and PDF.
   */
  fillRule?: 'nonzero' | 'evenodd'
}

export type LayoutPrimitive = RectPrimitive | LinePrimitive | TextPrimitive | PathPrimitive

/**
 * The space the engine allocated to one label element.
 *
 * Primitives are for drawing; this is for measuring. Everything that needs to
 * reason about where an element *is* — a quiet-zone rule, the canvas highlight,
 * the text-equivalent view — reads a box rather than re-deriving one from a bag
 * of rectangles.
 *
 * It exists because a `TextPrimitive` has no width, and because a width derived
 * from `text/metrics` is the width of the glyphs rather than the width of the
 * space the engine set aside for them. Those differ — by the wrap width, by the
 * trailing slack on a short last line — so measuring encroachment
 * primitive-by-primitive would answer a subtly different question for exactly
 * the elements most likely to encroach. The engine knows precisely what box it
 * allocated. So it says so, once, instead of every consumer re-deriving it.
 */
/**
 * A hazard pictogram as drawn, with the requirement it is judged against.
 *
 * The two are separate fields for the reason phase 3 learned the hard way:
 * `quietZoneLeftMm` was a restatement of the specification under a name that
 * read like a measurement, and a rule written against it passed every label put
 * to it. `drawnSideMm` is what this label carries; `requiredSideMm` is what CLP
 * Table 1.3 demands for its capacity band. Only the first can fail.
 *
 * Parallel to `ResolvedSymbol`, and for the same reason — a GHS label returns an
 * empty `symbols` array and a UPC-A label returns an empty `pictograms` one.
 */
export interface ResolvedPictogram {
  elementId: ElementId
  /** Annex V code, e.g. `GHS02`. Typed as a string here to keep `layout` from
   * depending on `ghs`; the GHS template supplies the narrowed value. */
  code: string
  /** Annex V's own symbol name, for the accessible title. */
  symbolName: string
  /** The square's edge as drawn — not the bounding box of the rotated square. */
  drawnSideMm: number
  /** CLP Table 1.3 minimum for the package's capacity band. */
  requiredSideMm: number
  /** Table 1.3's "if possible" target, where the band states one. */
  preferredSideMm?: number
  /** Area as drawn, square millimetres. The square's area, not its bounding box. */
  drawnAreaSqMm: number
  /** The bounding box the rotated square occupies, which is what it is placed in. */
  box: BoundingBox
  /**
   * Whether the specified symbol artwork was drawn inside the frame.
   *
   * `false` means the frame is there and the glyph is not, and a matching
   * `LayoutOmission` says why. A rule must not certify a pictogram whose symbol
   * was never drawn, however correctly sized its frame is.
   */
  glyphDrawn: boolean
}

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
  /**
   * Whether the element is absent entirely, or present with a detail missing.
   *
   * The two look identical in a list of omissions and mean opposite things to a
   * caller deciding whether a layout is worth exporting. A UPC-A whose GTIN will
   * not encode has no symbol at all, and exporting it produces a blank page. A
   * GHS pictogram whose specimen artwork was unavailable still has its frame,
   * its size and its position — the label is substantially there and the export
   * is worth having.
   *
   * Without this, the export gate had to be "any omission blocks", which was
   * right for the only label type that existed and would have made every GHS
   * export a 422.
   */
  scope: 'element' | 'detail'
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
  /** Hazard pictograms as drawn. Empty for every label type that carries none. */
  pictograms: ResolvedPictogram[]
  /** Anything the engine could not draw. Empty on a label that resolved fully. */
  omissions: LayoutOmission[]
}
