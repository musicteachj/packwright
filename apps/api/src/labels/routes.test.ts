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
  regime: 'eu-clp',
  productIdentifier: 'Acetone',
  capacityL: 5,
  signalWords: ['Danger'],
  pictograms: ['GHS02', 'GHS07'],
  hazardStatementCodes: ['H225'],
  precautionaryStatementCodes: ['P210'],
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

  it('refuses a US label\u2019s statement codes, and says which regime it judged', async () => {
    // `H225` is a real UN GHS code with EU text, so the old enum admitted it on
    // a `us-osha` label \u2014 a label this build cannot draw a single statement on.
    // The message has to be one a caller can act on: a bare \u201Cinvalid enum value\u201D
    // names a field they cannot edit their way out of.
    const response = await postGhs({ ...GHS_BODY, regime: 'us-osha' })
    expect(response.status).toBe(400)
    const body = JSON.stringify(response.body)
    expect(body).toContain('hazardStatementCodes')
    expect(body, 'the regime it was judged against').toContain('us-osha')
    expect(body).toContain('no verified')
  })

  it('exports a US label that carries no statement codes', async () => {
    // Which is every US label this build can draw. The check must close a gap,
    // not close the regime.
    const { hazardStatementCodes: _h, precautionaryStatementCodes: _p, ...body } = GHS_BODY
    const response = await postGhs({ ...body, regime: 'us-osha' })
    expect(response.status).toBe(200)
  })

  it('accepts the code spellings every other layer accepts', async () => {
    // `P337+P313` without the spaces is what a label prints and what the audit
    // endpoint already takes. The enum here refused it, so a code the server had
    // accepted once was rejected on its way to being exported.
    const response = await postGhs({ ...GHS_BODY, precautionaryStatementCodes: ['P337+P313'] })
    expect(response.status).toBe(200)
  })

  it('refuses stock that describes no drawing at all', async () => {
    const response = await postGhs({ ...GHS_BODY, stock: { widthMm: 0, heightMm: 0, marginMm: 0 } })
    expect(response.status).toBe(400)
  })
})

const postFood = (body: object) => supertest(app()).post('/api/labels/us-food/export').send(body)

const FOOD_BODY = {
  statementOfIdentity: 'Rolled oats',
  container: { shape: 'rectangular', widthMm: 120, heightMm: 170 },
  netQuantity: { inchPound: 'NET WT 12 OZ', metric: '(340 g)' },
  ingredients: [
    { name: 'whole grain rolled oats', percentByWeight: 97 },
    { name: 'sugar', percentByWeight: 2 },
    { name: 'salt', percentByWeight: 1 },
  ],
  ingredientThreshold: { percent: 2, count: 1 },
  responsibleFirm: {
    name: 'Example Foods Inc',
    isManufacturer: true,
    streetAddress: '1 Example Way',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
  },
  stock: { widthMm: 120, heightMm: 170, marginMm: 6 },
}

