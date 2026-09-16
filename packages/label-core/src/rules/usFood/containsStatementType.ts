/**
 * The "Contains" statement is set no smaller than the ingredient list, and sits
 * beside it.
 *
 * Source: **FD&C Act §403(w)(1)(A) / 21 U.S.C. 343(w)(1)(A)**, read from the US
 * Code on 2026-09-12. The statement must be "printed **immediately after or is
 * adjacent to the list of ingredients** (**in a type size no smaller than the
 * type size used in the list of ingredients**)".
 *
 * Both halves are measurable and both are measured here. The type-size half is a
 * *relative* requirement — the first in this project — so it needs the letter
 * heights `text/metrics` generates rather than a figure from a table: comparing
 * `fontSizeMm` against `fontSizeMm` would be right only while both blocks share
 * a typeface, and would silently stop being right the moment one did not. It
 * also needs both blocks converted on the **same** basis; see `letterHeightMm`
 * for what happens when they are not.
 *
 * The floor underneath both is 21 CFR 101.2(c)'s 1/16 inch, judged separately by
 * `informationPanelTypeSize`. This rule is about the relationship, so a Contains
 * statement and an ingredient list that are equally and identically too small
 * pass here and fail there, which is the honest division: they are two different
 * defects and a user fixing one has not fixed the other.
 */

import { regulatedGlyphBasis } from '../../geometry/pdp'
import type { TextPrimitive } from '../../layout/types'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import { glyphHeightMm } from '../../text/measure'
import type { GlyphBasis } from '../../text/measure'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_CONTAINS_TYPE_TOO_SMALL = 'FDA_CONTAINS_TYPE_TOO_SMALL'
export const FDA_CONTAINS_NOT_ADJACENT = 'FDA_CONTAINS_NOT_ADJACENT'
export const FDA_CONTAINS_TYPE_MET = 'FDA_CONTAINS_TYPE_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: 'FD&C Act §403(w)(1)(A)',
  title:
    'A "Contains" statement sits adjacent to the ingredient list, in type no smaller than it uses',
}

/** The em of the smallest line drawn for an element, with its face and text. */
function smallestOf(
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

/**
 * Printed height of the letter the statute's "type size" refers to — **on a
 * basis shared by both blocks**, which is the whole point of this helper.
 *
 * Converting each block through its own casing was wrong in the most ordinary
 * layout there is. An all-caps ingredient list measures on cap height (0.698 em)
 * and a mixed-case "Contains" statement on the "o" (0.540), so two blocks set at
 * an identical 4 mm em came out as 2.79 mm against 2.16 mm and the rule reported
 * a violation against a label where a typesetter had set both to the same size.
 *
 * §403(w)(1)(A) compares one block to another rather than either to a figure, so
 * the basis has to be the same on both sides or the comparison is not measuring
 * type size at all. The stricter of the two is used — if either block carries
 * lower case, both are measured on the "o" — which keeps a genuine difference in
 * em visible while a difference in casing alone is not one.
 */
const letterHeightMm = (
  block: { fontSizeMm: number; fontFamily: string },
  basis: GlyphBasis,
): number => glyphHeightMm(block.fontSizeMm, block.fontFamily, basis)

export const usFoodContainsStatementTypeRule: UsFoodRule = {
  id: 'us-food/contains-statement-type',
  title: 'The "Contains" statement is adjacent to the ingredient list and no smaller than it.',
  citation: CITATION,
  codes: [FDA_CONTAINS_TYPE_TOO_SMALL, FDA_CONTAINS_NOT_ADJACENT, FDA_CONTAINS_TYPE_MET],
  appliesTo: 'us-food',

  check({ layout }: UsFoodContext): Finding[] {
    const contains = smallestOf(layout, US_FOOD_ELEMENTS.containsStatement)
    const list = smallestOf(layout, US_FOOD_ELEMENTS.ingredients)
    // §403(w)(1)(A) describes a statement measured against a list. Without both
    // there is no relationship to measure, and a label relying on (w)(1)(B)'s
    // parenthetical form owes no "Contains" statement at all.
    if (contains === undefined || list === undefined) return []

    const findings: Finding[] = []

    const basis: GlyphBasis =
      regulatedGlyphBasis(contains.text) === 'lowercase-o' ||
      regulatedGlyphBasis(list.text) === 'lowercase-o'
        ? 'lowercase-o'
        : 'cap-height'
    const containsMm = letterHeightMm(contains, basis)
    const listMm = letterHeightMm(list, basis)
    if (containsMm < listMm - MEASUREMENT_TOLERANCE_MM) {
      findings.push(
        finding(usFoodContainsStatementTypeRule, {
          code: FDA_CONTAINS_TYPE_TOO_SMALL,
          severity: 'violation',
          message:
            `The "Contains" statement is set at ${mm(containsMm)} against an ingredient list at ` +
            `${mm(listMm)}. It may be larger, never smaller.`,
          measurement: { actual: mm(containsMm), required: `at least ${mm(listMm)}` },
          elementId: US_FOOD_ELEMENTS.containsStatement,
        }),
      )
    }

    const containsBox = layout.elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.containsStatement,
    )?.box
    const listBox = layout.elements.find(
      (element) => element.elementId === US_FOOD_ELEMENTS.ingredients,
    )?.box

    if (containsBox !== undefined && listBox !== undefined) {
      // "Immediately after or adjacent to". The engine stacks, so adjacency is
      // the vertical gap — and the allowance is **one line of the list**,
      // measured off the list itself rather than assumed. A statement set
      // further from the list than the list's own lines are from each other has
      // stopped reading as part of it.
      //
      // Measured, because a guessed figure got this wrong: the em alone is
      // narrower than the gap the engine leaves between any two blocks, so the
      // rule reported every conformant label as non-adjacent. Line advance
      // includes the leading, which is the dimension a reader actually sees.
      const gapMm = Math.max(
        containsBox.yMm - (listBox.yMm + listBox.heightMm),
        listBox.yMm - (containsBox.yMm + containsBox.heightMm),
      )
      const listLines = layout.primitives.filter(
        (primitive) =>
          primitive.kind === 'text' && primitive.elementId === US_FOOD_ELEMENTS.ingredients,
      ).length
      const allowanceMm = listBox.heightMm / Math.max(listLines, 1)
      if (gapMm > allowanceMm + MEASUREMENT_TOLERANCE_MM) {
        findings.push(
          finding(usFoodContainsStatementTypeRule, {
            code: FDA_CONTAINS_NOT_ADJACENT,
            severity: 'violation',
            message:
              `The "Contains" statement sits ${mm(gapMm)} from the ingredient list, further than ` +
              `the ${mm(allowanceMm)} between the list's own lines. It must follow immediately ` +
              'after or sit adjacent to it.',
            measurement: { actual: mm(gapMm), required: `at most ${mm(allowanceMm)}` },
            elementId: US_FOOD_ELEMENTS.containsStatement,
          }),
        )
      }
    }

    if (findings.length > 0) return findings

    return [
      // §403(w)(1)(A): "printed immediately after" the list, in type no smaller: the artwork.
      passedOnArtwork(
        usFoodContainsStatementTypeRule,
        FDA_CONTAINS_TYPE_MET,
        `The "Contains" statement is set at ${mm(containsMm)} beside an ingredient list at ` +
          `${mm(listMm)}, immediately after it.`,
        US_FOOD_ELEMENTS.containsStatement,
      ),
    ]
  },
}
