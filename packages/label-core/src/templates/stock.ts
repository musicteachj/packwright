/**
 * The substrate and the anchor kernel every label type shares.
 *
 * None of this is specific to a symbology or a regulation. A stock has
 * dimensions and a keep-clear margin, a panel is the area inside those margins,
 * and an anchor puts a box somewhere in that panel. A GS1 retail label, a GHS
 * chemical label and an FDA food label all position their elements this way,
 * so it lives here rather than inside whichever template happened to need it
 * first.
 *
 * It was in `upcA.ts` until the GHS label arrived and made the mixing obvious:
 * a second template importing its anchor arithmetic from a file named after a
 * barcode symbology would have read as an accident rather than a decision.
 */

/**
 * The physical substrate. Every label is printed on something, and its
 * dimensions bound everything placed on it.
 */
export interface LabelStock {
  widthMm: number
  heightMm: number
  /** Keep-clear margin at every edge. */
  marginMm: number
}

/**
 * Where an element sits in the panel inside the stock's margins.
 *
 * Nine positions rather than free coordinates. A user choosing "bottom left"
 * cannot express a half-millimetre nudge that quietly breaks a quiet zone, and
 * the engine can always say which anchor produced a given box.
 */
export const ANCHORS = [
  'top-left',
  'top-centre',
  'top-right',
  'centre-left',
  'centre',
  'centre-right',
  'bottom-left',
  'bottom-centre',
  'bottom-right',
] as const

/**
 * Derived from the list rather than declared alongside it, so the two cannot
 * disagree — and so a consumer that needs a runtime enum (the API's Zod schema)
 * gets one that is typed as `Anchor` instead of widening to `string`.
 */
export type Anchor = (typeof ANCHORS)[number]

/**
 * A block of artwork — a brand or product name.
 *
 * Its width and height are declared rather than measured. `label-core` has no
 * font metrics, so it cannot know how wide a string sets; what it can know, and
 * what everything downstream actually needs, is the box the element was given.
 * Type that overflows its declared box is the caller's problem and a separate
 * one from where the box sits.
 */
export interface ArtworkBlock {
  text: string
  anchor: Anchor
  widthMm: number
  heightMm: number
  /** Em size. Defaults to something legible; see `ARTWORK_DEFAULT`. */
  fontSizeMm?: number
  fontFamily?: string
}

export const ARTWORK_DEFAULT = {
  fontFamily: 'IBM Plex Sans',
  fontSizeMm: 3,
} as const

/** The area inside the stock's margins, which is what anchors are relative to. */
export interface Panel {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export function panelFor(stock: LabelStock): Panel {
  return {
    xMm: stock.marginMm,
    yMm: stock.marginMm,
    widthMm: stock.widthMm - stock.marginMm * 2,
    heightMm: stock.heightMm - stock.marginMm * 2,
  }
}

/**
 * Top-left corner of a box of the given size at the given anchor.
 *
 * Nothing is clamped. A box larger than the panel produces a negative
 * coordinate and gets drawn hanging off the stock, which is exactly what the
 * user asked for and exactly what the rules are there to report. Quietly
 * nudging it back inside would hide the defect and print a symbol nobody
 * specified.
 */
export function anchorBox(
  anchor: Anchor,
  panel: Panel,
  widthMm: number,
  heightMm: number,
): { xMm: number; yMm: number } {
  const [vertical, horizontal] = anchor.split('-') as [
    'top' | 'centre' | 'bottom',
    'left' | 'centre' | 'right',
  ]

  // 'centre' as the whole anchor splits to ['centre', undefined]; treat the
  // missing half as centred rather than falling through to a NaN coordinate.
  const across = horizontal ?? 'centre'

  const xMm =
    across === 'left'
      ? panel.xMm
      : across === 'right'
        ? panel.xMm + panel.widthMm - widthMm
        : panel.xMm + (panel.widthMm - widthMm) / 2

  const yMm =
    vertical === 'top'
      ? panel.yMm
      : vertical === 'bottom'
        ? panel.yMm + panel.heightMm - heightMm
        : panel.yMm + (panel.heightMm - heightMm) / 2

  return { xMm, yMm }
}
