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
    fontSizeMm: Math.min(...lines.map((line) => line.fontSizeMm)),
    fontFamily: lines[0]!.fontFamily,
    text: lines.map((line) => line.text).join(' '),
  }
}
