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
import * as bwip from 'bwip-js/generic'
import { sweepEveryRule } from './fixtures/sweep'
import { listRules } from './registry'
import { citationsOf } from './types'

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
 * The sweep it runs on lives in `fixtures/sweep.ts`, shared with
 * `certification.test.ts`. It runs each rule set rule by rule against a context
 * it already matches, rather than through `runRules` — which also means withheld
 * passes are seen, since a pass a rule emitted still carries a citation it must
 * have declared. The documents that reach permission paths moved there with it;
 * they were written here, and a second sweep copied from this one without them
 * is how `certification.test.ts` shipped blind to both of the registry's
 * document-resting passes.
 */
function undeclaredByRule(): string[] {
  const problems: string[] = []

  for (const { rule, finding } of sweepEveryRule(bwip)) {
    const declared = new Set(citationsOf(rule).map((citation) => citation.reference))
    if (!declared.has(finding.citation.reference)) {
      problems.push(`${rule.id} emitted ${finding.citation.reference} without declaring it`)
    }
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