describe('POST /api/labels/us-food/export', () => {
  it('exports a PDF sized to the requested stock', async () => {
    const response = await postFood(FOOD_BODY)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/pdf')
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('exports a label whose blanks are findings rather than malformed input', async () => {
    // The editor's own "Add an ingredient" button writes `{ name: '',
    // percentByWeight: 0 }`, so a `min(1)` on the name turned Export into a raw
    // JSON 400 on the one screen a user meets it. Every blank below is reported
    // by a rule — 101.3(a), 101.4(a)(1), 101.5(a), 101.7(a) and 101.9(d)(3)(ii) —
    // which is what makes rejecting them the API's mistake rather than its job.
    const response = await postFood({
      ...FOOD_BODY,
      statementOfIdentity: '',
      netQuantity: { inchPound: '' },
      ingredients: [...FOOD_BODY.ingredients, { name: '', percentByWeight: 0 }],
      responsibleFirm: { ...FOOD_BODY.responsibleFirm, name: '' },
      nutritionFacts: { servingSize: '', amounts: { calories: 150 } },
    })
    expect(response.status).toBe(200)
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('still refuses a request that is malformed rather than non-compliant', async () => {
    // The distinction the relaxation turns on. A missing container is not a
    // label defect a rule could report — it is a request the engine cannot lay
    // out at all.
    const { container: _drop, ...withoutContainer } = FOOD_BODY
    expect((await postFood(withoutContainer)).status).toBe(400)
  })

  it('accepts a dual-column panel on a tabular display', async () => {
    // The two axes combine, which is the point of separating them: 101.9(e)(6)(ii)
    // illustrates exactly this label. A flat `format` enum could not carry it.
    const response = await postFood({
      ...FOOD_BODY,
      nutritionFacts: {
        servingSize: '1/2 cup (40g)',
        amounts: { calories: 150 },
        format: 'tabular',
        availableSurfaceSqInches: 80,
        continuousVerticalSpaceInches: 2,
        columns: { mode: 'dual', basis: 'as-prepared', headings: ['As packaged', 'As prepared'] },
      },
    })
    expect(response.status).toBe(200)
  })

  it('carries the second column’s figures through to the export', async () => {
    // Zod strips unknown keys rather than rejecting them, and the reconciliation
    // below it rebuilds the object key by key — so a field missing from either was
    // dropped in silence, and a document previewed with a populated second column
    // in the browser exported a blank one. That divergence is the single thing
    // this architecture exists to prevent.
    const body = {
      ...FOOD_BODY,
      nutritionFacts: {
        servingSize: '1/2 cup (40g)',
        amounts: { calories: 150, 'total-fat': 3 },
        columns: {
          mode: 'dual',
          basis: 'per-container',
          headings: ['Per serving', 'Per container'],
          secondAmounts: { 'total-fat': 7.5 },
          separated: false,
          secondColumnTypeScale: 0.7,
        },
        referenceAmount: { amount: 22, unit: 'g', category: 'Snacks' },
        packageContent: 55,
        packagedAndSoldIndividually: true,
        dualColumnExemption: { variedWeight: true },
      },
    }
    const withColumn = await postFood(body)
    expect(withColumn.status).toBe(200)

    // Proved by the artefact rather than by the status code. The same document
    // with the second column's figures removed draws fewer glyphs, so a shorter
    // PDF is evidence the figures reached the renderer — which is exactly what a
    // silently stripped field would not produce.
    const { secondAmounts: _dropped, ...columnsWithoutFigures } = body.nutritionFacts.columns
    const without = await postFood({
      ...body,
      nutritionFacts: { ...body.nutritionFacts, columns: columnsWithoutFigures },
    })
    expect(without.status).toBe(200)
    expect(withColumn.body.length).toBeGreaterThan(without.body.length)
  })

  it('refuses a column basis the regulation does not name', async () => {
    // The union comes from `DUAL_COLUMN_BASES`, so the boundary cannot drift from
    // the paragraphs behind it.
    const response = await postFood({
      ...FOOD_BODY,
      nutritionFacts: {
        servingSize: '1/2 cup (40g)',
        amounts: { calories: 150 },
        columns: { mode: 'dual', basis: 'per-fortnight' },
      },
    })
    expect(response.status).toBe(400)
  })

  it('takes an exemption by the paragraph claimed, and refuses one no paragraph names', async () => {
    // The kinds come from label-core's lists, so a claim the rules could not judge
    // never reaches them. The old bare flags are still accepted, so a label saved
    // with one exports as it did.
    const { ingredients: _list, ...withoutList } = FOOD_BODY
    const exempt = { ...withoutList, ingredientThreshold: undefined }
    expect(
      (
        await postFood({
          ...exempt,
          ingredientsExemption: { kind: 'bulk-at-retail' },
          nutritionExemption: { kind: 'small-business' },
        })
      ).status,
    ).toBe(200)
    expect(
      (await postFood({ ...exempt, ingredientsExempt: true, nutritionFactsExempt: true })).status,
    ).toBe(200)
    expect(
      (await postFood({ ...exempt, nutritionExemption: { kind: 'we-asked-nicely' } })).status,
    ).toBe(400)
    expect(
      (await postFood({ ...exempt, ingredientsExemption: { kind: 'assortment-of-sorts' } })).status,
    ).toBe(400)
  })

  it('takes a small package with its area and line, and refuses one without the area', async () => {
    const { ingredients: _list, ...withoutList } = FOOD_BODY
    const exempt = { ...withoutList, ingredientThreshold: undefined }
    const smallPackage = {
      kind: 'small-package',
      availableSurfaceSqInches: 11.5,
      contactLine: 'For nutrition information, call 1-800-555-0100',
    }
    const drawn = await postFood({ ...exempt, nutritionExemption: smallPackage })
    expect(drawn.status).toBe(200)
    // The line reached the renderer, which a status code alone would not show: the same
    // label with no line to print draws fewer glyphs.
    const blank = await postFood({
      ...exempt,
      nutritionExemption: { ...smallPackage, contactLine: '' },
    })
    expect(drawn.body.length).toBeGreaterThan(blank.body.length)

    const { availableSurfaceSqInches: _area, ...withoutArea } = smallPackage
    expect((await postFood({ ...exempt, nutritionExemption: withoutArea })).status).toBe(400)
  })

  it('takes a unit container by the wording it bears, and refuses one the paragraph does not permit', async () => {
    const { ingredients: _list, ...withoutList } = FOOD_BODY
    const exempt = { ...withoutList, ingredientThreshold: undefined }
    const drawn = await postFood({
      ...exempt,
      nutritionExemption: { kind: 'unit-container', wording: 'individual' },
    })
    expect(drawn.status).toBe(200)
    // The statement reached the renderer: the same unit claiming a paragraph that
    // prints nothing draws fewer glyphs.
    const silent = await postFood({ ...exempt, nutritionExemption: { kind: 'small-business' } })
    expect(drawn.body.length).toBeGreaterThan(silent.body.length)
    expect(
      (
        await postFood({
          ...exempt,
          nutritionExemption: { kind: 'unit-container', wording: 'wholesale' },
        })
      ).status,
    ).toBe(400)
    expect(
      (await postFood({ ...exempt, nutritionExemption: { kind: 'unit-container' } })).status,
    ).toBe(400)
  })

  it('exports an egg carton whose panel is presented beneath the lid, and refuses one presented nowhere', async () => {
    // The engine records the panel as not drawn on the outer carton. That is a detail,
    // not a missing element, so the export gate lets the carton through.
    const carton = {
      ...FOOD_BODY,
      nutritionFacts: { servingSize: '1 egg (50g)', amounts: { calories: 70 } },
    }
    expect(
      (
        await postFood({
          ...carton,
          nutritionExemption: { kind: 'egg-carton', presentedIn: 'beneath-lid' },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await postFood({
          ...carton,
          nutritionExemption: { kind: 'egg-carton', presentedIn: 'on-the-shelf' },
        })
      ).status,
    ).toBe(400)
    expect((await postFood({ ...carton, nutritionExemption: { kind: 'egg-carton' } })).status).toBe(
      400,
    )
  })

  it('takes an assortment with its statement, and prints it', async () => {
    const assortment = {
      kind: 'assortment',
      statement: 'May also contain pecans or walnuts.',
      mayBePresent: ['pecans', 'walnuts'],
    }
    const drawn = await postFood({ ...FOOD_BODY, ingredientsExemption: assortment })
    expect(drawn.status).toBe(200)
    const blank = await postFood({
      ...FOOD_BODY,
      ingredientsExemption: { ...assortment, statement: '' },
    })
    expect(drawn.body.length, 'the statement reached the renderer').toBeGreaterThan(
      blank.body.length,
    )
    const { mayBePresent: _names, ...withoutNames } = assortment
    expect((await postFood({ ...FOOD_BODY, ingredientsExemption: withoutNames })).status).toBe(400)
  })

  it('names the download after the food', async () => {
    const response = await postFood(FOOD_BODY)
    expect(response.headers['content-disposition']).toContain('Rolled-oats.pdf')
  })

  it('requires the container, which no label geometry can supply', async () => {
    // The container selects the 21 CFR 101.7(i) type-size band. Defaulting it
    // would invent the requirement every finding on the label is measured
    // against — the same reason the GHS route refuses to default a capacity.
    const { container: _omitted, ...withoutContainer } = FOOD_BODY
    const response = await postFood(withoutContainer)
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('container')
  })

  it('refuses a container that describes two shapes at once', async () => {
    // A circumference on a rectangular panel is not a container with a spare
    // field; it is two containers. The discriminated union rejects it here
    // rather than letting the engine pick one.
    const response = await postFood({
      ...FOOD_BODY,
      container: { shape: 'rectangular', widthMm: 120, circumferenceMm: 300 },
    })
    expect(response.status).toBe(400)
  })

  it('accepts a cylinder, whose panel is 40 percent of height x circumference', async () => {
    const response = await postFood({
      ...FOOD_BODY,
      container: { shape: 'cylindrical', heightMm: 200, circumferenceMm: 300 },
    })
    expect(response.status).toBe(200)
  })

  it('accepts the obvious-panel exception on an otherwise shaped container', async () => {
    // 21 CFR 101.1(c) — the top of a triangular or circular package of cheese.
    const response = await postFood({
      ...FOOD_BODY,
      container: {
        shape: 'other',
        totalSurfaceAreaSqMm: 40_000,
        obviousPanelAreaSqMm: 20_000,
      },
    })
    expect(response.status).toBe(200)
  })

  it('exports a non-compliant label rather than refusing it', async () => {
    // Type well under the 3/16 inch this panel demands, and the declaration in
    // the wrong third of it. Both are findings the client has already shown the
    // user; neither is a malformed request.
    const response = await postFood({
      ...FOOD_BODY,
      netQuantityFontSizeMm: 2,
      netQuantityAnchor: 'top-centre',
    })
    expect(response.status).toBe(200)
  })

  it('ships a label whose fraction allowance is unmodelled, since the label is real', async () => {
    // `usFoodEngine` records a detail-scope omission for 21 CFR 101.7(h)(3).
    // Detail omissions do not block, the way the GHS pictogram glyphs do not.
    const response = await postFood({
      ...FOOD_BODY,
      netQuantity: { inchPound: 'NET WT 1½ LB', metric: '(680 g)' },
    })
    expect(response.status).toBe(200)
  })

  it('refuses a container with no area, which describes no panel', async () => {
    const response = await postFood({
      ...FOOD_BODY,
      container: { shape: 'rectangular', widthMm: 120, heightMm: 0 },
    })
    expect(response.status).toBe(400)
  })

  it('rejects a packaging value it does not know', async () => {
    const response = await postFood({
      ...FOOD_BODY,
      netQuantity: { inchPound: 'NET WT 12 OZ', packaging: 'mail-order' },
    })
    expect(response.status).toBe(400)
  })

  it('keeps an absent metric declaration absent rather than undefined', async () => {
    // `exactOptionalPropertyTypes` draws a distinction Zod does not, and the
    // key-by-key reconciliation exists to preserve it. If it broke, the layout
    // would draw "NET WT 12 OZ undefined".
    const response = await postFood({
      ...FOOD_BODY,
      netQuantity: { inchPound: 'NET WT 12 OZ' },
    })
    expect(response.status).toBe(200)
  })
})

describe('the US food route on stage 2 content', () => {
  it('rejects a quantifying statement at a figure 101.4(a)(2) does not permit', async () => {
    // The permitted set is closed. A fifth figure is a compliance defect rather
    // than a drawing this engine should make, so it is refused at the boundary.
    const response = await postFood({ ...FOOD_BODY, ingredientThreshold: { percent: 3, count: 1 } })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('ingredientThreshold')
  })

  it('accepts each figure it does permit', async () => {
    for (const percent of [2, 1.5, 1, 0.5]) {
      const response = await postFood({ ...FOOD_BODY, ingredientThreshold: { percent, count: 1 } })
      expect(response.status, `${percent} percent was rejected`).toBe(200)
    }
  })

  it('exports a label whose ingredients run out of order rather than refusing it', async () => {
    // A finding, not a malformed request — the same call the route already makes
    // about an undersized net quantity.
    const response = await postFood({
      ...FOOD_BODY,
      ingredients: [
        { name: 'salt', percentByWeight: 1 },
        { name: 'whole grain rolled oats', percentByWeight: 97 },
      ],
      ingredientThreshold: { percent: 2, count: 0 },
    })
    expect(response.status).toBe(200)
  })

  it('keeps an absent qualifying phrase absent rather than undefined', async () => {
    const response = await postFood({
      ...FOOD_BODY,
      responsibleFirm: {
        name: 'Example Foods Inc',
        isManufacturer: true,
        city: 'Portland',
        state: 'OR',
      },
    })
    expect(response.status).toBe(200)
  })

  it('reports an ingredient with no name instead of rejecting it', async () => {
    // This asserted a 400 until 101.4(a)(1) had a rule behind it. Rejecting the
    // document was the schema answering a regulatory question in the one place a
    // user cannot see a citation — and it was reachable from the editor's own
    // "Add an ingredient" button, which writes exactly this entry.
    const response = await postFood({
      ...FOOD_BODY,
      ingredients: [{ name: '', percentByWeight: 50 }],
    })
    expect(response.status).toBe(200)
  })
})

describe('the US food route bounds the quantifying statement', () => {
  it('refuses a count covering more entries than the list has', async () => {
    // Unbounded, this drew a leading empty sentence and left the order rule with
    // nothing to examine, which it then reported as a pass.
    const response = await postFood({ ...FOOD_BODY, ingredientThreshold: { percent: 2, count: 9 } })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('more entries than')
  })

  it('accepts a count equal to the list length', async () => {
    const response = await postFood({
      ...FOOD_BODY,
      ingredients: [{ name: 'salt', percentByWeight: 1 }],
      ingredientThreshold: { percent: 2, count: 1 },
    })
    expect(response.status).toBe(200)
  })

  it('refuses to export a label whose content runs off the stock entirely', async () => {
    // An element-scope omission, the same gate that stops a UPC-A with no symbol.
    const response = await postFood({
      ...FOOD_BODY,
      ingredients: Array.from({ length: 400 }, (_, i) => ({
        name: `ingredient number ${i}`,
        percentByWeight: 100 - i * 0.1,
      })),
      ingredientThreshold: { percent: 2, count: 0 },
    })
    expect(response.status).toBe(422)
    expect(JSON.stringify(response.body)).toContain('none of it is printed')
  })
})

describe('the US food route on allergens', () => {
  it('rejects an allergen id the Act does not define', async () => {
    // "shellfish" is not one of the nine; §201(qq)(1) says "Crustacean
    // shellfish". An id one character off used to be the shape of defect that
    // silently declared nothing and reported a clean check.
    const response = await postFood({
      ...FOOD_BODY,
      ingredients: [{ name: 'shrimp paste', percentByWeight: 100, allergen: 'shellfish' }],
      ingredientThreshold: { percent: 2, count: 0 },
    })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('allergen')
  })

  it('accepts every id it does define', async () => {
    for (const allergen of [
      'milk',
      'egg',
      'fish',
      'crustacean-shellfish',
      'tree-nuts',
      'wheat',
      'peanuts',
      'soybeans',
      'sesame',
    ]) {
      const response = await postFood({
        ...FOOD_BODY,
        ingredients: [
          { name: 'an ingredient', percentByWeight: 100, allergen, allergenSpecificType: 'cod' },
        ],
        ingredientThreshold: { percent: 2, count: 0 },
        containsStatement: [allergen],
      })
      expect(response.status, `${allergen} was rejected`).toBe(200)
    }
  })

  it('exports a label with an undeclared allergen rather than refusing it', async () => {
    const response = await postFood({
      ...FOOD_BODY,
      ingredients: [{ name: 'whey', percentByWeight: 100, allergen: 'milk' }],
      ingredientThreshold: { percent: 2, count: 0 },
    })
    expect(response.status).toBe(200)
  })
})

describe('the US food route on the nutrition label', () => {
  const PANEL = {
    servingSize: '1/2 cup (40g)',
    servingsPerContainer: 8,
    amounts: {
      calories: 150,
      'total-fat': 3,
      'saturated-fat': 0.5,
      'trans-fat': 0,
      cholesterol: 0,
      sodium: 0,
      'total-carbohydrate': 27,
      'dietary-fiber': 4,
      'total-sugars': 1,
      'added-sugars': 0,
      protein: 5,
      'vitamin-d': 2,
      calcium: 260,
      iron: 8,
      potassium: 235,
    },
  }

  it('accepts a complete panel', async () => {
    expect((await postFood({ ...FOOD_BODY, nutritionFacts: PANEL })).status).toBe(200)
  })

  it('rejects a nutrient id 101.9(c) does not name', async () => {
    // "vitamin-b12" is in the (c)(8)(iv) table but is not one of the four
    // mandatory ones this engine carries. Accepted silently it would be dropped,
    // and the completeness rule would then report a nutrient missing for a
    // reason that is really a typo.
    const response = await postFood({
      ...FOOD_BODY,
      nutritionFacts: { ...PANEL, amounts: { ...PANEL.amounts, 'vitamin-b12': 2 } },
    })
    expect(response.status).toBe(400)
  })

  it('requires a serving size, which no geometry can supply', async () => {
    const { servingSize: _omitted, ...withoutServing } = PANEL
    const response = await postFood({ ...FOOD_BODY, nutritionFacts: withoutServing })
    expect(response.status).toBe(400)
    expect(JSON.stringify(response.body)).toContain('servingSize')
  })

  it('accepts a panel that omits a nutrient, so the rules can report it', async () => {
    // Missing potassium is a finding, not a malformed request. Zod 4 makes a
    // record over an enum key exhaustive, so this was a 400 until the schema
    // said `partialRecord` — the boundary refusing the very label the rule set
    // exists to judge.
    const { potassium: _dropped, ...amounts } = PANEL.amounts
    const response = await postFood({ ...FOOD_BODY, nutritionFacts: { ...PANEL, amounts } })
    expect(response.status).toBe(200)
  })

  it('exports a panel that rounds wrongly rather than refusing it', async () => {
    // 163 mg of sodium rounds to 160 under 101.9(c)(4). Declaring 165 is a
    // finding the client has already shown the user, not a malformed request.
    const response = await postFood({
      ...FOOD_BODY,
      nutritionFacts: {
        ...PANEL,
        amounts: { ...PANEL.amounts, sodium: 163 },
        declaredAmounts: { sodium: 165 },
      },
    })
    expect(response.status).toBe(200)
  })
})
