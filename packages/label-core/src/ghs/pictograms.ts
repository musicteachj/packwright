/**
 * The nine GHS hazard pictograms.
 *
 * **Source.** Regulation (EC) No 1272/2008 (CLP), consolidated text
 * `02008R1272 — EN — 01.09.2025 — 029.003`, Annex V "Hazard pictograms",
 * retrieved 2026-09-11 from EUR-Lex `CELEX:02008R1272-20250901`. The codes and
 * the symbol names are that annex's own; nothing here is paraphrased.
 *
 * **What is drawn, and what is deliberately not.**
 *
 * CLP 1.2.1.1 and 1.2.1.2 specify the frame exactly enough to draw it: "a square
 * set at a point", "a black symbol on a white background with a red frame
 * sufficiently wide to be clearly visible". So the frame is geometry this module
 * can produce and the sizing rules can measure.
 *
 * The *symbol inside it* is not. Annex V says pictograms "conform in terms of
 * symbols and general format, to the specimens shown" — the specimens being
 * artwork published by the UN, which is not reproduced in the legal text as
 * vectors and could not be retrieved from an authoritative source when this was
 * written. Drawing an approximate flame from memory would produce a label that
 * looks right and is not the specified pictogram, which is the exact failure
 * this project exists to prevent. So the glyph is **recorded as a layout
 * omission** until verified artwork is obtained, and the frame is drawn around
 * the space reserved for it.
 *
 * This is the same posture `layout/engine.ts` already takes toward a GTIN it
 * cannot encode: draw what is known, record what is missing and why, and leave
 * the verdict to `rules/`.
 */

import type { PathCommand } from '../layout/types'
import type { GhsRegime } from './statements'

/** Annex V's own codes, in the annex's order. */
export const GHS_PICTOGRAM_CODES = [
  'GHS01',
  'GHS02',
  'GHS03',
  'GHS04',
  'GHS05',
  'GHS06',
  'GHS07',
  'GHS08',
  'GHS09',
] as const

export type GhsPictogramCode = (typeof GHS_PICTOGRAM_CODES)[number]

/**
 * Annex V's "Symbol:" heading for each pictogram, verbatim and lowercase as
 * printed.
 *
 * These are the accessible names. A screen reader reaching a pictogram must be
 * told which hazard symbol it is, not merely that a pictogram is present —
 * `docs/DESIGN.md` commits to this and it is the whole point of the element
 * being an image with a title rather than decoration.
 */
export const GHS_PICTOGRAM_SYMBOLS: Readonly<Record<GhsPictogramCode, string>> = {
  GHS01: 'exploding bomb',
  GHS02: 'flame',
  GHS03: 'flame over circle',
  GHS04: 'gas cylinder',
  GHS05: 'corrosion',
  GHS06: 'skull and crossbones',
  GHS07: 'exclamation mark',
  GHS08: 'health hazard',
  GHS09: 'environment',
}

/**
 * Frame colours and weight.
 *
 * **Not regulated figures.** CLP requires "a black symbol on a white background
 * with a red frame sufficiently wide to be clearly visible" and stops there: it
 * names no colour space, no coordinate and no stroke width. Unlike the severity
 * palette in the web theme — which is an interface colour and may never touch a
 * label — this red is printed onto the artefact, so it is recorded here as a
 * rendering default that a caller may replace, and it is honest about being
 * unverified rather than dressed up as a specification.
 *
 * The stroke is expressed as a fraction of the pictogram's edge so that a
 * 10 mm pictogram and a 46 mm one carry visually equivalent frames rather than
 * the small one being swallowed by a fixed-width rule.
 */
export const GHS_PICTOGRAM_STYLE_DEFAULT = {
  /** Unverified against any source; "sufficiently wide to be clearly visible". */
  frameStroke: 'd32011',
  background: 'ffffff',
  symbol: '000000',
  /** Stroke width as a fraction of the square's edge. */
  frameStrokeFraction: 0.09,
} as const

/**
 * The frame as path commands, in millimetres.
 *
 * `sideMm` is the edge of the square, per CLP Table 1.3 — see
 * `PICTOGRAM_DIMENSION_IS_THE_SQUARES_SIDE` in `./labelDimensions` for why that
 * reading and not the bounding box. `xMm`/`yMm` are the top-left of the
 * *bounding box* the rotated square occupies, because that is the box the
 * layout engine allocates and the box a rule will measure against its
 * neighbours.
 *
 * A square set at a point has its four corners at the midpoints of that box.
 */
export function pictogramFrameCommands(xMm: number, yMm: number, sideMm: number): PathCommand[] {
  const boxMm = sideMm * Math.SQRT2
  const halfMm = boxMm / 2

  return [
    { op: 'move', xMm: xMm + halfMm, yMm: yMm },
    { op: 'line', xMm: xMm + boxMm, yMm: yMm + halfMm },
    { op: 'line', xMm: xMm + halfMm, yMm: yMm + boxMm },
    { op: 'line', xMm: xMm, yMm: yMm + halfMm },
    { op: 'close' },
  ]
}

/**
 * Which pictograms a regime recognises.
 *
 * 29 CFR 1910.1200 Appendix C was read from the eCFR API on 2026-09-12 (title 29 issue date 2026-09-09); every subsection cited below was checked against that text.
 *
 * **CLP has nine; OSHA has eight.** 29 CFR 1910.1200 Appendix C.2.3.2 is
 * explicit — "One of eight standard hazard symbols shall be used in each
 * pictogram" — and the one it leaves out is GHS09, the environment pictogram,
 * which CLP Annex V requires for substances hazardous to the aquatic
 * environment.
 *
 * This is the clearest reason the two regimes cannot share one table. Offering
 * GHS09 as required on a US label would misstate the law, and silently dropping
 * it from an EU label would omit a mandatory element.
 */
export const GHS_PICTOGRAMS_BY_REGIME: Readonly<Record<GhsRegime, readonly GhsPictogramCode[]>> = {
  'eu-clp': GHS_PICTOGRAM_CODES,
  'us-osha': GHS_PICTOGRAM_CODES.filter((code) => code !== 'GHS09'),
}

export function isPictogramRecognised(regime: GhsRegime, code: GhsPictogramCode): boolean {
  return GHS_PICTOGRAMS_BY_REGIME[regime].includes(code)
}

/**
 * OSHA 1910.1200 Appendix C.2.3.1, verbatim: "A square red frame set at a point
 * without a hazard symbol is not a pictogram and is not permitted on the label."
 *
 * Recorded here because this engine currently draws exactly that — the frames
 * resolve, the Annex V specimen artwork could not be verified, and each missing
 * symbol is registered as a layout omission. That was the right call for
 * provenance and it means a label drawn today carries something OSHA explicitly
 * forbids. The glyphs are a blocker for a usable US label rather than a polish
 * item, and a rule should say so rather than leaving it implicit.
 */
export const EMPTY_FRAME_IS_NOT_A_PICTOGRAM =
  'A square red frame set at a point without a hazard symbol is not a pictogram and is not permitted on the label.'
