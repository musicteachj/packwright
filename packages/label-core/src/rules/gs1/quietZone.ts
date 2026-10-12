/**
 * The blank space either side of the bars must meet the symbology's minimum.
 *
 * The most frequently violated rule in the General Specifications, and violated
 * precisely because it is invisible: the quiet zone is blank, so artwork
 * reclaims it without anyone realising it was load-bearing. The symbol then
 * fails at the till rather than in proof.
 *
 * This measures `clearSpaceLeftMm` — what the label actually leaves blank — and
 * not `requiredQuietZoneLeftMm`, which is 9X for a UPC-A and is true of every
 * UPC-A ever drawn. Comparing the requirement against itself is the shape this
 * bug takes, and it passes every label put to it.
 */

import { hasVerifiedQuietZone } from '../../geometry/symbol'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'
import { noVerdictOnADescribedLabel } from '../described'

export const GS1_QUIET_ZONE_TOO_NARROW = 'GS1_QUIET_ZONE_TOO_NARROW'
export const GS1_QUIET_ZONE_CLEAR = 'GS1_QUIET_ZONE_CLEAR'

// GS1 General Specifications Release 26.0 (Ratified Jan 26), read from the rendered
// pages at https://ref.gs1.org/standards/genspecs/ on 2026-10-12. 25.0's "figure
// 5.x-1" identifiers do not exist in 26.0, which numbers the tables; the figures
// themselves are unchanged (`geometry/symbol.ts`).
const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 General Specifications 26.0, §5.2.3.4, table 5-11',
  title: 'Quiet Zone widths by version',
}

const judgedAsDrawn: Gs1RetailRule = {
  id: 'gs1/quiet-zone',
  title: 'Each side of a symbol keeps its minimum quiet zone clear of other artwork.',
  citation: CITATION,
  codes: {
    [GS1_QUIET_ZONE_TOO_NARROW]: ['violation'],
    [GS1_QUIET_ZONE_CLEAR]: ['pass'],
  },
  appliesTo: 'gs1-retail',

  check({ layout }: Gs1RetailContext): Finding[] {
    const findings: Finding[] = []

    for (const symbol of layout.symbols) {
      // Most symbologies require more than the documented general 7X floor, so
      // falling back to it understates the requirement rather than overstating
      // it — and yields a confident pass on a label that will not scan. Where no
      // figure has been confirmed against the specification, this rule says
      // nothing at all rather than something reassuring.
      if (!hasVerifiedQuietZone(symbol.symbology)) continue

      // A symbol with ink printed through it, or drawn off the edge of its
      // stock, cannot be certified on the strength of its margins — so no pass
      // is issued for it. It is emphatically **not** a reason to withhold a
      // violation: an earlier version skipped the symbol outright, and a brand
      // block anchored bottom-left then produced a measured quiet zone of
      // 0.00 mm against a required 2.97 mm with every verdict reading "pass".
      // Fixing one false pass had manufactured another.
      const certifiable = symbol.overprintedBy.length === 0 && symbol.verticalOverflowMm === 0

      const sides = [
        {
          name: 'left',
          actualMm: symbol.clearSpaceLeftMm,
          requiredMm: symbol.requiredQuietZoneLeftMm,
        },
        {
          name: 'right',
          actualMm: symbol.clearSpaceRightMm,
          requiredMm: symbol.requiredQuietZoneRightMm,
        },
      ] as const

      for (const side of sides) {
        if (side.actualMm >= side.requiredMm - MEASUREMENT_TOLERANCE_MM) {
          if (!certifiable) continue
          findings.push(
            // Table 5-11 is about blank space either side on the printed label: the artwork.
            passedOnArtwork(
              quietZoneRule,
              GS1_QUIET_ZONE_CLEAR,
              `The ${side.name} quiet zone is ${mm(side.actualMm)}, clearing the ` +
                `${mm(side.requiredMm)} the specification requires.`,
              symbol.elementId,
            ),
          )
          continue
        }

        // A negative measurement is a different fact from a narrow one: the bars
        // themselves are running off the stock, and reporting "the quiet zone is
        // -1.35 mm" would leave a reader to work that out for themselves.
        const overrun =
          side.actualMm < 0
            ? ` The bars run ${mm(Math.abs(side.actualMm))} past the ${side.name} edge of the stock.`
            : ''

        findings.push(
          finding(quietZoneRule, {
            code: GS1_QUIET_ZONE_TOO_NARROW,
            severity: 'violation',
            message:
              `The ${side.name} quiet zone measures ${mm(side.actualMm)}; ` +
              `${symbol.symbology} requires ${mm(side.requiredMm)}.${overrun}`,
            measurement: { actual: mm(side.actualMm), required: mm(side.requiredMm) },
            elementId: symbol.elementId,
          }),
        )
      }
    }

    return findings
  },
}

/** The rule as drawn, giving no verdict on a label printed elsewhere — see `rules/described.ts`. */
export const quietZoneRule: Gs1RetailRule = noVerdictOnADescribedLabel(judgedAsDrawn, {
  why:
    'A quiet zone is the clear space between the bars and every other mark on the label, and ' +
    'a request describes only the barcode and one block of artwork, not everything printed ' +
    'around it.',
})
