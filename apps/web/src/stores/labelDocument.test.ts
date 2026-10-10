import { UPC_A_ELEMENTS, judgeLabel } from '@packwright/label-core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLabelDocumentStore } from './labelDocument'
import { barcodeEncoder } from '../barcodeEncoder'

describe('the label document store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens on a label that resolves and passes every check', () => {
    const store = useLabelDocumentStore()
    expect(store.layout).not.toBeNull()
    expect(store.failures).toEqual([])
    expect(store.passes.length).toBeGreaterThan(0)
  })

  it('recomputes findings when the document changes', () => {
    // Findings are computed, never stored. A stored finding is a finding from
    // whichever rule set was current when it was written.
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    expect(store.failures.map((f) => f.code)).toContain('GS1_QUIET_ZONE_TOO_NARROW')

    delete store.data.artwork
    expect(store.failures).toEqual([])
  })

  it('surfaces an unresolvable layout as a form state, not a finding', () => {
    // A half-typed GTIN is not twelve digits yet. Inventing a compliance verdict
    // for that would fire on every keystroke.
    const store = useLabelDocumentStore()
    store.data.gtin = '0360002914'
    expect(store.layout).toBeNull()
    expect(store.layoutError).toMatch(/twelve digits/i)
    expect(store.findings).toEqual([])
  })

  it('reports a blocking finding for a GTIN that cannot be encoded', () => {
    const store = useLabelDocumentStore()
    store.data.gtin = '036000291453'
    expect(store.hasBlocking).toBe(true)
    expect(store.layout!.omissions[0]!.elementId).toBe(UPC_A_ELEMENTS.symbol)
    // No symbol was drawn, so nothing claims its quiet zone is clear.
    expect(store.findings.some((f) => f.code.startsWith('GS1_QUIET_ZONE'))).toBe(false)
  })

  it('groups findings most-severe-first with passes last', () => {
    // Artwork in the quiet zone rather than a bad check digit: an unencodable
    // GTIN produces a blocking finding and nothing else, because every geometry
    // rule correctly declines to run on a symbol that was never drawn.
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    const order = store.findingsBySeverity.map(([severity]) => severity)
    expect(order[0]).toBe('violation')
    expect(order.at(-1)).toBe('pass')
  })

  it('produces a blocking finding alone when nothing could be drawn', () => {
    // Worth pinning: the rail showing one finding and no passes is correct, not
    // a rail that failed to render. Nothing was measured, so nothing cleared.
    const store = useLabelDocumentStore()
    store.data.gtin = '036000291453'
    expect(store.findings).toHaveLength(1)
    expect(store.passes).toEqual([])
  })

  it('carries the selection that links a finding to the canvas and the form', () => {
    const store = useLabelDocumentStore()
    expect(store.selectedElementId).toBeNull()
    store.select(UPC_A_ELEMENTS.symbol)
    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)
    store.select(null)
    expect(store.selectedElementId).toBeNull()
  })
  it('opens the chemical editor on a supplier established in the Union, with a telephone number', () => {
    // CLP Article 4(11), applying from 1 July 2026, and Article 17(1)(a). The seed
    // named a Leeds supplier with no number, and no rule reads either.
    const store = useLabelDocumentStore()
    expect(store.ghsData.regime).toBe('eu-clp')
    expect(store.ghsData.supplier?.address).toMatch(/, Netherlands$/)
    expect(store.ghsData.supplier?.telephone?.trim()).toBeTruthy()
  })

  it.each(['gs1-retail', 'ghs-chemical', 'us-food'] as const)(
    'reports on a %s label exactly what the shared judge reports',
    (labelType) => {
      // The editor lays out and judges through `layOutLabel` and `judgeLayout`; the
      // server will call `judgeLabel`. This is the check that the two paths agree on
      // the editor's own documents — the comparison `/code-review high` on #79 found
      // missing, since the judge's own test compared it with a copy of its dispatch.
      const store = useLabelDocumentStore()
      store.labelType = labelType
      const request =
        labelType === 'gs1-retail'
          ? { labelType, data: store.data, stock: store.stock, barcode: barcodeEncoder.value! }
          : labelType === 'ghs-chemical'
            ? { labelType, data: store.ghsData, stock: store.ghsStock }
            : { labelType, data: store.foodData, stock: store.foodStock }
      const judged = judgeLabel(request)
      if (judged.outcome === 'refused') throw new Error(judged.reason)
      expect(store.encoderPending).toBe(false)
      expect(store.layout).toEqual(judged.layout)
      expect(store.findings).toEqual(judged.findings)
      expect(store.findingsBySeverity).toEqual(judged.groups)
      expect(store.failures).toEqual(judged.failures)
      expect(store.passes).toEqual(judged.passes)
      expect(store.hasBlocking).toBe(judged.blocking)
      expect(store.declined).toEqual(judged.declined)
      expect(store.uncertifiable).toEqual(judged.uncheckable)
      // Not vacuous: each seed draws a label with findings on it.
      expect(judged.findings.length).toBeGreaterThan(0)
    },
  )

  it('shows a symbol the encoder could not produce as a form state, as the judge refuses it', () => {
    // `SymbolLayoutError` is its own class; the judge refuses it, and the editor used to
    // let it throw out of a computed. An encoder that draws no bars raises one.
    const real = barcodeEncoder.value
    barcodeEncoder.value = { render: (_options, drawing) => drawing.end() }
    try {
      const store = useLabelDocumentStore()
      store.labelType = 'gs1-retail'
      expect(store.layout).toBeNull()
      expect(store.layoutError).toMatch(/produced no bars/)
      expect(store.findings).toEqual([])
    } finally {
      barcodeEncoder.value = real
    }
  })
})

