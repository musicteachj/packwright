import { UPC_A_ELEMENTS } from '@packwright/label-core'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorView from './EditorView.vue'
import { testRouter } from './editorTestRouter'

/**
 * The signature interaction, tested rather than asserted.
 *
 * Clicking a finding has to outline the offending element on the canvas *and*
 * ring its form field. That one link is what turns the compliance engine from a
 * wall of text into something you can see, so it is worth a test that drives the
 * real components rather than the store alone — the store holding the right
 * element id proves nothing about whether the canvas draws anything.
 */

// jsdom has no layout, so scrolling is a no-op it does not implement.
Element.prototype.scrollIntoView = vi.fn()

function mountEditor() {
  return mount(EditorView, { global: { plugins: [testRouter()], stubs: { RouterLink: true } } })
}

describe('the editor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the label, the form and the findings', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('form[aria-label="Label details"]').exists()).toBe(true)
    expect(wrapper.find('svg[role="img"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Compliance')
  })

  it('clicking a finding outlines the offending element on the canvas', async () => {
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    const wrapper = mountEditor()
    await nextTick()

    // Nothing is selected, so nothing is outlined.
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(false)

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('quiet zone measures'))
    expect(finding, 'the quiet-zone finding was not rendered').toBeDefined()

    await finding!.trigger('click')
    await nextTick()

    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)

    // The outline is drawn over the box the engine allocated, in the same
    // millimetre space as the label itself.
    const outline = wrapper.find('rect[stroke-dasharray]')
    expect(outline.exists()).toBe(true)
    const element = store.layout!.elements.find((e) => e.elementId === UPC_A_ELEMENTS.symbol)!
    expect(Number(outline.attributes('width'))).toBeCloseTo(element.box.widthMm + 1.2, 6)
  })

  it('clicking a finding rings the form section that produced it', async () => {
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    const wrapper = mountEditor()
    await nextTick()

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('quiet zone measures'))
    await finding!.trigger('click')
    await nextTick()

    const sections = wrapper.findAll('section')
    const ringed = sections.filter((s) => s.classes().includes('bg-chrome-800'))
    expect(ringed.length).toBeGreaterThan(0)
    expect(ringed.some((s) => s.text().includes('GTIN-12'))).toBe(true)
  })

  it('links the other way — focusing a field outlines its element', async () => {
    const store = useLabelDocumentStore()
    const wrapper = mountEditor()
    await nextTick()

    await wrapper.find('#field-gtin').trigger('focusin')
    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)
    await nextTick()
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(true)
  })

  it('keeps the selection when focus moves to a section that owns no element', async () => {
    // The reason this matters: the user clicks a finding on the symbol, then goes
    // to the stock fields to widen the label and fix it. If focusing those fields
    // clears the selection, the outline showing what needs to move disappears at
    // exactly the moment they are acting on it.
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    const wrapper = mountEditor()
    await nextTick()

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('quiet zone measures'))
    await finding!.trigger('click')
    await nextTick()
    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)

    // Stock and Digital Link drive no single element, so they must leave the
    // selection alone rather than clearing it.
    await wrapper.find('#field-stock-width').trigger('focusin')
    await nextTick()

    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(true)
  })

  it('states why no barcode was drawn rather than showing an unexplained gap', async () => {
    const store = useLabelDocumentStore()
    store.data.gtin = '036000291453'
    const wrapper = mountEditor()
    await nextTick()

    expect(wrapper.text()).toContain('invalid check digit')
    expect(wrapper.text()).toContain('should be 2, not 3')
  })

  it('does not claim a pass when no check has run', async () => {
    // A half-typed GTIN resolves to no layout, so no rule runs. The rail used to
    // render a green tick and "Every check passed" alongside a live region
    // correctly saying no checks had run.
    const store = useLabelDocumentStore()
    store.data.gtin = '0360002914'
    const wrapper = mountEditor()
    await nextTick()

    const rail = wrapper.find('section[aria-labelledby="findings-heading"]')
    expect(store.findings).toEqual([])
    expect(rail.text()).not.toContain('Every check passed')
    expect(rail.text()).toContain('No checks have run')
  })

  it('says in words that an overprinted symbol was not certified', async () => {
    // No rule judges overprinting — no clause for it has been verified — so the
    // rail has to state the fact, or a barcode with ink through it shows nothing
    // but passes.
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'X', anchor: 'centre', widthMm: 6, heightMm: 6 }
    const wrapper = mountEditor()
    await nextTick()

    const rail = wrapper.find('section[aria-labelledby="findings-heading"]')
    expect(rail.text()).toContain('Cannot be checked')
    expect(rail.text()).toContain('printed over')
    // An all-clear must not sit next to a notice saying something was declined.
    expect(rail.text()).not.toContain('Every check passed')
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('could not be checked')
  })

  it('does not offer an export the server would refuse', async () => {
    const store = useLabelDocumentStore()
    store.data.gtin = '036000291453'
    const wrapper = mountEditor()
    await nextTick()

    const button = wrapper.findAll('button').find((b) => b.text().includes('Export'))
    expect(button!.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Nothing to export')
  })

  it('renders the quiet-zone hatch in a colour that is actually visible', async () => {
    // `currentColor` inside a `<pattern>` inherits from `<defs>`, not from the
    // element referencing it, so the class has to sit on the pattern itself —
    // otherwise the hatch resolves to the body text colour and renders at about
    // 1.1:1 on paper.
    const wrapper = mountEditor()
    await nextTick()
    const pattern = wrapper.find('pattern')
    expect(pattern.exists()).toBe(true)
    expect(pattern.classes()).toContain('text-notice')
    // And the id is unique per instance, so two canvases cannot collide.
    expect(pattern.attributes('id')).not.toBe('quiet-zone-hatch')
  })

  it('does not make a finding with no geometry look clickable', async () => {
    // A Digital Link finding is about a URI, not an element. As a button it
    // cleared the canvas highlight instead of setting one.
    const store = useLabelDocumentStore()
    store.data.digitalLink = { domain: 'not a url' }
    const wrapper = mountEditor()
    await nextTick()

    const clickable = wrapper.findAll('button').map((b) => b.text())
    expect(clickable.some((t) => t.includes('resolver domain'))).toBe(false)
    expect(wrapper.text()).toContain('resolver domain')
  })

  it('reports a symbol drawn off the stock rather than passing it', async () => {
    const store = useLabelDocumentStore()
    store.stock.heightMm = 20
    store.stock.widthMm = 100
    const wrapper = mountEditor()
    await nextTick()

    const rail = wrapper.find('section[aria-labelledby="findings-heading"]')
    expect(rail.text()).toContain('Cannot be checked')
    expect(rail.text()).toContain('past the top')
    expect(rail.text()).not.toContain('Every check passed')
    // Once. The store stated the overrun itself before the engine recorded it, and
    // kept doing so afterwards, so the rail listed one defect twice.
    const symbol = store.uncertifiable.find((item) => item.elementId === 'upca-symbol')
    expect(symbol!.reasons.filter((reason) => reason.includes('past the'))).toHaveLength(1)
    expect(symbol!.reasons).toHaveLength(1)
  })

  it('shows the same measurement on the canvas as in the rail', async () => {
    // The caption hand-rolled `.toFixed()` and reproduced the exact float
    // asymmetry the shared formatter exists to kill.
    const wrapper = mountEditor()
    await nextTick()
    const caption = wrapper.find('figcaption').text()
    const [left, right] = caption.match(/([\d.]+) mm \/ ([\d.]+) mm/)!.slice(1)
    expect(left).toBe(right)
    // And it agrees with the rail, which formats through the same helper.
    const rail = wrapper.find('section[aria-labelledby="findings-heading"]').text()
    expect(rail).toContain(`${left} mm`)
  })

  it('announces the finding summary politely rather than per finding', async () => {
    // The rail recomputes on every keystroke; an assertive region per finding
    // would interrupt a screen-reader user continuously while they type a GTIN.
    const wrapper = mountEditor()
    const live = wrapper.find('[aria-live="polite"]')
    expect(live.exists()).toBe(true)
    expect(live.text()).toMatch(/checks passed/i)
  })
})

