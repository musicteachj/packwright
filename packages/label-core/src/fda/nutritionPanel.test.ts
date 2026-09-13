import { describe, expect, it } from 'vitest'
import { MM_PER_POINT } from '../geometry/units'
import {
  NUTRITION_DISPLAYS,
  NUTRITION_FOOTNOTE,
  NUTRITION_PANEL_RULES,
  NUTRITION_PANEL_TYPE,
  NUTRITION_TYPE_BY_DISPLAY,
  nutritionDisplayFor,
  nutritionTypeForDisplay,
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
  // 101.9(d)(1)(iii) and (d)(3) state four exceptions over four different lists
  // of paragraphs, and no two of the figures move together. Each list is pinned
  // on its own below, because a loop over "the reduced displays" is exactly the
  // flattening that put a 14 point numeral on (d)(11)'s tabular display and a 9
  // point servings statement beside it.
  const ALL = [
    'verticalD12',
    'tabularD11',
    'tabularDualColumnE6ii',
    'tabularSmallJ13',
    'linearSmallJ13',
  ] as const

  it('keeps the vertical display at the figures 101.9(d) states', () => {
    const type = nutritionTypeForDisplay('verticalD12')
    expect(type.servingsPerContainerPt).toBe(10)
    expect(type.servingSizePt).toBe(10)
    expect(type.caloriesWordPt).toBe(16)
    expect(type.caloriesFigurePt).toBe(22)
  })

  it('drops the Calories word to 10 point on every display but the vertical', () => {
    // (d)(1)(iii): "no smaller than 16 point except the type size for this
    // information required in the tabular displays as shown in paragraphs
    // (d)(11), (e)(6)(ii), and (j)(13)(ii)(A)(1) ... and the linear display for
    // small packages as shown in paragraph (j)(13)(ii)(A)(2) ... no smaller than
    // 10 point." All four.
    for (const display of ALL) {
      expect(nutritionTypeForDisplay(display).caloriesWordPt, display).toBe(
        display === 'verticalD12' ? 16 : 10,
      )
    }
  })

  it('drops the Calories numeral to 14 point on the two small-package displays only', () => {
    // (d)(1)(iii): "no smaller than 22 point, except the type size for this
    // information required for the tabular display for small packages as shown
    // in paragraph (j)(13)(ii)(A)(1) ... and for the linear display for small
    // packages as shown in paragraph (j)(13)(ii)(A)(2) ... no smaller than 14
    // point." (d)(11) and (e)(6)(ii) are absent from that list and keep 22.
    for (const display of ALL) {
      const small = display === 'tabularSmallJ13' || display === 'linearSmallJ13'
      expect(nutritionTypeForDisplay(display).caloriesFigurePt, display).toBe(small ? 14 : 22)
    }
  })

  it('pairs a 22 point numeral with a 10 point word on the two large tabular displays', () => {
    // The combination the flattened table could not represent, and the reason
    // this row exists: one exception lists three paragraphs and the other two.
    for (const display of ['tabularD11', 'tabularDualColumnE6ii'] as const) {
      const type = nutritionTypeForDisplay(display)
      expect(type.caloriesWordPt, display).toBe(10)
      expect(type.caloriesFigurePt, display).toBe(22)
    }
  })

  it('drops the servings statement to 9 point on the two small-package displays only', () => {
    // (d)(3)(i): "no smaller than 10 point, except ... no smaller than 9 point in
    // the tabular display for small packages as shown in paragraph
    // (j)(13)(ii)(A)(1) ... and the linear display for small packages as shown in
    // paragraph (j)(13)(ii)(A)(2)." (d)(11) and (e)(6)(ii) keep 10.
    for (const display of ALL) {
      const small = display === 'tabularSmallJ13' || display === 'linearSmallJ13'
      expect(nutritionTypeForDisplay(display).servingsPerContainerPt, display).toBe(small ? 9 : 10)
    }
  })

  it('drops "Serving size" to 9 point on every display but the vertical', () => {
    // (d)(3)(ii) names a wider set than (d)(3)(i) does: "in the tabular displays
    // as shown in paragraphs (d)(11) and (e)(6)(ii) ..., the tabular display for
    // small packages ..., and the linear display for small packages". This is the
    // one line where the two servings figures part company.
    for (const display of ALL) {
      expect(nutritionTypeForDisplay(display).servingSizePt, display).toBe(
        display === 'verticalD12' ? 10 : 9,
      )
    }
  })

  it('leaves the nutrient rows and the small print alone', () => {
    // (d)(1)(iii) states 8 point for (d)(7) and (8) and 6 for (d)(4), (6) and
    // (9) with no display exception, so every display inherits them.
    for (const display of ALL) {
      expect(nutritionTypeForDisplay(display).nutrientPt, display).toBe(8)
      expect(nutritionTypeForDisplay(display).footnotePt, display).toBe(6)
    }
  })

  it('lowers a figure on a reduced display and raises none', () => {
    const vertical = nutritionTypeForDisplay('verticalD12')
    for (const display of ALL) {
      for (const [key, value] of Object.entries(nutritionTypeForDisplay(display))) {
        expect(value, `${display}.${key}`).toBeLessThanOrEqual(
          vertical[key as keyof typeof vertical],
        )
      }
    }
  })

  it('names every display for the paragraph that illustrates it', () => {
    // The citation a finding carries comes from here, so a row whose key and
    // reference disagree would cite the wrong paragraph for a real defect.
    expect(NUTRITION_DISPLAYS).toEqual({
      verticalD12: '21 CFR 101.9(d)(12)',
      tabularD11: '21 CFR 101.9(d)(11)',
      tabularDualColumnE6ii: '21 CFR 101.9(e)(6)(ii)',
      tabularSmallJ13: '21 CFR 101.9(j)(13)(ii)(A)(1)',
      linearSmallJ13: '21 CFR 101.9(j)(13)(ii)(A)(2)',
    })
    expect(Object.keys(NUTRITION_TYPE_BY_DISPLAY)).toEqual(Object.keys(NUTRITION_DISPLAYS))
  })
})

