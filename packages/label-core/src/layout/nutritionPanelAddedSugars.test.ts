/**
 * The Added Sugars line, as 101.9(c)(6)(iii) words and places it.
 *
 * "Added sugars content shall be indented under Total Sugars and shall be
 * prefaced with the word 'Includes' followed by the amount (in grams) 'Added
 * Sugars' ('Includes 'X' g Added Sugars')." Every display this engine draws
 * printed "Added Sugars 0g" instead, at the same indent as Total Sugars — found
 * by the MCP "without" experiment of 2026-10-09, where a model reading the
 * engine's own conformant label pointed it out.
 *
 * The forms per display follow the regulation's own sample labels in 101.9:
 * "Includes 10g Added Sugars" on the standard vertical and the tabular display,
 * "Incl. Added Sugars" in the name column of the dual-column one, with the
 * amounts in the columns. This engine abbreviates nothing, so it prints the word
 * in full there too.
 *
 * Source: 21 CFR 101.9(c)(6)(iii) and the sample labels at (d)(12), (d)(11),
 * (e)(5) and (j)(13)(ii)(A)(2), read from the eCFR on 2026-10-10.
 */

import { describe, expect, it } from 'vitest'
import { NUTRIENT_IDS, nutrient } from '../fda/nutrients'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES } from '../rules/fixtures/usFood'
import { nutritionRowElementId } from '../templates/usFood'
import type { UsFoodLabelData, UsFoodNutritionFacts } from '../templates/usFood'
import { measureTextMm } from '../text/measure'
import type { ResolvedLayout, TextPrimitive } from './types'
import { layOutUsFoodLabel } from './usFoodEngine'

const panelOf = (extra: Partial<UsFoodNutritionFacts>): UsFoodLabelData => ({
  ...US_FOOD_CONFORMANT.data,
  nutritionFacts: { ...US_FOOD_CONFORMANT.data.nutritionFacts!, ...extra },
})

const rowTexts = (layout: ResolvedLayout, id: string): TextPrimitive[] =>
  layout.primitives.filter(
    (primitive): primitive is TextPrimitive =>
      primitive.kind === 'text' && primitive.elementId === nutritionRowElementId(id),
  )

/** The run that names the nutrient — the one not anchored at the right of a column. */
const nameOf = (layout: ResolvedLayout, id: string) =>
  rowTexts(layout, id).find((primitive) => primitive.anchor !== 'end')

describe('the standard vertical display', () => {
  const layout = layOutUsFoodLabel(US_FOOD_CONFORMANT)

  it('prefaces the line with "Includes", the amount before the name', () => {
    expect(nameOf(layout, 'added-sugars')?.text).toBe('Includes 0g Added Sugars')
  })

  it('indents it under Total Sugars, not beside it', () => {
    const totalSugars = nameOf(layout, 'total-sugars')!
    const addedSugars = nameOf(layout, 'added-sugars')!
    const totalCarbohydrate = nameOf(layout, 'total-carbohydrate')!
    expect(totalSugars.xMm).toBeGreaterThan(totalCarbohydrate.xMm)
    expect(addedSugars.xMm).toBeGreaterThan(totalSugars.xMm)
  })

  it('leaves every other row as it was', () => {
    expect(nameOf(layout, 'total-sugars')?.text).toBe('Total Sugars 1g')
    expect(nameOf(layout, 'protein')?.text).toBe('Protein 5g')
  })
})

describe('the dual-column display', () => {
  const layout = layOutUsFoodLabel({
    data: panelOf({
      columns: {
        mode: 'dual',
        basis: 'per-container',
        headings: ['Per serving', 'Per container'],
        secondAmounts: { 'added-sugars': 0 },
      },
    }),
    stock: US_FOOD_CONFORMANT.stock,
  })

  it('names the row "Includes Added Sugars" and keeps the amounts in the columns', () => {
    expect(nameOf(layout, 'added-sugars')?.text).toBe('Includes Added Sugars')
    const cells = rowTexts(layout, 'added-sugars')
      .filter((primitive) => primitive.anchor === 'end')
      .map((primitive) => primitive.text)
    expect(cells).toEqual(['0g 0%', '0g 0%'])
  })
})

describe('the tabular and linear displays', () => {
  const smallPackage = (format: 'tabular' | 'linear'): UsFoodLabelData => ({
    ...panelOf({
      format,
      availableSurfaceSqInches: 9,
      ...(format === 'linear' ? { cannotAccommodateTabular: true } : {}),
    }),
    container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
  })

  it.each(['tabular', 'linear'] as const)(
    'prints "Includes 0g Added Sugars" on the %s display',
    (format) => {
      const layout = layOutUsFoodLabel({
        data: smallPackage(format),
        stock: { widthMm: 50, heightMm: 60, marginMm: 3 },
      })
      // The linear display sets each word as its own run, trailing space included.
      const printed = rowTexts(layout, 'added-sugars')
        .map((primitive) => primitive.text)
        .join('')
        .replace(/\s+/g, ' ')
      expect(printed).toContain('Includes 0g Added Sugars')
      expect(printed).not.toMatch(/^Added Sugars/)
    },
  )
})

