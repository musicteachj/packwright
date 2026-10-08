/**
 * A rule declares the severities its codes are emitted at, and only those.
 *
 * `/rules` shows each code with its severity's icon and word, read from
 * `Rule.codes`. A declaration that disagrees with the rule tells a user browsing
 * the catalogue that a check is a pass, or a WARNING, when it is something else.
 *
 * **Enforced here rather than in `finding()`**, for the reason `citations.test.ts`
 * gives about citations. A severity is often computed —
 * `band.labelDimensionIsBestEffort ? 'advisory' : 'violation'` — so a throw would
 * turn a branch no fixture reaches into a crash in front of a user. That is not
 * hypothetical: the first version of this declaration was measured from the
 * fixture sweep and threw there, and it declared `GHS_LABEL_BELOW_MINIMUM_SIZE`
 * as `violation` alone, because no fixture reached the "if possible" band. A
 * small bottle with a small label would have crashed the editor.
 *
 * **Both directions**, unlike the citation check. Every emitted severity must be
 * declared, and every declared severity must be emitted somewhere in the sweep —
 * apart from the codes listed below, which no fixture reaches yet, each read from
 * its call site instead. An over-declared severity is a catalogue entry for a
 * verdict the rule never gives.
 */

import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { sweepEveryRule } from './fixtures/sweep'
import { listRules } from './registry'
import { codesOf, severitiesOf } from './types'

/**
 * Codes the sweep does not reach, so their declarations rest on reading the call
 * site rather than on observing it. Read on 2026-10-08; each is emitted at one severity only.
 * `docs/BACKLOG.md` records why the four pass codes are out of reach, and the
 * two guidance codes under "The rule catalogue's severities".
 */
const UNREACHED: Readonly<Record<string, string>> = {
  GHS_PICTOGRAM_COMPLETE: "passedOnArtwork in ghs/pictogramIntegrity.ts — 'pass'",
  GHS_PICTOGRAM_SET_MATCHES: "passedOnArtwork in ghs/pictogramSet.ts — 'pass'",
  GHS_PICTOGRAM_PRECEDENCE_OPTIONAL:
    "ghs/pictogramPrecedence.ts — 'guidance' on the non-mandatory branch",
  GHS_SMALL_CONTAINER_AVAILABLE: "ghs/smallContainer.ts — severity: 'guidance'",
  GHS_SMALL_CONTAINER_COMPLETE: "passedOnArtwork in ghs/smallContainer.ts — 'pass'",
  FDA_NET_QUANTITY_METRIC_NOT_REQUIRED:
    "passedOnDocument in usFood/netQuantityDualDeclaration.ts — 'pass'",
}

const swept = sweepEveryRule(bwip)

describe('the severities a rule declares', () => {
  it('include every severity its findings are emitted at', () => {
    const undeclared = swept
      .filter(({ rule, finding }) => !severitiesOf(rule, finding.code).includes(finding.severity))
      .map(({ rule, finding }) => `${rule.id} emitted ${finding.code} as ${finding.severity}`)
    expect([...new Set(undeclared)].sort()).toEqual([])
  })

  it('are each emitted somewhere, unless the code is one no fixture reaches yet', () => {
    const emitted = new Set(swept.map(({ finding }) => `${finding.code} ${finding.severity}`))
    const neverSeen = listRules().flatMap((rule) =>
      codesOf(rule)
        .filter((code) => !(code in UNREACHED))
        .flatMap((code) =>
          severitiesOf(rule, code)
            .filter((severity) => !emitted.has(`${code} ${severity}`))
            .map((severity) => `${rule.id} declares ${code} as ${severity}, never emitted`),
        ),
    )
    expect(neverSeen).toEqual([])
  })

  it('lists as unreached only codes that really are', () => {
    // Otherwise the list above outlives the fixture that reaches a code, and
    // excuses that code from the check for good.
    const reached = new Set(swept.map(({ finding }) => finding.code))
    const declared = new Set(listRules().flatMap((rule) => codesOf(rule)))
    for (const code of Object.keys(UNREACHED)) {
      expect(declared, `${code} is not declared by any rule`).toContain(code)
      expect(reached, `${code} is reached now; remove it from UNREACHED`).not.toContain(code)
    }
  })
})