/**
 * A scan arrives whole, in whatever form the symbol carried.
 *
 * `applyScan` is an action rather than a `v-model` because that is the
 * difference: typing produces twelve digits a character at a time, and a scan
 * produces thirteen at once, or eight, or a URL. Every decision about what may
 * become a GTIN-12 belongs to `normaliseScannedGtin`; the store's job is to keep
 * the refusal visible.
 */
describe('taking a scan', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('takes a GTIN-12 and draws it', () => {
    const store = useLabelDocumentStore()
    // Verified against `isValidCheckDigit` rather than invented — the first
    // number written here had a wrong check digit, and the normaliser said so,
    // which is the whole point of it.
    const result = store.applyScan('  012000161155 ')

    expect(result.ok).toBe(true)
    expect(store.data.gtin).toBe('012000161155')
    expect(store.layout, 'the label redraws from the scan').not.toBeNull()
  })

  it('narrows a 13-digit read that begins with a zero', () => {
    const store = useLabelDocumentStore()
    store.applyScan('0036000291452')

    expect(store.data.gtin).toBe('036000291452')
    expect(store.lastScan?.ok && store.lastScan.note).toMatch(/leading zero/i)
  })

  it('leaves the field alone when the read cannot be a GTIN-12, and says why', () => {
    // The refusal has to be visible. A read that changes nothing and reports
    // nothing is indistinguishable from the camera never having fired.
    const store = useLabelDocumentStore()
    const before = store.data.gtin

    const result = store.applyScan('4006381333931')

    expect(result.ok).toBe(false)
    expect(store.data.gtin, 'a refused scan must not touch the document').toBe(before)
    expect(store.lastScan?.ok).toBe(false)
    expect(!store.lastScan!.ok && store.lastScan!.reason).toMatch(/GTIN-13/)
    expect(!store.lastScan!.ok && store.lastScan!.scanned).toBe('4006381333931')
  })

  it('never repairs a check digit', () => {
    const store = useLabelDocumentStore()
    const before = store.data.gtin

    store.applyScan('036000291453')

    expect(store.data.gtin).toBe(before)
    expect(!store.lastScan!.ok && store.lastScan!.reason).toMatch(/check digit/i)
  })

  it('forgets the note once the field is edited by hand', () => {
    const store = useLabelDocumentStore()
    store.applyScan('4006381333931')
    expect(store.lastScan).not.toBeNull()

    store.clearScan()
    expect(store.lastScan).toBeNull()
  })
})

describe('a document handed over from an audit', () => {
  it('arrives unsaved, and as work worth defending', () => {
    const store = useLabelDocumentStore()
    store.loadUnsaved({
      labelType: 'ghs-chemical',
      stock: { widthMm: 74, heightMm: 105, marginMm: 4 },
      data: { regime: 'eu-clp', productIdentifier: 'Acetone', capacityL: 1 },
    })

    expect(store.labelType).toBe('ghs-chemical')
    expect(store.ghsData.productIdentifier).toBe('Acetone')
    // Never stored, so the editor's Save must not become a PUT over a record.
    expect(store.savedId).toBeNull()
    // And dirty, or both leave guards go quiet on an hour of somebody's work.
    // The first version cleared the baseline, which reads as "nothing to
    // defend" — the opposite of what its own comment claimed.
    expect(store.isDirty).toBe(true)
  })
})
