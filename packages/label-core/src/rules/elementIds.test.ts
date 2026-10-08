/**
 * A finding names an element the engine drew, or names none.
 *
 * The editor outlines a finding's `elementId` on the canvas, and an id the layout
 * does not contain outlines nothing — silently: the finding is clickable, selecting
 * it does nothing, and the reader is left looking for a line that is not there.
 *
 * Five shipped. `us-food/nutrition-rounding` pointed a wrong Calories figure at
 * `food-nutrition-row-calories`, which no display has ever drawn — Calories is a
 * line of its own — and pointed any nutrient the panel's `order` left out at the
 * row that was therefore never drawn. A wrong check digit named the UPC-A symbol it
 * prevents from being drawn, and an exempt or unstated ingredient exemption named
 * the statement an exempt label does not carry. `nutritionPanel.ts` records learning the same
 * lesson once already, about selection. Asked of every finding in the sweep rather
 * than of the two rules, so the next one is caught wherever it is written.
 */

import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { sweepEveryRule } from './fixtures/sweep'
import { withholdUncertifiablePasses } from './registry'

/**
 * Findings whose id names an element on purpose though it is never drawn, each with
 * the reason. Held to the list in both directions by the test below.
 */
const KEYED_NOT_DRAWN: Readonly<Record<string, string>> = {
  // An exempt label draws no statement, but the id is also the key this pass is
  // withheld by if the statement's element is ever omitted — `elementId` doing two
  // jobs. BACKLOG.md, "A finding's element is where to look and what withholds it".
  FDA_INGREDIENTS_EXEMPT: 'the key its withholding reads',
}

describe('the element a finding names', () => {
  it('is one the engine drew', () => {
    const dangling = sweepEveryRule(bwip)
      .filter(({ finding }) => finding.elementId !== undefined)
      // What a user is shown. The sweep runs rule by rule, ahead of the withholding,
      // and an artwork pass it withholds is never on screen to be selected.
      .filter(({ finding, layout }) => withholdUncertifiablePasses([finding], layout).length > 0)
      .filter(({ finding }) => !(finding.code in KEYED_NOT_DRAWN))
      .filter(
        ({ finding, layout }) =>
          !layout.elements.some((element) => element.elementId === finding.elementId),
      )
      .map(
        ({ rule, finding, source }) =>
          `${rule.id} ${finding.code} → ${finding.elementId} (${source})`,
      )
    expect([...new Set(dangling)].sort()).toEqual([])
  })

  it('excuses only findings that really do name an undrawn element', () => {
    // Otherwise the list outlives the reason, and excuses the code for good.
    const excused = new Set(
      sweepEveryRule(bwip)
        .filter(
          ({ finding, layout }) =>
            finding.elementId !== undefined &&
            !layout.elements.some((element) => element.elementId === finding.elementId),
        )
        .map(({ finding }) => finding.code),
    )
    for (const code of Object.keys(KEYED_NOT_DRAWN)) expect(excused, code).toContain(code)
  })
})
