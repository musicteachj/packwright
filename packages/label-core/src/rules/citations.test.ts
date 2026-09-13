/**
 * A rule declares every provision it can cite.
 *
 * The `/rules` catalogue is generated from `citationsOf`, so a provision a rule
 * enforces and does not declare is a provision nobody browsing this tool can
 * discover — and a rule listed under one paragraph while reporting under another
 * is worse than that: it is a wrong answer to the question the catalogue exists
 * to answer.
 *
 * Enforced here rather than in `finding()` because several references are looked
 * up from tables at judgement time — `{ ...CITATION, reference: verdict.reference }`
 * — so a throw would turn an undeclared-but-real provision into a crash in front
 * of a user instead of a red build.
 *
 * **This check runs in one direction only, and the other one bites.** It proves
 * that everything cited is declared; it cannot prove that everything declared is
 * citable, because reachability is not decidable from a fixture set. A rule that
 * over-declares advertises a check that never runs, which is the catalogue's
 * version of a rule that can never fail — and the first draft of these lists did
 * exactly that: `us-food/dual-column-required` took its references from
 * `DUAL_COLUMN_BASIS_REFERENCE`, which is keyed on every `DualColumnBasis`
 * including the voluntary ones, while `dualColumnDuty` returns two of the seven.
 * It claimed to enforce 101.9(e)(5) and (b)(10)(iii) and had no path to either.
 *
 * So a derived list has to be derived from what the rule can *reach*, not from
 * whatever table is nearest, and the derivation wants a type annotation that
 * fails the build when the reachable set changes. Where neither is possible the
 * list is written out with the reason beside it.
 */

import { describe, expect, it } from 'vitest'
import { layOutUpcALabel } from '../layout/engine'
import { layOutGhsLabel } from '../layout/ghsEngine'
import { layOutUsFoodLabel } from '../layout/usFoodEngine'
import * as bwip from 'bwip-js/generic'
import { GS1_RETAIL_FIXTURES, CONFORMANT_FIXTURE } from './fixtures/gs1Retail'
import { GHS_FIXTURES, GHS_CONFORMANT } from './fixtures/ghs'
import { US_FOOD_FIXTURES, US_FOOD_CONFORMANT, US_FOOD_SMALL_PANEL } from './fixtures/usFood'
import { GHS_RULES, GS1_RETAIL_RULES, US_FOOD_RULES, listRules } from './registry'
import { citationsOf } from './types'
import type { Citation, Finding } from '../types/index'

/**
 * Every finding, **attributed to the rule that emitted it**.
 *
 * The first version of this pooled every declaration into one set and asked
 * whether each emitted reference appeared anywhere in it. That is far weaker than
 * it reads: five references are declared by more than one rule today, so deleting
 * 101.9(d)(3)(ii) from `us-food/nutrition-type-size` left the suite green because
 * `us-food/serving-size` happens to declare it too. A check that another rule can
 * satisfy on your behalf is not a check on you.
 *
 * Each rule set is therefore run rule by rule against a context it already
 * matches, rather than through `runRules` — which also means withheld passes are
 * seen, since a pass a rule emitted still carries a citation it must have
 * declared.
 */
function undeclaredByRule(): string[] {
  const problems: string[] = []

  const check = (
    rule: { id: string; citations?: readonly Citation[]; citation: Citation },
    findings: Finding[],
  ) => {
    const declared = new Set(citationsOf(rule as never).map((citation) => citation.reference))
    for (const result of findings) {
      if (!declared.has(result.citation.reference)) {
        problems.push(`${rule.id} emitted ${result.citation.reference} without declaring it`)
      }
    }
  }

  for (const fixture of [...GS1_RETAIL_FIXTURES, CONFORMANT_FIXTURE]) {
    const layout = layOutUpcALabel(bwip as never, { data: fixture.data, stock: fixture.stock })
    const context = {
      labelType: 'gs1-retail',
      data: fixture.data,
      stock: fixture.stock,
      layout,
    } as const
    for (const rule of GS1_RETAIL_RULES) check(rule, rule.check(context))
  }

  for (const fixture of [...GHS_FIXTURES, GHS_CONFORMANT]) {
    const layout = layOutGhsLabel({ data: fixture.data, stock: fixture.stock })
    const context = {
      labelType: 'ghs-chemical',
      data: fixture.data,
      stock: fixture.stock,
      layout,
    } as const
    for (const rule of GHS_RULES) check(rule, rule.check(context))
  }

  /**
   * Documents that reach paragraphs no fixture does.
   *
   * The fixtures are known-bad labels, one per violation code, so a provision
   * cited only from a *permission* is never exercised by them — 101.100 excuses a
   * label from bearing an ingredient list, and no fixture is exempt because there
   * is nothing bad about being exempt. Without this the check passed whether or
   * not `us-food/ingredient-statement` declared the paragraph it reports under,
   * which is how the omission survived the first pass.
   */
  const conditionalPaths = [
    { ...US_FOOD_CONFORMANT.data, ingredients: [], ingredientsExempt: true },
  ]

  for (const fixture of [
    ...US_FOOD_FIXTURES,
    US_FOOD_CONFORMANT,
    US_FOOD_SMALL_PANEL,
    ...conditionalPaths.map((data) => ({ data, stock: US_FOOD_CONFORMANT.stock })),
  ]) {
    const layout = layOutUsFoodLabel({ data: fixture.data, stock: fixture.stock })
    const context = {
      labelType: 'us-food',
      data: fixture.data,
      stock: fixture.stock,
      layout,
    } as const
    for (const rule of US_FOOD_RULES) check(rule, rule.check(context))
  }

  return [...new Set(problems)].sort()
}

describe('the citations a rule declares', () => {
  it("cover every citation that rule's own findings carry", () => {
    expect(undeclaredByRule(), 'a rule cited a provision it does not declare').toEqual([])
  })

  it('lists the primary citation first, so a catalogue can lead with it', () => {
    for (const rule of listRules()) {
      expect(citationsOf(rule)[0], rule.id).toEqual(rule.citation)
    }
  })

  it('declares no provision twice', () => {
    for (const rule of listRules()) {
      const references = citationsOf(rule).map((citation) => citation.reference)
      expect(new Set(references).size, `${rule.id} lists a provision twice`).toBe(references.length)
    }
  })
})
