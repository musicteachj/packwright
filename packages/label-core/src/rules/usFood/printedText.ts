/**
 * What the engine printed for one element, read back from the layout.
 *
 * Two rules measure a printed block against a figure — the "Contains" statement
 * against the ingredient list, and 101.9(j)(15)(iii)'s statement against its 1/16
 * inch — and both need the same three facts about it. They read them here, so the
 * two cannot come to disagree about what "the size of an element" means.
 */

import type { TextPrimitive } from '../../layout/types'
import type { UsFoodContext } from '../types'

/**
 * The em of the smallest line drawn for an element, with its face and its text,
 * the lines joined by single spaces. `undefined` where nothing was drawn for it.
 */
export function smallestOf(
  layout: UsFoodContext['layout'],
  elementId: string,
): { fontSizeMm: number; fontFamily: string; text: string } | undefined {
  const lines = layout.primitives.filter(
    (primitive): primitive is TextPrimitive =>
      primitive.kind === 'text' && primitive.elementId === elementId,
  )
  if (lines.length === 0) return undefined
  return {
    // A fold, not `Math.min(...lines)`, which fails past about 122,000 lines: an
    // ingredient list of one-letter words on a narrow label reached that inside the body
    // limit (`docs/security-review-2026-10-18.md`, finding 1; `layout/usFoodEngine.ts`).
    fontSizeMm: lines.reduce((smallest, line) => Math.min(smallest, line.fontSizeMm), Infinity),
    fontFamily: lines[0]!.fontFamily,
    text: lines.map((line) => line.text).join(' '),
  }
}
