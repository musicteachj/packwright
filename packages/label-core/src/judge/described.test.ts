/**
 * A label printed elsewhere is not judged on what this engine made up about it.
 *
 * `check_label` and the photo audit judge a `described` label (`LabelSubject`): one
 * that already exists, which this engine reconstructs from a document. The
 * 2026-10-10 evaluation found two facts the document cannot carry being judged from
 * the reconstruction and reported about the user's label — an empty pictogram
 * frame, on every GHS label, and text "not printed" that had been set at this
 * engine's default type sizes (case 03 of
 * `docs/experiments/2026-10-10-mcp-with-and-without/`).
 *
 * The property that matters most is the first block: on every GHS fixture a
 * described label's findings are the drawing's, less the missing-symbol finding,
 * and nothing else — so standing down can never have produced a pass.
 */

import { describe, expect, it } from 'vitest'
import {
  LAID_OUT_AT_DEFAULT_TYPE_SIZES,
  LAID_OUT_IN_PACKWRIGHTS_ARRANGEMENT,
  SYMBOL_NOT_SEEN_BECAUSE,
} from '../layout/ghsEngine'
import { GHS_CONFORMANT, GHS_FIXTURES, HAZARDS } from '../rules/fixtures/ghs'
import { GHS_LABEL_BELOW_MINIMUM_SIZE } from '../rules/ghs/labelDimensions'
import { GHS_PICTOGRAM_BELOW_MINIMUM_SIZE } from '../rules/ghs/pictogramSize'
import {
  GHS_PICTOGRAM_COMPLETE,
  GHS_PICTOGRAM_NOT_RECOGNISED,
  GHS_PICTOGRAM_SYMBOL_MISSING,
} from '../rules/ghs/pictogramIntegrity'
import type { LabelSubject } from '../rules/types'
import { GHS_ELEMENTS, type GhsLabelData } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'
import { judgeLabel, type Judgement } from './judge'

function judged(data: GhsLabelData, stock: LabelStock, subject?: LabelSubject): Judgement {
  const result = judgeLabel({
    labelType: 'ghs-chemical',
    data,
    stock,
    ...(subject === undefined ? {} : { subject }),
  })
  if (result.outcome !== 'judged') throw new Error(`refused: ${result.reason}`)
  return result
}

const reasonsOf = (judgement: Judgement) =>
  judgement.uncheckable.flatMap((one) => one.reasons.map((reason) => reason.text))

describe('a described label is judged as drawn, less what the drawing made up', () => {
  it.each(
    [...GHS_FIXTURES, { name: 'conformant', ...GHS_CONFORMANT }].map(
      (f) => [f.name, f.data, f.stock] as const,
    ),
  )('%s', (_name, data, stock) => {
    const drawing = judged(data, stock)
    const described = judged(data, stock, 'described')

    // Removed, never added: a described label's findings are a subset of the
    // drawing's, so no pass can have appeared by standing a rule down.
    expect(described.findings).toEqual(
      drawing.findings.filter((one) => one.code !== GHS_PICTOGRAM_SYMBOL_MISSING),
    )
    // The omissions themselves still stand, element by element, so every pass the
    // drawing withheld is withheld here too.
    expect(described.layout.omissions).toEqual(drawing.layout.omissions)
    expect(described.uncheckable.map((one) => one.elementId)).toEqual(
      drawing.uncheckable.map((one) => one.elementId),
    )
  })
})

describe('the pictogram size, on a label printed elsewhere', () => {
  // With no side stated the engine draws each pictogram at its band's minimum and records
  // that as both drawn and required, so the check measured its own default and could not
  // fail, while the answer said an undersized pictogram "is still reported". It now waits
  // for the side. Found by `/code-review max` on 2026-10-27.
  const eu: GhsLabelData = { ...GHS_CONFORMANT.data, pictograms: ['GHS02'] }
  const sizeCheck = (judgement: Judgement) =>
    judgement.declined.find((one) => one.ruleId === 'ghs/pictogram-size')
  const undersized = (judgement: Judgement) =>
    judgement.findings.filter((one) => one.code === GHS_PICTOGRAM_BELOW_MINIMUM_SIZE)

  it('stands down and asks for the side when none is stated', () => {
    const described = judged(eu, GHS_CONFORMANT.stock, 'described')
    expect(sizeCheck(described)?.wants).toEqual(['pictogramSideMm'])
    // The smallest, because one side is drawn for every pictogram: asked for "each", a
    // label with one large and one small could send the large and clear the small.
    expect(sizeCheck(described)?.reason).toContain('State the side of the smallest pictogram')
  })

  it('reports a stated side under the band minimum', () => {
    // 5 liters is Table 1.3's "Greater than 3 litres but not exceeding 50 litres" band,
    // whose pictograms are "At least 23 × 23".
    const described = judged({ ...eu, pictogramSideMm: 15 }, GHS_CONFORMANT.stock, 'described')
    expect(undersized(described)).toHaveLength(1)
    expect(sizeCheck(described)).toBeUndefined()
  })

  it('reports nothing against a stated side that meets it, and asks for nothing', () => {
    const described = judged({ ...eu, pictogramSideMm: 23 }, GHS_CONFORMANT.stock, 'described')
    expect(undersized(described)).toEqual([])
    expect(sizeCheck(described)).toBeUndefined()
  })

  it('asks nothing of a US label, where OSHA sets no minimum size', () => {
    const us = judged({ ...eu, regime: 'us-osha' }, GHS_CONFORMANT.stock, 'described')
    expect(sizeCheck(us)).toBeUndefined()
  })

  it('still judges the drawing, and asks it for nothing', () => {
    const drawing = judged({ ...eu, pictogramSideMm: 15 }, GHS_CONFORMANT.stock)
    expect(undersized(drawing)).toHaveLength(1)
    expect(sizeCheck(judged(eu, GHS_CONFORMANT.stock))).toBeUndefined()
  })
})