describe('indentation on the tabular display', () => {
  // (c)(2)(i), (c)(2)(ii), (c)(6)(i) and (c)(6)(ii) each say the sub-row "shall be
  // indented", and (c)(6)(iii) puts Added Sugars "under Total Sugars"; no display
  // is excepted, and 101.9's own tabular samples indent. This display set every row
  // flush with its column and marked a sub-row by weight alone. A row may fall in
  // any column, so each is measured from the start of the column it is drawn in.
  const layout = layOutUsFoodLabel({
    data: {
      ...panelOf({
        format: 'tabular',
        availableSurfaceSqInches: 80,
        continuousVerticalSpaceInches: 2,
      }),
      container: { shape: 'rectangular', widthMm: 200, heightMm: 240 },
    },
    stock: { widthMm: 200, heightMm: 240, marginMm: 6 },
  })
  const offsetOf = (id: string) => {
    const box = layout.elements.find((e) => e.elementId === nutritionRowElementId(id))!
    return nameOf(layout, id)!.xMm - box.box.xMm
  }

  it('sets a top-level row at the start of its column', () => {
    expect(offsetOf('total-fat')).toBeCloseTo(0)
    expect(offsetOf('protein')).toBeCloseTo(0)
  })

  it('indents each sub-row, and Added Sugars a level further', () => {
    for (const id of ['saturated-fat', 'trans-fat', 'dietary-fiber', 'total-sugars']) {
      expect(offsetOf(id), id).toBeGreaterThan(0)
    }
    expect(offsetOf('added-sugars')).toBeCloseTo(offsetOf('total-sugars') * 2)
  })

  it('keeps every row inside the column it was given', () => {
    const drawnRows = NUTRIENT_IDS.flatMap((id) => {
      const element = layout.elements.find((e) => e.elementId === nutritionRowElementId(id))
      return element === undefined ? [] : [{ id, element, text: nameOf(layout, id)! }]
    })
    expect(drawnRows.length).toBeGreaterThan(10)
    for (const { id, element, text } of drawnRows) {
      const endMm = text.xMm + measureTextMm(text.text, text.fontSizeMm, text.fontFamily)
      expect(endMm, id).toBeLessThanOrEqual(element.box.xMm + element.box.widthMm + 1e-6)
    }
  })
})

describe('a sub-row and its parent on the tabular display', () => {
  // An indent says "under the row above". The display split its rows into columns
  // by count alone, so on some widths Added Sugars opened a column with no Total
  // Sugars above it — indented under nothing. Found by `/code-review medium` on
  // 2026-10-10 at 250 and 400 mm; the same split could part Total Fat from
  // Saturated Fat. The regulation's tabular samples keep each group together.
  it.each([150, 200, 250, 300, 400])(
    'keeps every sub-row beneath its parent at %i mm',
    (widthMm) => {
      const layout = layOutUsFoodLabel({
        data: {
          ...panelOf({
            format: 'tabular',
            availableSurfaceSqInches: 80,
            continuousVerticalSpaceInches: 2,
          }),
          container: { shape: 'rectangular', widthMm, heightMm: 240 },
        },
        stock: { widthMm, heightMm: 240, marginMm: 6 },
      })
      const drawn = NUTRIENT_IDS.flatMap((id) => {
        const element = layout.elements.find((e) => e.elementId === nutritionRowElementId(id))
        return element === undefined ? [] : [{ id, box: element.box }]
      })
      expect(drawn.length).toBeGreaterThan(10)
      drawn.forEach(({ id, box }, index) => {
        if ((nutrient(id)?.indent ?? 0) === 0) return
        const above = drawn[index - 1]!
        // Same column, the row directly above it.
        expect(box.xMm, `${id} at ${widthMm} mm`).toBeCloseTo(above.box.xMm)
        expect(box.yMm, `${id} at ${widthMm} mm`).toBeCloseTo(above.box.yMm + above.box.heightMm)
      })
    },
  )
})

describe('the longer line', () => {
  // The vertical display measures no row against the figures beside it, and this
  // line grew by nine characters and an indent; on a dual-column panel the names
  // get a fixed share of the width. Every fixture drawing an Added Sugars row on a
  // vertical panel, single or dual, is checked for the name running into the first
  // figure. Fixtures that draw no such row are left out up front rather than
  // passed silently inside the test.
  const drawn = [
    { name: 'conformant', ...US_FOOD_CONFORMANT },
    ...US_FOOD_FIXTURES.map(({ name, data, stock }) => ({ name, data, stock })),
  ].flatMap(({ name, data, stock }) => {
    if ((data.nutritionFacts?.format ?? 'vertical') !== 'vertical') return []
    const layout = layOutUsFoodLabel({ data, stock })
    const label = nameOf(layout, 'added-sugars')
    const figures = rowTexts(layout, 'added-sugars').filter((p) => p.anchor === 'end')
    return label === undefined || figures.length === 0 ? [] : [{ name, label, figures }]
  })

  it('has panels to check, dual-column among them', () => {
    expect(drawn.length).toBeGreaterThan(10)
    expect(drawn.some(({ figures }) => figures.length === 2)).toBe(true)
  })

  it.each(drawn.map((entry) => [entry.name, entry] as const))(
    'does not run into its figures: %s',
    (_name, { label, figures }) => {
      const labelEndMm = label.xMm + measureTextMm(label.text, label.fontSizeMm, label.fontFamily)
      const firstFigureMm = Math.min(
        ...figures.map((f) => f.xMm - measureTextMm(f.text, f.fontSizeMm, f.fontFamily)),
      )
      expect(labelEndMm).toBeLessThan(firstFigureMm)
    },
  )
})
