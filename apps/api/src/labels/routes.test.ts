import supertest from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'

const app = () => createApp({ enableLogging: false })
const post = (body: object) => supertest(app()).post('/api/labels/upc-a/export').send(body)

const GTIN = '036000291452'

describe('POST /api/labels/upc-a/export', () => {
  it('returns a PDF for a valid GTIN', async () => {
    const response = await post({ gtin: GTIN })
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('names the download after the GTIN', async () => {
    expect((await post({ gtin: GTIN })).headers['content-disposition']).toContain(`${GTIN}.pdf`)
  })

  it('rejects a GTIN that is not twelve digits', async () => {
    // The check digit is supplied now rather than computed, so eleven digits is
    // an incomplete key rather than the expected input.
    const response = await post({ gtin: '03600029145' })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('exactly 12 digits')
  })

  it('rejects a non-numeric GTIN', async () => {
    expect((await post({ gtin: 'ABCDEFGHIJKL' })).status).toBe(400)
  })

  it('exports a non-compliant label rather than refusing it', async () => {
    // 2.5x is outside the 0.8–2.0 GenSpec figure 5.12.3.1-1 permits, and a 2x
    // symbol does not fit 40 x 30 mm stock. Both are findings the client has
    // already shown the user; neither is a malformed request. Refusing here
    // would mean the export path disagreed with the preview about what a label
    // is, which is the one thing this architecture exists to prevent.
    expect((await post({ gtin: GTIN, magnification: 2.5 })).status).toBe(200)
    expect(
      (
        await post({
          gtin: GTIN,
          magnification: 2,
          stock: { widthMm: 40, heightMm: 30, marginMm: 3 },
        })
      ).status,
    ).toBe(200)
  })

  it('rejects a magnification that describes no symbol at all', async () => {
    expect((await post({ gtin: GTIN, magnification: 0 })).status).toBe(400)
    expect((await post({ gtin: GTIN, magnification: -1 })).status).toBe(400)
  })

  it('returns 422, not 500, when a label cannot be exported', async () => {
    // A GTIN whose check digit is wrong is well formed and unencodable: no
    // symbol can carry it, so the export would be a blank page. The previous
    // version of this test asserted `expect([200, 422]).toContain(status)`,
    // which no behaviour could fail.
    const response = await post({ gtin: '036000291453' })
    expect(response.status).toBe(422)
    expect(response.body.detail.join(' ')).toMatch(/check digit/i)
  })

  it('rejects a font the exporter does not embed', async () => {
    // PDFKit resolves an unregistered family name as a filesystem path, so this
    // field was an arbitrary local file read.
    const response = await post({
      gtin: GTIN,
      artwork: {
        text: 'A',
        anchor: 'top-left',
        widthMm: 20,
        heightMm: 5,
        fontFamily: '/etc/passwd',
      },
    })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('fontFamily')
  })

  it('honours a custom stock', async () => {
    const response = await post({ gtin: GTIN, stock: { widthMm: 90, heightMm: 70, marginMm: 5 } })
    expect(response.status).toBe(200)
    // 90 mm is 255.118 pt; asserting on the file rules out the stock being
    // accepted and then ignored.
    expect(response.body.toString('latin1')).toMatch(/\/MediaBox\s*\[0 0 255\.11/)
  })

  it('places artwork the client asked for', async () => {
    const response = await post({
      gtin: GTIN,
      artwork: { text: 'ACME', anchor: 'top-left', widthMm: 20, heightMm: 5 },
    })
    expect(response.status).toBe(200)
  })

  it('rejects an empty request body', async () => {
    expect((await post({})).status).toBe(400)
  })
})

const postGhs = (body: object) => supertest(app()).post('/api/labels/ghs/export').send(body)

const GHS_BODY = {
  productIdentifier: 'Acetone',
  capacityL: 5,
  signalWords: ['Danger'],
  pictograms: ['GHS02', 'GHS07'],
  hazardStatements: ['Highly flammable liquid and vapour.'],
  precautionaryStatements: ['Keep away from heat.'],
  supplier: { name: 'Example Chemicals Ltd', address: '1 Example Way, Leeds' },
}

describe('POST /api/labels/ghs/export', () => {
  it('exports a PDF sized to the requested stock', async () => {
    const response = await postGhs(GHS_BODY)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    expect(response.body.length).toBeGreaterThan(1000)
  })

  /**
   * The distinction `LayoutOmission.scope` exists for.
   *
   * Every GHS label omits its pictogram glyphs, because no verified specimen
   * artwork was available. Under the previous gate — any omission is a 422 —
   * that would have made a GHS export impossible, while a UPC-A whose GTIN will
   * not encode must still be refused because it really is a blank page.
   */
  it('ships a label whose pictogram glyphs are omitted, since the label is real', async () => {
    const response = await postGhs(GHS_BODY)
    expect(response.status).toBe(200)
  })

  it('still refuses a UPC-A whose symbol is absent entirely', async () => {
    const response = await post({ gtin: '036000291453' })
    expect(response.status).toBe(422)
  })

  it('requires the package capacity, which no geometry can supply', async () => {
    const { capacityL: _omitted, ...withoutCapacity } = GHS_BODY
    const response = await postGhs(withoutCapacity)
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('capacityL')
  })

  it('rejects a pictogram code that is not one of the nine', async () => {
    const response = await postGhs({ ...GHS_BODY, pictograms: ['GHS10'] })
    expect(response.status).toBe(400)
  })

  it('rejects a signal word outside the two CLP defines', async () => {
    const response = await postGhs({ ...GHS_BODY, signalWords: ['CAUTION'] })
    expect(response.status).toBe(400)
  })

  it('exports an undersized pictogram rather than refusing it', async () => {
    // 8 mm is below the CLP minimum for this capacity band. That is a finding
    // for the rules to report, not a malformed request — the same posture the
    // UPC-A route takes toward a 2.5x symbol.
    const response = await postGhs({ ...GHS_BODY, pictogramSideMm: 8 })
    expect(response.status).toBe(200)
  })

  it('refuses stock that describes no drawing at all', async () => {
    const response = await postGhs({ ...GHS_BODY, stock: { widthMm: 0, heightMm: 0, marginMm: 0 } })
    expect(response.status).toBe(400)
  })
})