describe('pictogram symbols, on a label printed elsewhere', () => {
  const us: GhsLabelData = { ...GHS_CONFORMANT.data, regime: 'us-osha', pictograms: ['GHS02'] }

  it('are reported missing on the drawing, blocking under OSHA', () => {
    const drawing = judged(us, GHS_CONFORMANT.stock)
    const missing = drawing.findings.find((one) => one.code === GHS_PICTOGRAM_SYMBOL_MISSING)
    expect(missing?.severity).toBe('blocking')
    expect(drawing.declined.map((one) => one.ruleId)).not.toContain('ghs/pictogram-integrity')
  })

  it('get no verdict either way, and say so as a limit of the tool', () => {
    const described = judged(us, GHS_CONFORMANT.stock, 'described')
    const codes = described.findings.map((one) => one.code)
    expect(codes).not.toContain(GHS_PICTOGRAM_SYMBOL_MISSING)
    expect(codes).not.toContain(GHS_PICTOGRAM_COMPLETE)

    const integrity = described.declined.find((one) => one.ruleId === 'ghs/pictogram-integrity')
    expect(integrity).toMatchObject({ wants: [], limit: true })
    expect(integrity!.reason).toContain('a limit of this tool')
    expect(integrity!.citation.reference).toBe('29 CFR 1910.1200, Appendix C, C.2.3.1')
    // OSHA sets no minimum pictogram size, so no size check runs to speak of.
    expect(integrity!.reason).not.toContain('minimum')
  })

  it('are listed as not checked, in words about the user’s label', () => {
    const described = judged(us, GHS_CONFORMANT.stock, 'described')
    const frame = described.uncheckable.find(
      (one) => one.elementId === `${GHS_ELEMENTS.pictograms}-GHS02`,
    )
    expect(frame?.reasons.map((reason) => reason.text)).toEqual([
      `The GHS02 symbol (flame) is not checked. ${SYMBOL_NOT_SEEN_BECAUSE['us-osha']}`,
    ])
  })

  it('cite CLP on an EU label', () => {
    const described = judged(GHS_CONFORMANT.data, GHS_CONFORMANT.stock, 'described')
    const integrity = described.declined.find((one) => one.ruleId === 'ghs/pictogram-integrity')
    expect(integrity!.citation.reference).toBe(
      'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.2',
    )
    expect(integrity!.reason).toContain(
      'A pictogram whose stated size is smaller than CLP’s minimum is still reported.',
    )
    expect(SYMBOL_NOT_SEEN_BECAUSE['eu-clp']).toContain(
      'A pictogram whose stated size is smaller than CLP’s minimum is still reported.',
    )
    expect(reasonsOf(described)).toContain(
      `The GHS02 symbol (flame) is not checked. ${SYMBOL_NOT_SEEN_BECAUSE['eu-clp']}`,
    )
  })

  it('still report a pictogram the regime does not recognise, and still say the rest went unseen', () => {
    // A rule that judged has not stood down, so the decline goes — and the omission on
    // the recognised frame is then what says its symbol was not checked.
    const described = judged(
      { ...us, pictograms: ['GHS02', 'GHS09'] },
      { widthMm: 148, heightMm: 210, marginMm: 4 },
      'described',
    )
    expect(described.findings.map((one) => one.code)).toContain(GHS_PICTOGRAM_NOT_RECOGNISED)
    expect(described.declined.map((one) => one.ruleId)).not.toContain('ghs/pictogram-integrity')
    expect(reasonsOf(described)).toContain(
      `The GHS02 symbol (flame) is not checked. ${SYMBOL_NOT_SEEN_BECAUSE['us-osha']}`,
    )
  })
})

