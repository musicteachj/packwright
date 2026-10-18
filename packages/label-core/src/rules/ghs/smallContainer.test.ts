import { describe, expect, it } from 'vitest'
import { layOutGhsLabel } from '../../layout/ghsEngine'
import type { ResolvedLayout } from '../../layout/types'
import { GHS_ELEMENTS } from '../../templates/ghs'
import type { GhsLabelData } from '../../templates/ghs'
import type { LabelStock } from '../../templates/stock'
import { declinedChecks, runRules } from '../registry'
import {
  GHS_SMALL_CONTAINER_AVAILABLE,
  GHS_SMALL_CONTAINER_COMPLETE,
  GHS_SMALL_CONTAINER_INCOMPLETE,
} from './smallContainer'
import { SYMBOL_NOT_DRAWN_BECAUSE } from '../../layout/ghsEngine'
import type { LayoutOmission } from '../../layout/types'

/**
 * The missing-glyph omission every pictogram carries, recognised by its
 * explanation rather than by searching its sentence. This matched `reason`
 * against "Annex V", and stopped matching on US labels the day their wording
 * stopped wrongly citing CLP — the tests failed, which is how it was found.
 */
const isMissingGlyph = (omission: LayoutOmission): boolean =>
  omission.elementId.startsWith(`${GHS_ELEMENTS.pictograms}-`) &&
  Object.values(SYMBOL_NOT_DRAWN_BECAUSE).includes(omission.explanation?.why ?? '')

const STOCK: LabelStock = { widthMm: 74, heightMm: 105, marginMm: 4 }
const FLAMMABLE = '2.6/flammable-liquids-1-2-3'

/**
 * The layout as it would be with the pictogram artwork verified.
 *
 * Every pictogram this engine draws is a frame with its symbol recorded as
 * omitted, and the rule declines to certify a container whose pictogram did not
 * print — correctly, and `certification.test.ts` pins it on the real layout.
 * These tests are about what each regime lists, so they strip that one omission
 * and nothing else. Without it every expectation of a pass below would fail for a
 * reason that has nothing to do with the list its name describes.
 */
const withGlyphsDrawn = (layout: ResolvedLayout): ResolvedLayout => ({
  ...layout,
  omissions: layout.omissions.filter((omission) => !isMissingGlyph(omission)),
})

const findingsFor = (data: GhsLabelData) =>
  runRules({
    labelType: 'ghs-chemical',
    data,
    stock: STOCK,
    layout: withGlyphsDrawn(layOutGhsLabel({ data, stock: STOCK })),
  })

const contextFor = (data: GhsLabelData) => ({
  labelType: 'ghs-chemical' as const,
  data,
  stock: STOCK,
  layout: withGlyphsDrawn(layOutGhsLabel({ data, stock: STOCK })),
})

const declinedFor = (data: GhsLabelData) =>
  declinedChecks(contextFor(data)).find((d) => d.ruleId === 'ghs/small-container')

const codes = (data: GhsLabelData) =>
  findingsFor(data)
    .filter((f) => f.code.startsWith('GHS_SMALL_CONTAINER'))
    .map((f) => f.code)

const COMPLETE_US: GhsLabelData = {
  regime: 'us-osha',
  productIdentifier: 'Example solvent',
  capacityL: 0.05,
  smallContainerLabelling: true,
  signalWords: ['Danger'],
  hazards: [FLAMMABLE],
  supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way', telephone: '+1 555 0100' },
  outerPackageStatement: 'Full label information is provided on the immediate outer package.',
}

