/**
 * The export routes refuse a symbol the encoder could not produce the way they
 * refuse a layout that cannot be drawn.
 *
 * In a file of its own because `vi.mock` replaces bwip-js for every test in the
 * file, and the rest of the route tests need the real one. The stand-in draws
 * nothing, which is the one way to reach `SymbolLayoutError` with a document the
 * schema accepts: with bwip-js itself the engine checks the payload first and
 * raises `LayoutError`, so no route is known to reach it today. It is checked
 * anyway because the judge and the editor already refuse it as a layout error
 * (#79), and an export answering the same label with a 500 would be the one door
 * that disagreed.
 *
 * Only the UPC-A route draws a symbol. The GHS and food routes share the same
 * test of what counts as a refusal, so they cannot drift from it.
 */
import supertest from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'

vi.mock('bwip-js/generic', () => ({ render: () => {} }))

describe('POST /api/labels/upc-a/export, with an encoder that draws nothing', () => {
  it('answers 422 with the layout refusal, not a 500', async () => {
    const response = await supertest(createApp({ enableLogging: false }))
      .post('/api/labels/upc-a/export')
      .send({ gtin: '036000291452' })

    expect(response.status).toBe(422)
    expect(response.body.error).toBe('Label cannot be laid out')
    expect(response.body.detail).toMatch(/produced no bars/)
  })
})