describe('a small container, on a label printed elsewhere', () => {
  // Everything CLP 1.5.1.2 lists is on it, on stock large enough to print it all. The
  // only thing between it and the pass is a pictogram symbol nobody can see.
  const small: GhsLabelData = {
    ...GHS_CONFORMANT.data,
    capacityL: 0.1,
    smallContainerLabelling: true,
  }
  const roomy: LabelStock = { widthMm: 105, heightMm: 148, marginMm: 4 }
  const ruleIds = (judgement: Judgement) => judgement.declined.map((one) => one.ruleId)

  it('says the unseen symbols are why it gives no verdict, rather than vanishing', () => {
    const described = judged(small, roomy, 'described')
    expect(described.findings.map((one) => one.code)).not.toContain('GHS_SMALL_CONTAINER_COMPLETE')
    const declined = described.declined.find((one) => one.ruleId === 'ghs/small-container')
    expect(declined).toMatchObject({ wants: [], limit: true })
    expect(declined!.reason).toContain('a limit of this tool')
  })

  it('stays as it was on the drawing, where the missing symbol is reported', () => {
    expect(ruleIds(judged(small, roomy))).not.toContain('ghs/small-container')
  })

  it('does not blame the symbols for a pictogram the regime does not recognise', () => {
    // GHS09 is not one of OSHA's eight symbols, and is reported as such: seeing its
    // symbol would not make this container's label complete.
    const us: GhsLabelData = {
      ...small,
      regime: 'us-osha',
      signalWords: ['Warning'],
      pictograms: ['GHS09'],
      outerPackageStatement: 'Full label information is on the outer package.',
    }
    const { hazardStatementCodes: _h, precautionaryStatementCodes: _p, ...noCodes } = us
    const described = judged(noCodes, roomy, 'described')
    expect(described.findings.map((one) => one.code)).toContain('GHS_PICTOGRAM_NOT_RECOGNISED')
    expect(ruleIds(described)).not.toContain('ghs/small-container')
  })

  it('does not blame the symbols when something else did not print either', () => {
    // On 50 × 40 mm the supplier runs off the bottom, and the omission says so.
    const cramped = judged(small, { widthMm: 50, heightMm: 40, marginMm: 2 }, 'described')
    expect(ruleIds(cramped)).not.toContain('ghs/small-container')
  })
})

