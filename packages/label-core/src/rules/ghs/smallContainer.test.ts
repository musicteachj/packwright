import { describe, expect, it } from 'vitest'
import { layOutGhsLabel } from '../../layout/ghsEngine'
import type { GhsLabelData } from '../../templates/ghs'
import type { LabelStock } from '../../templates/stock'
import { runRules } from '../registry'
import {
  GHS_SMALL_CONTAINER_AVAILABLE,
  GHS_SMALL_CONTAINER_COMPLETE,
  GHS_SMALL_CONTAINER_INCOMPLETE,
} from './smallContainer'

const STOCK: LabelStock = { widthMm: 74, heightMm: 105, marginMm: 4 }
const FLAMMABLE = '2.6/flammable-liquids-1-2-3'

const findingsFor = (data: GhsLabelData) =>
  runRules({
    labelType: 'ghs-chemical',
    data,
    stock: STOCK,
    layout: layOutGhsLabel({ data, stock: STOCK }),
  })

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
    ['the signal word', { signalWords: [] }],
    ['the outer package statement', { outerPackageStatement: '' }],
  ])('reports a US container missing %s', (_what, patch) => {
    expect(codes({ ...COMPLETE_US, ...(patch as Partial<GhsLabelData>) })).toEqual([
      GHS_SMALL_CONTAINER_INCOMPLETE,
    ])
  })

  it('does not demand a signal word or outer-package statement under CLP', () => {
    // CLP 1.5.1.2 names pictograms, the product identifier, and the supplier's
    // name and telephone number — and nothing else.
    const clp: GhsLabelData = {
      ...COMPLETE_US,
      regime: 'eu-clp',
      capacityL: 0.1,
      signalWords: [],
      outerPackageStatement: '',
    }
    expect(codes(clp)).toEqual([GHS_SMALL_CONTAINER_COMPLETE])
  })

  it('uses each regime’s own threshold', () => {
    // 120 ml is inside CLP's 125 ml and outside OSHA's 100 ml.
    const at120 = { ...COMPLETE_US, capacityL: 0.12 }
    expect(codes({ ...at120, regime: 'eu-clp' })).toEqual([GHS_SMALL_CONTAINER_COMPLETE])
    expect(codes(at120)).toEqual(['GHS_SMALL_CONTAINER_NOT_ELIGIBLE'])
  })

  it('cites the regulator whose provision was applied', () => {
    const us = findingsFor(COMPLETE_US).find((f) => f.code.startsWith('GHS_SMALL_CONTAINER'))
    expect(us!.citation.reference).toBe('29 CFR 1910.1200(f)(12)')
    const eu = findingsFor({ ...COMPLETE_US, regime: 'eu-clp', signalWords: [] }).find((f) =>
      f.code.startsWith('GHS_SMALL_CONTAINER'),
    )
    expect(eu!.citation.reference).toBe('Regulation (EC) No 1272/2008 (CLP), Annex I, 1.5')
  })
})
