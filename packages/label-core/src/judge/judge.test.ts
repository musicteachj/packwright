/**
 * The judge reports exactly what the browser reported before it existed.
 *
 * `legacyReport` below is the report as `apps/web` assembled it at `fe0112f`, the
 * commit before this module: the editor store's `findings`, `declined`,
 * `findingsBySeverity`, `failures`, `passes`, `hasBlocking` and `uncertifiable`,
 * which the audit report (`apps/web/src/audit/report.ts`) built the same way. It is
 * copied here, frozen, as the oracle, so moving the assembly into one function is
 * shown to change nothing a reader sees — finding by finding, in order, for every
 * known-bad fixture, every conformant control and every permission document the
 * rule sweep builds.
 *
 * The cannot-be-checked half moved here verbatim, as `uncheckableIn`; its oracle is
 * `legacyUncheckable` below, the same code as it stood in `apps/web`, so the move
 * is checked against the text it moved from rather than against itself.
 */

import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import type { ResolvedLayout } from '../layout/types'
import { declinedChecks, runRules } from '../rules/registry'
import { compareSeverity, type RuleContext } from '../rules/types'
import { CONFORMANT_FIXTURE, GS1_RETAIL_FIXTURES } from '../rules/fixtures/gs1Retail'
import { GHS_CONFORMANT, GHS_FIXTURES } from '../rules/fixtures/ghs'
import { PERMISSION_PATHS } from '../rules/fixtures/sweep'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES, US_FOOD_SMALL_PANEL } from '../rules/fixtures/usFood'
import type { Finding, Severity } from '../types/index'
import { judgeLabel, type JudgeRequest } from './judge'

/** `apps/web/src/uncheckable.ts` at `fe0112f`, frozen. */
function legacyUncheckable(layout: ResolvedLayout) {
  const byElement = new Map<
    string,
    { text: string; explanation?: { what: string; why: string } }[]
  >()
  const add = (
    elementId: string,
    reason: { text: string; explanation?: { what: string; why: string } },
  ) => {
    const existing = byElement.get(elementId)
    if (existing === undefined) byElement.set(elementId, [reason])
    else existing.push(reason)
  }
  for (const symbol of layout.symbols) {
    if (symbol.overprintedBy.length > 0) {
      add(symbol.elementId, {
        text:
          `Artwork is printed over the ${symbol.symbology} symbol. A symbol with ink through ` +
          'it will not scan whatever its margins measure.',
      })
    }
  }
  for (const omission of layout.omissions) {
    add(omission.elementId, {
      text: omission.reason,
      ...(omission.explanation === undefined ? {} : { explanation: omission.explanation }),
    })
  }
  return [...byElement.entries()].map(([elementId, reasons]) => ({ elementId, reasons }))
}

/** `apps/web/src/stores/labelDocument.ts` at `fe0112f`, the computed report, frozen. */
function legacyReport(context: RuleContext) {
  const findings = runRules(context)
  const groups = new Map<Severity, Finding[]>()
  for (const finding of findings) {
    const group = groups.get(finding.severity)
    if (group) group.push(finding)
    else groups.set(finding.severity, [finding])
  }
  return {
    findings,
    declined: declinedChecks(context),
    groups: [...groups.entries()].sort(([a], [b]) => compareSeverity(a, b)),
    failures: findings.filter((f) => f.severity !== 'pass'),
    passes: findings.filter((f) => f.severity === 'pass'),
    blocking: findings.some((f) => f.severity === 'blocking'),
    uncheckable: legacyUncheckable(context.layout),
  }
}

/** Every document the rule sweep judges, as a request the judge accepts. */
const documents: { name: string; request: JudgeRequest }[] = [
  ...[
    ...GS1_RETAIL_FIXTURES,
    { name: 'conformant', ...CONFORMANT_FIXTURE },
    // Artwork printed through the bars, from `rules.test.ts` — the one case that makes
    // the cannot-be-checked list say its overprint sentence, which no fixture reaches.
    {
      name: 'artwork printed over the symbol',
      data: {
        gtin: '036000291452',
        artwork: { text: 'X', anchor: 'centre' as const, widthMm: 6, heightMm: 6 },
      },
      stock: CONFORMANT_FIXTURE.stock,
    },
  ].map((fixture) => ({
    name: `gs1: ${fixture.name}`,
    request: {
      labelType: 'gs1-retail' as const,
      data: fixture.data,
      stock: fixture.stock,
      barcode: bwip,
    },
  })),
  ...[...GHS_FIXTURES, { name: 'conformant', ...GHS_CONFORMANT }].map((fixture) => ({
    name: `ghs: ${fixture.name}`,
    request: { labelType: 'ghs-chemical' as const, data: fixture.data, stock: fixture.stock },
  })),
  ...[
    ...US_FOOD_FIXTURES,
    { name: 'conformant', ...US_FOOD_CONFORMANT },
    { name: 'small panel', ...US_FOOD_SMALL_PANEL },
    ...PERMISSION_PATHS.map(({ label, data, stock }) => ({
      name: label,
      data,
      stock: stock ?? US_FOOD_CONFORMANT.stock,
    })),
  ].map((fixture) => ({
    name: `us-food: ${fixture.name}`,
    request: { labelType: 'us-food' as const, data: fixture.data, stock: fixture.stock },
  })),
]

