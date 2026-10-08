import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { barcodeEncoder } from '../barcodeEncoder'
import { useLabelDocumentStore } from './labelDocument'

/**
 * A GS1 label whose encoder has not arrived is drawn, and judged by nothing.
 *
 * The encoder is loaded before these tests by the setup file, so the wait is made here
 * by taking it away and putting it back.
 */
describe('a barcode waiting for its encoder', () => {
  const loaded = barcodeEncoder.value
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    barcodeEncoder.value = loaded
  })

  it('is drawn as the placeholder, with no finding and no decline', async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'gs1-retail'
    // The premise: with the encoder here, the label is judged.
    expect(store.findings.length).toBeGreaterThan(0)

    barcodeEncoder.value = null
    await nextTick()
    expect(store.encoderPending).toBe(true)
    // Drawn — the same label, without its bars.
    expect(store.layout?.symbols).toHaveLength(1)
    expect(
      store.layout?.primitives.some((p) => p.elementId === store.layout?.symbols[0]?.elementId),
    ).toBe(false)
    // And judged by nothing: a verdict about a symbol with no bars would be a verdict
    // about something the engine has not drawn.
    expect(store.findings).toEqual([])
    expect(store.declined).toEqual([])

    barcodeEncoder.value = loaded
    await nextTick()
    expect(store.encoderPending).toBe(false)
    expect(store.findings.length).toBeGreaterThan(0)
  })

  it('is no wait at all for a label that draws no barcode', async () => {
    const store = useLabelDocumentStore()
    barcodeEncoder.value = null
    store.labelType = 'ghs-chemical'
    await nextTick()
    expect(store.encoderPending).toBe(false)
    expect(store.findings.length).toBeGreaterThan(0)
  })
})
