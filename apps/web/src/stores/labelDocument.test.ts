import { UPC_A_ELEMENTS } from '@packwright/label-core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLabelDocumentStore } from './labelDocument'

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
})