describe('the judge, against the report the browser built', () => {
  it('has the whole sweep to compare, every label type among it', () => {
    expect(documents.length).toBeGreaterThan(60)
    expect(new Set(documents.map((d) => d.request.labelType)).size).toBe(3)
  })

  it.each(documents.map((d) => [d.name, d.request] as const))(
    'reports the same: %s',
    (_name, request) => {
      const judged = judgeLabel(request)
      if (judged.outcome === 'refused') throw new Error(`refused: ${judged.reason}`)
      const { layout, outcome: _outcome, ...report } = judged
      expect(report).toEqual(legacyReport({ ...request, layout } as RuleContext))
    },
  )

  it('reaches the overprint sentence, so the moved text is compared and not assumed', () => {
    const overprinted = documents.find((d) => d.name === 'gs1: artwork printed over the symbol')!
    const judged = judgeLabel(overprinted.request)
    expect(
      judged.outcome === 'judged' && judged.uncheckable.flatMap((u) => u.reasons),
    ).toContainEqual({
      text: expect.stringMatching(/^Artwork is printed over the UPC-A symbol\./),
    })
  })
})

describe('what the judge refuses', () => {
  it('refuses a label the engine cannot lay out, with the engine’s reason', () => {
    const judged = judgeLabel({
      labelType: 'ghs-chemical',
      data: GHS_CONFORMANT.data,
      stock: { widthMm: 10, heightMm: 10, marginMm: 6 },
    })
    expect(judged.outcome).toBe('refused')
    expect(judged.outcome === 'refused' && judged.reason).toMatch(/margin leaves no panel/)
  })

  it('refuses a UPC-A label handed no barcode encoder, rather than judge one never drawn', () => {
    // The type requires the encoder; a caller that loses it at runtime — an untyped
    // request from the server, say — must not get a judgement of a label whose symbol
    // was never laid out, which could pass barcode rules on a barcode never printed.
    const judged = judgeLabel({
      labelType: 'gs1-retail',
      data: CONFORMANT_FIXTURE.data,
      stock: CONFORMANT_FIXTURE.stock,
    } as unknown as JudgeRequest)
    expect(judged).toEqual({
      outcome: 'refused',
      reason: expect.stringMatching(/^A UPC-A label cannot be judged without a barcode encoder/),
    })
  })

  it.each([
    ['null', null],
    ['an object with no render function', {}],
  ])('refuses a UPC-A label whose encoder is %s, as it refuses a missing one', (_name, barcode) => {
    // An untyped request — JSON parsed by the server — can carry anything here.
    const judged = judgeLabel({
      labelType: 'gs1-retail',
      data: CONFORMANT_FIXTURE.data,
      stock: CONFORMANT_FIXTURE.stock,
      barcode,
    } as unknown as JudgeRequest)
    expect(judged.outcome).toBe('refused')
  })

  it('refuses a label type it does not know, rather than crash in the rules', () => {
    const judged = judgeLabel({
      labelType: 'pharma-leaflet',
      data: {},
      stock: CONFORMANT_FIXTURE.stock,
    } as unknown as JudgeRequest)
    expect(judged).toEqual({
      outcome: 'refused',
      reason: expect.stringMatching(/^There is no label type "pharma-leaflet"/),
    })
  })

  it('refuses a symbol the encoder could not produce, rather than crash', () => {
    // `SymbolLayoutError` is its own class, not a `LayoutError`; an encoder that draws
    // no bars raises one from inside the engine. Found by `/code-review high` on #79.
    const judged = judgeLabel({
      labelType: 'gs1-retail',
      data: CONFORMANT_FIXTURE.data,
      stock: CONFORMANT_FIXTURE.stock,
      barcode: { render: (_options, drawing) => drawing.end() },
    })
    expect(judged).toEqual({
      outcome: 'refused',
      reason: expect.stringMatching(/produced no bars/),
    })
  })
})