describe('which display a package is presented under', () => {
  it('sends a tabular panel on a small package to (j)(13)(ii)(A)(1)', () => {
    expect(nutritionDisplayFor({ format: 'tabular', availableSqInches: 9 })).toBe('tabularSmallJ13')
    expect(
      nutritionDisplayFor({
        format: 'tabular',
        availableSqInches: 30,
        cannotAccommodateVertical: true,
      }),
    ).toBe('tabularSmallJ13')
  })

  it('sends a tabular panel on a large package to (d)(11)', () => {
    // (d)(11)(iii)'s route — insufficient continuous vertical space — carries no
    // area limit, so this is the display a 60 in² tall thin label reaches, and it
    // keeps the 22 point numeral.
    expect(nutritionDisplayFor({ format: 'tabular', availableSqInches: 60 })).toBe('tabularD11')
    expect(nutritionTypeForDisplay('tabularD11').caloriesFigurePt).toBe(22)
  })

  it('holds a tabular panel with no declared area to the larger figures', () => {
    // Nothing says the package is small, so the paragraph that would lower the
    // minimum has not been reached. The stricter reading, deliberately.
    expect(nutritionDisplayFor({ format: 'tabular' })).toBe('tabularD11')
  })

  it('takes the lower pair where a small package also carries a dual column', () => {
    // Both (j)(13)(ii)(A)(1) and (e)(6)(ii) reach it, and a panel entitled to two
    // displays must clear only the smaller minimum.
    expect(nutritionDisplayFor({ format: 'tabular', availableSqInches: 9, dualColumn: true })).toBe(
      'tabularSmallJ13',
    )
  })

  it('has only one paragraph for the linear display', () => {
    expect(nutritionDisplayFor({ format: 'linear', availableSqInches: 9 })).toBe('linearSmallJ13')
    expect(nutritionDisplayFor({ format: 'linear', availableSqInches: 60 })).toBe('linearSmallJ13')
  })
})
