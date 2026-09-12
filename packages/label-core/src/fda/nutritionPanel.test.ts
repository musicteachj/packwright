import { describe, expect, it } from 'vitest'
import { MM_PER_POINT } from '../geometry/units'
import {
  NUTRITION_FOOTNOTE,
  NUTRITION_PANEL_RULES,
  NUTRITION_PANEL_TYPE,
  nutritionTypeFor,
} from './nutritionPanel'

describe('the rule weights FDA states', () => {
  // Guidance, not requirement — 101.9 only "strongly recommends" Appendix B.
  // Pinned all the same, because the figures came from a document that had to be
  // decoded rather than read, and a transcription slip would be invisible.
  it('converts each stated point value to millimetres', () => {
    expect(NUTRITION_PANEL_RULES.boxMm).toBeCloseTo(0.5 * MM_PER_POINT, 10)
    expect(NUTRITION_PANEL_RULES.thickMm).toBeCloseTo(7 * MM_PER_POINT, 10)
    expect(NUTRITION_PANEL_RULES.mediumMm).toBeCloseTo(3 * MM_PER_POINT, 10)
    expect(NUTRITION_PANEL_RULES.hairlineMm).toBeCloseTo(0.25 * MM_PER_POINT, 10)
  })

  it('puts a 7 pt bar at 2.47 mm and a hairline at 0.09 mm', () => {
    // 7 x 25.4/72 = 2.4694; 0.25 x 25.4/72 = 0.0882. Worked by hand, because the
    // whole point of these constants is that they are transcribed figures.
    expect(NUTRITION_PANEL_RULES.thickMm).toBeCloseTo(2.4694, 4)
    expect(NUTRITION_PANEL_RULES.hairlineMm).toBeCloseTo(0.0882, 4)
  })

  it('keeps the bars in the order of weight the illustrations show', () => {
    const { hairlineMm, boxMm, mediumMm, thickMm } = NUTRITION_PANEL_RULES
    expect(hairlineMm).toBeLessThan(boxMm)
    expect(boxMm).toBeLessThan(mediumMm)
    expect(mediumMm).toBeLessThan(thickMm)
  })
})

describe('the type sizes 101.9 states', () => {
  it('carries the minimums the regulation gives in points', () => {
    expect(NUTRITION_PANEL_TYPE.servingSizePt).toBe(10)
    expect(NUTRITION_PANEL_TYPE.caloriesWordPt).toBe(16)
    expect(NUTRITION_PANEL_TYPE.nutrientPt).toBe(8)
    expect(NUTRITION_PANEL_TYPE.nutrientLeadingPt).toBe(4)
  })

  it('makes the heading no smaller than anything but the Calories figure', () => {
    // 101.9(d)(2). The heading and the Calories figure are the two largest, and
    // the heading may not be the smaller of them.
    const { headingPt, caloriesFigurePt, ...rest } = NUTRITION_PANEL_TYPE
    expect(headingPt).toBeGreaterThanOrEqual(caloriesFigurePt)
    for (const [name, value] of Object.entries(rest)) {
      expect(headingPt, `heading is smaller than ${name}`).toBeGreaterThanOrEqual(value)
    }
  })
})

describe('the footnote is quoted, never composed', () => {
  it('reads exactly as 101.9(d)(9) sets it', () => {
    expect(NUTRITION_FOOTNOTE.standard).toBe(
      '*The % Daily Value tells you how much a nutrient in a serving of food contributes to a ' +
        'daily diet. 2,000 calories a day is used for general nutrition advice.',
    )
  })

  it('substitutes 1,000 calories for a food for children 1 through 3', () => {
    expect(NUTRITION_FOOTNOTE.childrenOneToThree).toContain('1,000 calories a day')
    expect(NUTRITION_FOOTNOTE.childrenOneToThree).not.toContain('2,000')
    // Everything before the substituted sentence is identical; the paragraph
    // replaces one figure and nothing else.
    const split = (text: string) => text.split('. ')[0]
    expect(split(NUTRITION_FOOTNOTE.childrenOneToThree)).toBe(split(NUTRITION_FOOTNOTE.standard))
  })

  it('offers the first sentence alone, which 101.9(d)(9) permits separately', () => {
    expect(NUTRITION_FOOTNOTE.standard.startsWith(NUTRITION_FOOTNOTE.firstSentenceOnly)).toBe(true)
    expect(NUTRITION_FOOTNOTE.firstSentenceOnly).not.toContain('calories a day')
  })
})

describe('the minimums each display answers to', () => {
  // 101.9(d)(1)(iii) and (d)(3). The reduced displays lower four figures and not
  // by the same amounts, which is the part easiest to flatten into one exception.
  it('keeps the vertical display at the figures 101.9(d) states', () => {
    const type = nutritionTypeFor('vertical')
    expect(type.servingsPerContainerPt).toBe(10)
    expect(type.servingSizePt).toBe(10)
    expect(type.caloriesWordPt).toBe(16)
    expect(type.caloriesFigurePt).toBe(22)
  })

  it('drops the Calories word to 10 point and the numeral to 14 on the reduced ones', () => {
    // "...shall be in a type size no smaller than 16 point except the type size
    // for this information required in the tabular displays ... shall be in a
    // type size no smaller than 10 point. The numeric amount ... no smaller than
    // 22 point, except ... for the tabular display for small packages ... and
    // for the linear display ... no smaller than 14 point."
    for (const format of ['tabular', 'linear'] as const) {
      const type = nutritionTypeFor(format)
      expect(type.caloriesWordPt, format).toBe(10)
      expect(type.caloriesFigurePt, format).toBe(14)
    }
  })

  it('drops both servings lines from 10 point to 9', () => {
    for (const format of ['tabular', 'linear'] as const) {
      expect(nutritionTypeFor(format).servingsPerContainerPt, format).toBe(9)
      expect(nutritionTypeFor(format).servingSizePt, format).toBe(9)
    }
  })

  it('leaves the nutrient rows and the small print alone', () => {
    // (d)(1)(iii) states 8 point for (d)(7) and (8) and 6 for (d)(4), (6) and
    // (9) with no format exception, so the reduced displays inherit them.
    for (const format of ['vertical', 'tabular', 'linear'] as const) {
      expect(nutritionTypeFor(format).nutrientPt, format).toBe(8)
      expect(nutritionTypeFor(format).footnotePt, format).toBe(6)
    }
  })

  it('lowers every reduced figure and raises none', () => {
    const vertical = nutritionTypeFor('vertical')
    for (const format of ['tabular', 'linear'] as const) {
      for (const [key, value] of Object.entries(nutritionTypeFor(format))) {
        expect(value, `${format}.${key}`).toBeLessThanOrEqual(
          vertical[key as keyof typeof vertical],
        )
      }
    }
  })
})