/**
 * A paste is a scan by another route.
 *
 * Anyone with a barcode in a spreadsheet pastes it, and what they paste is
 * whatever the symbol carried — thirteen digits as often as twelve. Left to the
 * input, `maxlength="12"` takes the first twelve characters of a 13-digit code:
 * `0036000291452` becomes `003600029145`, a different number, with nothing said.
 */
describe('pasting a barcode into the GTIN field', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const paste = async (wrapper: ReturnType<typeof mountEditor>, text: string) => {
    const field = wrapper.find('#field-gtin')
    await field.trigger('paste', {
      clipboardData: { getData: () => text },
    })
    await nextTick()
  }

  it('narrows a 13-digit paste rather than truncating it', async () => {
    const store = useLabelDocumentStore()
    const wrapper = mountEditor()

    // Moved off the default first. jsdom does not actually insert on paste, so
    // asserting the field equals the value it already held proved nothing —
    // removing the handler entirely left this green. The starting value has to be
    // something the paste must change.
    store.data.gtin = '012000161155'
    await nextTick()

    await paste(wrapper, '0036000291452')

    expect(store.data.gtin, 'maxlength would have given 003600029145').toBe('036000291452')
  })

  it('lets a fragment paste through, rather than calling it a bad scan', async () => {
    // Pasting a missing digit into a partly typed field is typing, not scanning.
    // Intercepting every paste answered it with "A GTIN is 8, 12, 13 or 14
    // digits; this scan is 1" — true, and useless.
    const store = useLabelDocumentStore()
    const wrapper = mountEditor()
    store.data.gtin = '03600029145'
    await nextTick()

    await paste(wrapper, '2')

    expect(store.lastScan, 'a fragment is not a scan to be refused').toBeNull()
  })

  it('announces the refusal rather than only showing it', async () => {
    // A refusal a screen reader never hears leaves the field unchanged and silent
    // — the state the feature exists to avoid.
    const store = useLabelDocumentStore()
    const wrapper = mountEditor()

    await paste(wrapper, '4006381333931')

    // Asserted as a relationship rather than as a literal id. The claim is that
    // the field names an announced note and the note says which scan was
    // refused; which string that id happens to be is the wiring's business, and
    // it moved when the wiring did.
    const describedBy = wrapper.find('#field-gtin').attributes('aria-describedby')
    expect(describedBy, 'the field must name the note that describes it').toBeTruthy()

    // `aria-describedby` is a space-separated list of ids, not one id. It holds
    // a single entry here only because `FormField` emits one.
    const note = wrapper.find(`#${describedBy!.split(' ')[0]}`)
    expect(note.exists(), 'and that note must be in the document').toBe(true)
    expect(note.attributes('aria-live')).toBe('polite')
    expect(note.text(), 'saying which scan was refused').toContain('4006381333931')
    expect(store.lastScan?.ok).toBe(false)
  })

  it('clears the note once the field is typed in', async () => {
    const store = useLabelDocumentStore()
    const wrapper = mountEditor()

    await paste(wrapper, '4006381333931')
    expect(store.lastScan).not.toBeNull()

    await wrapper.find('#field-gtin').setValue('03600029145')
    await nextTick()

    expect(store.lastScan, 'typing over a refusal clears it').toBeNull()
    // Was `find('#gtin-scan-note').exists()` — which passed for free the moment
    // the id changed, because an element that never exists is always absent.
    //
    // The claim is that the refusal is gone, not that the field describes
    // nothing: an incomplete GTIN still carries the "twelve digits" help in the
    // same slot, which is why this reads the note's text rather than its
    // presence.
    const describedBy = wrapper.find('#field-gtin').attributes('aria-describedby')
    const note =
      describedBy === undefined ? '' : wrapper.find(`#${describedBy.split(' ')[0]}`).text()
    expect(note, 'the refused scan is no longer named').not.toContain('4006381333931')
  })

  it('refuses a GTIN-13 and shows the reason', async () => {
    const store = useLabelDocumentStore()
    const wrapper = mountEditor()
    const before = store.data.gtin

    await paste(wrapper, '4006381333931')

    expect(store.data.gtin).toBe(before)
    expect(wrapper.text()).toMatch(/GTIN-13/)
    expect(wrapper.text(), 'the reader should see what was read').toContain('4006381333931')
  })
})