describe('text set at the default type sizes, on a label printed elsewhere', () => {
  // Case 03 of the 2026-10-10 evaluation: a 5 L CLP label on 50 × 70 mm stock, every
  // line of it printed. Laid out at this engine's default sizes, the precautionary
  // statements and the supplier run off the bottom.
  const case03: GhsLabelData = {
    regime: 'eu-clp',
    productIdentifier: 'Example solvent',
    capacityL: 5,
    signalWords: ['Danger'],
    hazards: [HAZARDS.flammableLiquid],
    hazardStatementCodes: ['H225'],
    precautionaryStatementCodes: ['P210', 'P233', 'P240', 'P403+P235'],
    supplier: {
      name: 'Example Chemicals B.V.',
      address: '1 Voorbeeldstraat, 3011 AA Rotterdam, Netherlands',
      telephone: '+31 10 000 0000',
    },
  }
  const stock: LabelStock = { widthMm: 50, heightMm: 70, marginMm: 4 }

  it('is "not printed" on the drawing, which is true of the drawing', () => {
    const drawing = judged(case03, stock)
    expect(reasonsOf(drawing).some((text) => text.includes('not printed'))).toBe(true)
  })

  it('is a fact about Packwright’s layout instead, and not about the user’s label', () => {
    const described = judged(case03, stock, 'described')
    const reasons = reasonsOf(described)
    expect(reasons.filter((text) => text.includes('not printed'))).toEqual([])

    const overrun = described.uncheckable.filter(
      (one) =>
        one.elementId === GHS_ELEMENTS.precautionaryStatements ||
        one.elementId === GHS_ELEMENTS.supplier,
    )
    expect(overrun.map((one) => one.elementId).sort()).toEqual(
      [GHS_ELEMENTS.precautionaryStatements, GHS_ELEMENTS.supplier].sort(),
    )
    // Both sit below the GHS02 pictogram this classification draws, in Packwright's
    // one row, so the arrangement is blamed — its explanation names the type sizes too.
    for (const one of overrun) {
      for (const reason of one.reasons) {
        expect(reason.text).toMatch(/^In Packwright’s arrangement, /)
        expect(reason.explanation?.why).toBe(LAID_OUT_IN_PACKWRIGHTS_ARRANGEMENT)
      }
    }
  })

  it('blames the type sizes alone where no pictogram row sits above the text', () => {
    // No classification and no pictograms: nothing but the default sizes put the
    // statements where they are.
    const { hazards: _hazards, ...unclassified } = case03
    const described = judged(
      { ...unclassified, pictograms: [] },
      { widthMm: 50, heightMm: 35, marginMm: 4 },
      'described',
    )
    const statements = described.uncheckable.find(
      (one) => one.elementId === GHS_ELEMENTS.precautionaryStatements,
    )
    expect(statements?.reasons.map((reason) => reason.explanation?.why)).toEqual([
      LAID_OUT_AT_DEFAULT_TYPE_SIZES,
    ])
    expect(statements?.reasons[0]!.text).toMatch(/^At Packwright’s default type sizes, /)
  })

  it('still withholds every pass on what did not fit, and still finds the label too small', () => {
    const described = judged(case03, stock, 'described')
    const overran = new Set<string>([GHS_ELEMENTS.precautionaryStatements, GHS_ELEMENTS.supplier])
    expect(
      described.passes.filter((one) => one.elementId !== undefined && overran.has(one.elementId)),
    ).toEqual([])
    expect(described.findings.map((one) => one.code)).toContain(GHS_LABEL_BELOW_MINIMUM_SIZE)
  })

  it('calls a pictogram row running off the label Packwright’s arrangement, not the user’s', () => {
    // This engine sets every pictogram in one row with its own gap between them; a
    // label printed elsewhere may stack four in a square. 23 mm pictograms are 32.5 mm
    // boxes, so three run off a 60 mm label here, and each one fits on it alone.
    const wide = judged(
      { ...case03, pictograms: ['GHS02', 'GHS07', 'GHS08'] },
      { widthMm: 60, heightMm: 300, marginMm: 4 },
      'described',
    )
    const strip = wide.uncheckable
      .filter((one) => one.elementId.startsWith(`${GHS_ELEMENTS.pictograms}-`))
      .flatMap((one) => one.reasons)
      .filter((reason) => reason.text.includes('right edge'))
    expect(strip.length).toBeGreaterThan(0)
    for (const reason of strip) {
      expect(reason.text).toMatch(/^In Packwright’s arrangement, the GHS0\d pictogram would /)
      expect(reason.explanation?.why).toBe(LAID_OUT_IN_PACKWRIGHTS_ARRANGEMENT)
    }
  })

  it('says a pictogram too wide for the label does not fit, even when pushed off the bottom', () => {
    // Only one edge is recorded, the bottom first. A 32.5 mm box on a 30 mm wide label
    // fits no arrangement. Blaming the row for where it landed would excuse the user's
    // label, and the drawing's "none of it is printed" would be false of it: the
    // sentence is about the size. Found by review, twice.
    const narrow = judged(
      {
        ...case03,
        productIdentifier: 'A product identifier long enough to wrap onto several lines',
        pictograms: ['GHS02'],
      },
      { widthMm: 30, heightMm: 34, marginMm: 2 },
      'described',
    )
    const frame = narrow.uncheckable
      .filter((one) => one.elementId === `${GHS_ELEMENTS.pictograms}-GHS02`)
      .flatMap((one) => one.reasons.map((reason) => reason.text))
    expect(frame).toEqual([
      expect.stringMatching(/^The GHS02 symbol \(flame\) is not checked\. /),
      'At the size Packwright draws it when none is given, the GHS02 pictogram, set at a point, ' +
        'is 32.53 mm across — wider than a 30.00 mm label, so it does not fit on the label ' +
        'however the label is arranged.',
    ])
  })

  it('says a pictogram larger than the label does not fit, rather than blame the row', () => {
    // A 46 mm pictogram set at a point is a 65 mm box, and a 50 mm wide label cannot
    // carry it in any arrangement.
    const huge = judged(
      { ...case03, pictograms: ['GHS02'], pictogramSideMm: 46 },
      { widthMm: 50, heightMm: 300, marginMm: 4 },
      'described',
    )
    const frame = huge.uncheckable
      .filter((one) => one.elementId === `${GHS_ELEMENTS.pictograms}-GHS02`)
      .flatMap((one) => one.reasons.map((reason) => reason.text))
    expect(frame).toContain(
      'The GHS02 pictogram, set at a point, is 65.05 mm across — wider than a 50.00 mm label, ' +
        'so it does not fit on the label however the label is arranged.',
    )
    expect(frame.filter((text) => text.includes('is not printed'))).toEqual([])
  })
})
