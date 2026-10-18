import { describe, expect, it } from 'vitest'
import { fuzzStrings } from '../../testing/fuzz'
import type { UsFoodContext } from '../types'
import {
  FDA_NET_QUANTITY_DUAL_MET,
  FDA_NET_QUANTITY_METRIC_NOT_SI,
  usFoodNetQuantityDualDeclarationRule,
} from './netQuantityDualDeclaration'

/**
 * The pattern the SI amount was found with before it was rewritten to run in linear
 * time (`docs/security-review-2026-10-18.md`, finding 1: 212 s for one declaration),
 * kept as the oracle. Copied as it was, units and all.
 */
const SI_AMOUNT_AS_IT_WAS = new RegExp(
  '\\d(?:[\\d.,]*\\d)?\\s*(' +
    '(?:da|k|h|d|c|m|µ|μ)?(?:g|l|m(?:[²³23])?)' +
    '|' +
    '(?:(?:square|cubic)\\s+)?(?:kilo|hecto|deka|deca|deci|centi|milli|micro)?' +
    '(?:grams?|lit(?:er|re)s?|met(?:er|re)s?)' +
    ')(?![a-z])',
  'i',
)

const checkMetric = (metric: string) =>
  usFoodNetQuantityDualDeclarationRule.check({
    data: { netQuantity: { inchPound: 'NET WT 12 OZ', metric } },
  } as unknown as UsFoodContext)

describe('the SI amount, found in linear time', () => {
  it('finds the amount the pattern it replaced found, in any declaration', () => {
    const alphabet = [
      '1',
      '0',
      '.',
      ',',
      ' ',
      ' ',
      '\t',
      'g',
      'G',
      'm',
      'l',
      'L',
      'k',
      'd',
      'a',
    ].concat(['²', '3', 'µ', 'μ', 's', 'q', 'u', 'r', 'e', 'c', 'b', 'i', 't', 'x', '(', ')'])
    for (const metric of fuzzStrings(alphabet, { count: 20_000, maxLength: 16 })) {
      if (metric.trim() === '') continue
      const expected = SI_AMOUNT_AS_IT_WAS.exec(metric)?.[0]
      const [finding] = checkMetric(metric)
      if (expected === undefined) {
        expect(finding?.code, JSON.stringify(metric)).toBe(FDA_NET_QUANTITY_METRIC_NOT_SI)
      } else {
        expect(finding?.code, JSON.stringify(metric)).toBe(FDA_NET_QUANTITY_DUAL_MET)
        expect(finding?.message, JSON.stringify(metric)).toContain(`("${expected}")`)
      }
    }
  })

  it('reads the amount from words the pattern was written for', () => {
    for (const [metric, amount] of [
      ['(340 g)', '340 g'],
      ['1,000 ml', '1,000 ml'],
      ['about 1.5 litres', '1.5 litres'],
      ['2 square meters', '2 square meters'],
      ['12., 340 G', '340 G'],
      ['.5 kg', '5 kg'],
    ] as const) {
      expect(checkMetric(metric)[0]?.message, metric).toContain(`("${amount}")`)
    }
  })
})