describe('a label handed over from an audit', () => {
  it('is still unsaved work after the editor has mounted', () => {
    // The store keeps it dirty; the editor's route watcher used to take that
    // back. `detach()` rebased the baseline on mount at `/labels/new` even with
    // nothing attached, so the document arrived dirty and went clean before
    // anyone saw it — leaving both leave guards silent over an audit somebody
    // had just done by hand.
    //
    // Asserted here rather than in the store's own test, which passes either
    // way because it never mounts anything. That gap is how this survived.
    const store = useLabelDocumentStore()
    store.loadUnsaved({
      labelType: 'ghs-chemical',
      stock: { widthMm: 74, heightMm: 105, marginMm: 4 },
      data: { regime: 'eu-clp', productIdentifier: 'Acetone', capacityL: 1 },
    })
    expect(store.isDirty, 'the premise: it arrives as unsaved work').toBe(true)

    mountEditor()
    expect(store.isDirty).toBe(true)
    expect(store.savedId).toBeNull()
  })
})

/**
 * The window between asking for a label and having it.
 *
 * `openFromRoute` awaits `readLabel` having set nothing but `loadError`, and the
 * store is a singleton seeded at construction — so `store.layout` is non-null
 * immediately and the editor draws the *seeded* document, offers its fields for
 * editing, and reports compliance findings about it, all under a URL naming
 * somebody else's label. When the read lands, `loadSaved` calls
 * `replaceReactive`, which deletes every key before assigning: anything typed in
 * that window is gone, with no warning and no way to get it back.
 *
 * Deferred rather than mocked away. The whole claim is about a state that only
 * exists while a promise is outstanding, so the test has to hold one open.
 */