describe('the provision applies only when it is invoked', () => {
  it('says nothing about a container too large to use it', () => {
    expect(codes({ ...COMPLETE_US, capacityL: 5, smallContainerLabelling: false })).toEqual([])
  })

  it('mentions it as guidance where it could be used but is not', () => {
    // 50 ml, not relying on the provision: the label must carry everything, and
    // this is a note that a lighter path exists rather than a defect.
    const found = codes({ ...COMPLETE_US, smallContainerLabelling: false })
    expect(found).toEqual([GHS_SMALL_CONTAINER_AVAILABLE])
    const guidance = findingsFor({ ...COMPLETE_US, smallContainerLabelling: false }).find(
      (f) => f.code === GHS_SMALL_CONTAINER_AVAILABLE,
    )
    expect(guidance!.severity).toBe('guidance')
  })

  it('does not relax anything on capacity alone', () => {
    // The whole point: a 50 ml label that never invoked the provision is judged
    // in full. Both regimes gate it on a determination this engine cannot make.
    const findings = findingsFor({ ...COMPLETE_US, smallContainerLabelling: false })
    expect(findings.some((f) => f.code === GHS_SMALL_CONTAINER_INCOMPLETE)).toBe(false)
  })
})

describe('what each regime then requires on the container', () => {
  it('accepts a complete US small container', () => {
    expect(codes(COMPLETE_US)).toEqual([GHS_SMALL_CONTAINER_COMPLETE])
  })

  it.each([
    ['the phone number', { supplier: { name: 'X', address: 'Y' } }],
    ['the outer package statement', { outerPackageStatement: '' }],
  ])('reports a US container missing %s', (_what, patch) => {
    expect(codes({ ...COMPLETE_US, ...(patch as Partial<GhsLabelData>) })).toEqual([
      GHS_SMALL_CONTAINER_INCOMPLETE,
    ])
  })

  it('holds a CLP inner label to 1.5.1.2’s list, signal word included, and no outer statement', () => {
    // 1.5.1.2 as amended by 2024/2865: "the hazard pictograms, the signal words, the
    // product identifier ... and the name and telephone number of the suppliers". The
    // signal word was left out, so the pass could clear a label without one (item 10).
    const clp: GhsLabelData = {
      ...COMPLETE_US,
      regime: 'eu-clp',
      capacityL: 0.1,
      outerPackageStatement: '',
    }
    expect(codes(clp)).toEqual([GHS_SMALL_CONTAINER_COMPLETE])
    expect(
      findingsFor(clp).find((f) => f.code === GHS_SMALL_CONTAINER_COMPLETE)!.message,
    ).toContain('the signal word')
  })

  it('certifies the signal word only where it printed', () => {
    // 1.5.1.2 lists it, so a pass must rest on it reaching the label.
    for (const regime of ['us-osha', 'eu-clp'] as const) {
      const data = { ...COMPLETE_US, regime }
      const context = contextFor(data)
      const unprinted = {
        ...context,
        layout: {
          ...context.layout,
          omissions: [
            ...context.layout.omissions,
            {
              elementId: GHS_ELEMENTS.signalWord,
              reason: 'Ran off the label.',
              scope: 'detail' as const,
            },
          ],
        },
      }
      expect(
        runRules(unprinted).some((f) => f.code === GHS_SMALL_CONTAINER_COMPLETE),
        regime,
      ).toBe(false)
    }
  })

  it('gives no pass, and says why, where the label carries no signal word', () => {
    // Both regimes list the signal word, but only where the classification calls for one,
    // and which do is not in this tool's tables. So no pass, no violation, and a limit of
    // the tool. Items 10 and 13 of the 2026-10-17 source verification.
    for (const regime of ['us-osha', 'eu-clp'] as const) {
      const data = { ...COMPLETE_US, regime, signalWords: [] }
      expect(codes(data), regime).toEqual([])
      const declined = declinedFor(data)
      expect(declined?.limit, regime).toBe(true)
      expect(declined?.reason).toContain('signal word')
    }
    expect(declinedFor(COMPLETE_US), 'and nothing to say where it carries one').toBeUndefined()
  })

  it('does not demand a pictogram of a classification that assigns none', () => {
    // Flammable gases Category 2 carries no pictogram in Annex V; "at least one hazard
    // pictogram" was demanded of every label (item 13).
    const data = {
      ...COMPLETE_US,
      hazards: ['2.2/flammable-gases-2'],
      signalWords: ['Warning' as const],
    }
    expect(layOutGhsLabel({ data, stock: STOCK }).pictograms, 'the premise').toEqual([])
    expect(codes(data)).toEqual([GHS_SMALL_CONTAINER_COMPLETE])
  })

  it('takes CLP’s tie-on tag route at any capacity, and OSHA’s only to 100 ml', () => {
    // 1.5.1.1 has no capacity limit; the 125 ml of 1.5.2.1 is a different permission.
    // Gating 1.5.1 on it reported a larger package for using the route (item 10).
    const at500 = { ...COMPLETE_US, capacityL: 0.5 }
    expect(codes({ ...at500, regime: 'eu-clp' })).toEqual([GHS_SMALL_CONTAINER_COMPLETE])
    expect(codes(at500)).toEqual(['GHS_SMALL_CONTAINER_NOT_ELIGIBLE'])
  })

  it('neither reports nor passes missing supplier details at 10 ml or less', () => {
    // 1.5.2.4.2 asks only for "the product identifier and, where appropriate, the hazard
    // pictograms", but as the floor of 1.5.2.4.1's exemption, which needs one of its
    // conditions, and 1.5.2.5 excludes plant protection products and biocides. None of that
    // is stated, so the gap is named as this tool's (item 10, and the review of its fix).
    const { supplier: _supplier, ...unsigned } = COMPLETE_US
    const bare: GhsLabelData = { ...unsigned, regime: 'eu-clp' }
    const at10 = { ...bare, capacityL: 0.01 }
    expect(codes(at10)).toEqual([])
    const declined = declinedFor(at10)
    expect(declined?.limit).toBe(true)
    expect(declined?.reason).toContain('1.5.2.4.1')
    expect(declined?.reason).toContain('1.5.2.5')
    // Over 10 ml, 1.5.1.2 asks for them outright.
    expect(codes({ ...bare, capacityL: 0.011 })).toEqual([GHS_SMALL_CONTAINER_INCOMPLETE])
    // And the product identifier is required either way.
    expect(codes({ ...at10, productIdentifier: '' })).toEqual([GHS_SMALL_CONTAINER_INCOMPLETE])
  })

  it('does not call the symbols the only gap on a described label with no signal word', () => {
    // The symbols decline said everything else was on the label, though the absent signal
    // word would still stand between it and a pass. Found by review of the fix.
    const data = { ...COMPLETE_US, signalWords: [] }
    const declined = declinedChecks({
      labelType: 'ghs-chemical',
      data,
      stock: STOCK,
      layout: layOutGhsLabel({ data, stock: STOCK }),
      subject: 'described',
    }).find((d) => d.ruleId === 'ghs/small-container')
    expect(declined?.reason).toContain('cannot see the pictograms’ symbols')
    expect(declined?.reason).toContain('no signal word')
  })

  it('names every gap it cannot settle in one decline', () => {
    // No signal word and no supplier at 10 ml: both reasons, not just the first.
    const { supplier: _supplier, ...unsigned } = COMPLETE_US
    const declined = declinedFor({
      ...unsigned,
      regime: 'eu-clp',
      capacityL: 0.01,
      signalWords: [],
    })
    expect(declined?.reason).toContain('no signal word')
    expect(declined?.reason).toContain('1.5.2.4.1')
  })

  it('cites the regulator whose provision was applied', () => {
    const us = findingsFor(COMPLETE_US).find((f) => f.code.startsWith('GHS_SMALL_CONTAINER'))
    expect(us!.citation.reference).toBe('29 CFR 1910.1200(f)(12)')
    const eu = findingsFor({ ...COMPLETE_US, regime: 'eu-clp' }).find((f) =>
      f.code.startsWith('GHS_SMALL_CONTAINER'),
    )
    expect(eu!.citation.reference).toBe('Regulation (EC) No 1272/2008 (CLP), Annex I, 1.5')
  })
})
