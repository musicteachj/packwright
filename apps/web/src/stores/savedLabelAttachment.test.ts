/**
 * Which saved label the editor is attached to, and whether it has been changed.
 *
 * The attachment is what lets the editor replace a record rather than duplicate
 * it, and what lets an export use the stock a label was saved at rather than a
 * default. The dirty flag is what stops an hour of editing leaving with a click
 * on the masthead.
 */
import { DEFAULT_UPC_A_STOCK, DEFAULT_GHS_STOCK } from '@packwright/label-core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLabelDocumentStore } from './labelDocument'

const A_SAVED_LABEL = {
  id: 'abc123',
  name: 'Granola 340g',
  labelType: 'gs1-retail' as const,
  stock: { widthMm: 90, heightMm: 50, marginMm: 3 },
  data: { gtin: '012000161155' },
}

describe('attaching to a saved label', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts unattached, and an unsaved document is not dirty', () => {
    // Nothing has been written, so there is nothing to have diverged from.
    const store = useLabelDocumentStore()
    expect(store.savedId).toBeNull()
    expect(store.isDirty).toBe(false)
  })

  it('opens a saved label without reporting it as edited', () => {
    // The document arrives through JSON and is rebuilt field by field, so a
    // naive compare would call it modified the moment it opened.
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)
    expect(store.savedId).toBe('abc123')
    expect(store.isDirty).toBe(false)
  })

  it('restores the stock it was saved at, not the default', () => {
    // The defect `docs/BACKLOG.md` says becomes reachable in this stage: an
    // export request defaults a missing stock, so a label opened without its own
    // prints at whatever the default is — first visible on a printed sheet.
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)
    expect(store.stock).toEqual({ widthMm: 90, heightMm: 50, marginMm: 3 })
    expect(store.stock).not.toEqual(DEFAULT_UPC_A_STOCK)
  })

  it('reports an edited field as dirty, and a save as clean again', () => {
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)
    store.data.gtin = '036000291452'
    expect(store.isDirty).toBe(true)

    store.markSaved('abc123', 'Granola 340g')
    expect(store.isDirty).toBe(false)
  })

  it('reports a changed stock as dirty', () => {
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)
    store.stock.widthMm = 120
    expect(store.isDirty).toBe(true)
  })

  it('reports a renamed label as dirty', () => {
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)
    store.savedName = 'Something else'
    expect(store.isDirty).toBe(true)
  })

  it('defends a document that has never been saved', () => {
    // The case both guards most exist for, and the one they were inert in: an
    // hour of work on something never written is the work most easily lost.
    const store = useLabelDocumentStore()
    expect(store.isDirty, 'an untouched editor is clean').toBe(false)

    store.data.gtin = '012000161155'
    expect(store.isDirty, 'and the first edit is not').toBe(true)
  })

  it('keeps defending the document after a type switch detaches it', () => {
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)
    store.labelType = 'ghs-chemical'
    expect(store.isDirty).toBe(false)

    store.ghsData.productIdentifier = 'Something else'
    expect(store.isDirty, 'detached is not the same as unprotected').toBe(true)
  })

  it('never rebases a detached document, however untouched it looks', () => {
    // **The guard against a false clearance on the audit hand-off**, and it is
    // here because removing it produced one. `loadUnsaved` leaves the baseline
    // describing a *different* type on purpose — that mismatch is what keeps an
    // audited label dirty. A rebase that asks only “did the type being left have
    // anything to lose” reads the mismatch as “no” the moment the user switches
    // away and back, and writes the confirmed audit data into the baseline.
    //
    // It was written while widening that rebase to detached documents, to close
    // a false *positive* — see `docs/BACKLOG.md`. Trading a nuisance prompt for a
    // silent loss is the wrong way round, and this is what says so.
    const store = useLabelDocumentStore()
    store.loadUnsaved({
      labelType: 'ghs-chemical',
      stock: DEFAULT_GHS_STOCK,
      data: { regime: 'eu-clp', productIdentifier: 'Acetone', signalWords: ['Danger'] },
    })
    expect(store.isDirty, 'the premise: a hand-off arrives as unsaved work').toBe(true)

    store.labelType = 'gs1-retail'
    store.labelType = 'ghs-chemical'

    expect(
      store.isDirty,
      'a label nobody saved is still unsaved after a round trip through the type dropdown',
    ).toBe(true)
  })

  it('does not launder an unsaved edit into the baseline when the type switches', () => {
    // Found in a browser, which is the only place it was visible: the editor
    // showed “Unsaved changes”, the type dropdown was changed, and the header
    // went quiet — leaving the page raised no prompt at all and closing the tab
    // would have lost the edit without a word.
    //
    // `detach()` used to rebase the baseline to the document in front of it,
    // which is what absorbed the edit. The test above pins the other half: a
    // label nobody typed into must *not* become dirty just because somebody
    // looked at another type. Both have to hold, and only one of them did.
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)

    store.data.gtin = '036000291452'
    expect(store.isDirty, 'the premise: the edit has to register').toBe(true)

    store.labelType = 'ghs-chemical'
    expect(
      store.isDirty,
      'an edit nobody saved is still unsaved after the type switches away from it',
    ).toBe(true)
  })

  it('lets go of the saved label when the type changes', () => {
    // A saved label is one type; its data is a discriminated union keyed on it.
    // The API would accept the conversion without complaint, which is why the
    // client must not offer it — a stored record would change kind because
    // somebody clicked a tab, under a name describing what it used to be.
    const store = useLabelDocumentStore()
    store.loadSaved(A_SAVED_LABEL)
    store.labelType = 'ghs-chemical'

    expect(store.savedId, 'Save must have become Save As').toBeNull()
    expect(store.isDirty).toBe(false)
  })

  it('does not let go when a load sets the type itself', () => {
    // `loadSaved` sets `labelType` on its way in. If that counted as a switch,
    // opening any non-retail label would detach it immediately.
    const store = useLabelDocumentStore()
    store.loadSaved({
      ...A_SAVED_LABEL,
      labelType: 'ghs-chemical',
      stock: DEFAULT_GHS_STOCK,
      data: { regime: 'eu-clp', productIdentifier: 'Acetone', signalWords: ['Danger'] },
    })
    expect(store.savedId).toBe('abc123')
    expect(store.labelType).toBe('ghs-chemical')
  })
})