describe('opening a saved label from the route', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  const SAVED = {
    id: 'abc123',
    name: 'Granola 340g',
    labelType: 'gs1-retail',
    stock: { widthMm: 90, heightMm: 50, marginMm: 3 },
    data: { gtin: '012000161155' },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  }

  const openDeferred = async () => {
    let land: () => void = () => {}
    const arrival = new Promise<void>((resolve) => {
      land = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await arrival
        return { ok: true, status: 200, json: async () => SAVED } as unknown as Response
      }),
    )

    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await nextTick()
    return { wrapper, land }
  }

  it('does not offer the document it happens to be holding for editing', async () => {
    const { wrapper, land } = await openDeferred()

    expect(
      wrapper.find('form[aria-label="Label details"]').exists(),
      'the rail must not present a different label as this one',
    ).toBe(false)
    expect(wrapper.find('svg[role="img"]').exists(), 'and the canvas must not draw it either').toBe(
      false,
    )

    land()
    await flushPromises()

    expect(wrapper.find('form[aria-label="Label details"]').exists()).toBe(true)
    expect(useLabelDocumentStore().savedId).toBe('abc123')
  })

  it('says it in the form pane too, which a narrow screen may be showing', async () => {
    // Below \`lg\` the panes take turns, and the switcher stays on screen through
    // the wait. Someone on Form saw an empty pane: the only visible "Opening this
    // label…" was in Preview. Found by review. jsdom cannot apply \`lg:hidden\`,
    // so this asserts the line exists in the pane; the browser decides when.
    const { wrapper, land } = await openDeferred()
    expect(wrapper.get('#pane-form').text()).toContain('Opening this label')
    land()
    await flushPromises()
    expect(wrapper.get('#pane-form').text()).not.toContain('Opening this label')
  })

  it('says what it is doing rather than showing an empty frame', async () => {
    const { wrapper, land } = await openDeferred()

    const status = wrapper.find('[role="status"]')
    expect(status.exists(), 'a wait a user can read').toBe(true)
    expect(status.text()).toContain('Opening')

    land()
    await flushPromises()

    // Not `[role="status"]` absent — that region is the findings rail's own,
    // and it never leaves; saying the wait is one of the things it says. The
    // claim is that the wait is over.
    expect(wrapper.text()).not.toContain('Opening this label')
  })

  it('waits for the label it was last asked for, not the first one to arrive', async () => {
    // Why `opening` holds an id rather than a boolean. Two route changes can
    // overlap — the saved-labels list makes that a double click — and a
    // `finally` clearing a flag would let the first read to land declare the
    // second one finished, putting the wrong label on screen under the right
    // URL with nothing outstanding to correct it.
    const landings = new Map<string, () => void>()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = url.split('/').pop()!
        await new Promise<void>((resolve) => landings.set(id, resolve))
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...SAVED, id, name: `Label ${id}` }),
        } as unknown as Response
      }),
    )

    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await nextTick()

    await router.push('/labels/def456')
    await nextTick()
    expect(landings.has('def456'), 'the second read must have been started').toBe(true)

    landings.get('abc123')!()
    await flushPromises()
    expect(wrapper.text(), 'the first arrival must not end a wait it no longer owns').toContain(
      'Opening this label',
    )

    landings.get('def456')!()
    await flushPromises()
    expect(wrapper.text()).not.toContain('Opening this label')
    expect(useLabelDocumentStore().savedId).toBe('def456')
  })

  /** A fetch that hands back a label per id, each landing only when told to. */
  const deferredByLabel = () => {
    const landings = new Map<string, () => void>()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = url.split('/').pop()!
        await new Promise<void>((resolve) => landings.set(id, resolve))
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...SAVED, id, name: `Label ${id}` }),
        } as unknown as Response
      }),
    )
    return landings
  }

  it('ignores a read that lands after the one that replaced it', async () => {
    // The other ordering, and the `finally` guard alone does not cover it: a
    // stale read still called `loadSaved`, so `/labels/def456` ended up holding
    // `abc123` with no wait on screen and no error — the defect this change
    // exists to fix, arriving by the back door. Found by review.
    const landings = deferredByLabel()
    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await nextTick()
    await router.push('/labels/def456')
    await nextTick()

    landings.get('def456')!()
    await flushPromises()
    expect(useLabelDocumentStore().savedId).toBe('def456')

    landings.get('abc123')!()
    await flushPromises()

    expect(
      useLabelDocumentStore().savedId,
      'a read nobody is waiting for may not write the document',
    ).toBe('def456')
    expect(wrapper.text()).not.toContain('Opening this label')
  })

  it('abandons the read when the route leaves for a new document', async () => {
    // `/labels/new` is the header's own "Editor" link. Without clearing the
    // wait, the editor sat on "Opening this label…" at a URL with nothing to
    // open — and when the abandoned read landed it attached the new document to
    // the old record, which is exactly the "Save PUTs over the label you
    // navigated away from" bug the watcher's own comment documents.
    const landings = deferredByLabel()
    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await nextTick()

    await router.push('/labels/new')
    await nextTick()
    expect(wrapper.text(), 'nothing is being opened any more').not.toContain('Opening this label')

    landings.get('abc123')!()
    await flushPromises()

    const store = useLabelDocumentStore()
    expect(store.savedId, 'a new document is attached to no record').toBeNull()
    expect(store.savedName).toBe('')
  })

  it('tells two reads of the same label apart', async () => {
    // `/labels/abc123` → `/labels/new` → `/labels/abc123`, with the first read
    // still outstanding. Keyed by id alone the two are indistinguishable: the
    // abandoned read passes the guard, writes, and clears the wait, and the
    // response for the URL the user is actually on is thrown away. Sharpest
    // when the abandoned one is the one that failed — the user is left reading
    // an error about a label that loaded perfectly well. Found by review.
    const answers: Array<(value: { ok: boolean; status: number; body: unknown }) => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const answer = await new Promise<{ ok: boolean; status: number; body: unknown }>(
          (resolve) => answers.push(resolve),
        )
        return {
          ok: answer.ok,
          status: answer.status,
          json: async () => answer.body,
        } as unknown as Response
      }),
    )

    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await nextTick()
    await router.push('/labels/new')
    await nextTick()
    await router.push('/labels/abc123')
    await nextTick()
    expect(answers, 'two reads of the same label are outstanding').toHaveLength(2)

    // The abandoned one, and it failed.
    answers[0]!({ ok: false, status: 404, body: { error: 'Not found' } })
    await flushPromises()
    expect(wrapper.text(), 'the read still outstanding still owns the wait').toContain(
      'Opening this label',
    )
    expect(wrapper.find('[role="alert"]').exists(), 'and nobody is told about it').toBe(false)

    answers[1]!({ ok: true, status: 200, body: SAVED })
    await flushPromises()

    expect(useLabelDocumentStore().savedId).toBe('abc123')
    expect(wrapper.text()).not.toContain('Opening this label')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('stops waiting when the route returns to the label already held', async () => {
    // The one route branch the first three fixes did not cover. Back at a label
    // the store already holds, the watcher returns early without starting a
    // read — and left the wait standing, so the editor sat on "Opening this
    // label…" forever and the outstanding read for the label that was navigated
    // away from still passed the identity guard and loaded itself under this
    // URL. A Save then wrote over it. Found by review.
    const landings = deferredByLabel()
    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await nextTick()
    landings.get('abc123')!()
    await flushPromises()
    expect(useLabelDocumentStore().savedId).toBe('abc123')

    await router.push('/labels/def456')
    await nextTick()
    expect(wrapper.text()).toContain('Opening this label')

    await router.push('/labels/abc123')
    await nextTick()
    expect(
      wrapper.text(),
      'the label is already here, so there is nothing to wait for',
    ).not.toContain('Opening this label')

    landings.get('def456')!()
    await flushPromises()
    expect(
      useLabelDocumentStore().savedId,
      'a read nobody is waiting for may not attach its label to this URL',
    ).toBe('abc123')
  })

  it('announces the wait and the arrival through the region already listening', async () => {
    // Why the panes stay mounted. A screen reader announces a *change* to a
    // live region it is already observing; one that is created with its text
    // already in it usually says nothing. On `dev` the findings rail's region
    // was mounted once and only its text moved, so opening a label announced its
    // counts. The first version of this wait swapped the whole grid out for a
    // panel of its own, which destroyed that region and rebuilt it full — so a
    // screen-reader user opening a saved label heard nothing about it. Found by
    // the phase's whole-branch review, which the per-commit ones had not seen.
    const landings = deferredByLabel()
    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await nextTick()
    landings.get('abc123')!()
    await flushPromises()

    const region = wrapper.get('[aria-live]').element
    expect(region.textContent).toContain('checks passed')

    await router.push('/labels/def456')
    await nextTick()
    expect(wrapper.get('[aria-live]').element, 'the same region, not a new one').toBe(region)
    expect(region.textContent).toContain('Opening this label')

    landings.get('def456')!()
    await flushPromises()
    expect(wrapper.get('[aria-live]').element, 'and still the same one after').toBe(region)
    expect(region.textContent).not.toContain('Opening this label')
    expect(region.textContent).toContain('checks passed')
  })

  it('keeps exactly one live region while it waits', async () => {
    // The findings rail carries the only `aria-live` region in the application
    // and `e2e/the-responsive-collapse.spec.ts` asserts exactly one is
    // perceivable at every width. A wait that adds a second would break that in
    // a state no test visits — which is the worst way for an invariant to go.
    const { wrapper, land } = await openDeferred()
    expect(wrapper.findAll('[aria-live]')).toHaveLength(1)

    land()
    await flushPromises()
  })
})
