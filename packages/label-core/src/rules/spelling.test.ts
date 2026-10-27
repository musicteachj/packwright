/**
 * What the engine says is in American English.
 *
 * The findings, the rule titles, the reasons a check did not run or could not be
 * made, and the field descriptions an AI client reads were written with "litres",
 * "labelling" and "recognises", and were respelled on 2026-10-27. Nothing else
 * would notice them drifting back, so this judges every fixture and reads what
 * comes out, and reads the request schema's descriptions too.
 *
 * Two kinds of text keep their source's spelling, and only those exact phrases are
 * excused, wherever they appear: the CLP Table 1.3 capacity bands ("Not exceeding
 * 3 litres"), which the size findings quote, and CLP's hazard class name
 * "sensitisation", on a finding that cites CLP. Matching quote marks was tried
 * first and was fooled by an unpaired inch mark, so nothing here depends on them.
 *
 * What this does not read: the web app's own copy, and the `/mcp` server's tool
 * and instruction text, which live outside this package.
 */
import * as bwip from 'bwip-js/generic'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { GHS_LABEL_DIMENSION_BANDS } from '../ghs/labelDimensions'
import { judgeLabel, type JudgeRequest } from '../judge/judge'
import { LabelCheckRequestOutline } from '../schema/labelDocument'
import { GHS_CONFORMANT, GHS_FIXTURES } from './fixtures/ghs'
import { CONFORMANT_FIXTURE, GS1_RETAIL_FIXTURES } from './fixtures/gs1Retail'
import { sweepEveryRule } from './fixtures/sweep'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES } from './fixtures/usFood'
import { listRules } from './registry'

const BRITISH =
  /\b(litres?|millimetres?|labelling|labelled|labeller|recognis(e|es|ed|ing)|catalogue|colours?|modelled|normalised|centred|sensitisation)\b/gi

const QUOTED_BANDS = GHS_LABEL_DIMENSION_BANDS.map((band) => band.capacityText)

/** Every British spelling in `text`, after the quoted bands are taken out. */
function britishIn(text: string, { clpClassNames = false } = {}): string[] {
  let rest = text
  for (const band of QUOTED_BANDS) rest = rest.split(band).join('')
  const words = [...rest.matchAll(BRITISH)].map((match) => match[0])
  return clpClassNames ? words.filter((word) => word.toLowerCase() !== 'sensitisation') : words
}

const report = (where: string, text: string, words: string[]) =>
  words.length ? [`${where} [${words.join(', ')}]: ${text}`] : []

/** Every fixture as a judge request: drawn here, and described with and without its size. */
function requests(): JudgeRequest[] {
  const drawn: JudgeRequest[] = [
    ...[...GS1_RETAIL_FIXTURES, CONFORMANT_FIXTURE].map((f): JudgeRequest => ({
      labelType: 'gs1-retail',
      data: f.data,
      stock: f.stock,
      barcode: bwip,
    })),
    ...[...GHS_FIXTURES, GHS_CONFORMANT].map((f): JudgeRequest => ({
      labelType: 'ghs-chemical',
      data: f.data,
      stock: f.stock,
    })),
    ...[...US_FOOD_FIXTURES, US_FOOD_CONFORMANT].map((f): JudgeRequest => ({
      labelType: 'us-food',
      data: f.data,
      stock: f.stock,
    })),
  ]
  // `/mcp` judges a label printed elsewhere, with its size or without it.
  return [
    ...drawn,
    ...drawn.map((r): JudgeRequest => ({ ...r, subject: 'described' })),
    ...drawn.map((r): JudgeRequest => ({ ...r, subject: 'described', sizeUnstated: true })),
  ]
}

/** Every `description` in a JSON Schema, however deep. */
function descriptions(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(descriptions)
  if (node === null || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([key, value]) =>
    key === 'description' && typeof value === 'string' ? [value] : descriptions(value),
  )
}

describe('the engine speaks American English', () => {
  const swept = sweepEveryRule(bwip)

  it('in every finding the rules report, apart from what they quote', () => {
    const offending = swept.flatMap(({ finding }) => {
      const clpClassNames = finding.citation.authority === 'EU'
      return [
        finding.message,
        finding.measurement?.actual ?? '',
        finding.measurement?.required ?? '',
      ].flatMap((text) => report(finding.code, text, britishIn(text, { clpClassNames })))
    })
    expect([...new Set(offending)]).toEqual([])
  })

  it('in every rule title', () => {
    const offending = listRules().flatMap((rule) =>
      report(rule.id, rule.title, britishIn(rule.title)),
    )
    expect(offending).toEqual([])
  })

  it('in every reason a check did not run or could not be made', () => {
    const offending = requests().flatMap((request) => {
      const judgement = judgeLabel(request)
      // A refusal is a request this test built wrong, not a sentence to read.
      if (judgement.outcome !== 'judged') return [`refused: ${judgement.reason}`]
      return [
        ...judgement.declined.flatMap((check) =>
          [check.title, check.reason].flatMap((text) =>
            report(check.ruleId, text, britishIn(text)),
          ),
        ),
        ...judgement.uncheckable.flatMap((element) =>
          element.reasons.flatMap(({ text }) => report(element.elementId, text, britishIn(text))),
        ),
      ]
    })
    expect([...new Set(offending)]).toEqual([])
  })

  it('in every field description an AI client reads', () => {
    // The outline is the schema `/mcp` publishes for `check_label` (apps/api/src/mcp/server.ts).
    const schema = z.toJSONSchema(LabelCheckRequestOutline, { unrepresentable: 'any', io: 'input' })
    const all = descriptions(schema)
    expect(all.length, 'the schema has descriptions to read').toBeGreaterThan(10)
    expect(all.flatMap((text) => report('schema', text, britishIn(text)))).toEqual([])
  })

  it('reaches the findings this was written for', () => {
    // A guard over findings nobody emits guards nothing. These are respelled or
    // re-quoted messages; if a fixture stops producing one, this says so.
    const messages = swept.map(({ finding }) => finding.message).join('\n')
    expect(messages).toMatch(/\bliters?\b/)
    expect(messages).toMatch(/Table 1\.3's "[^"]+" band/)
  })

  it('excuses only the exact phrases it names', () => {
    // An excused phrase must not shelter its neighbors, and one unpaired quote
    // mark must not hide what follows it.
    expect(britishIn('a 1/16" margin, then labelling and "Not exceeding 3 litres"')).toEqual([
      'labelling',
    ])
    expect(
      britishIn('respiratory sensitisation, and labelling after it', { clpClassNames: true }),
    ).toEqual(['labelling'])
  })
})
