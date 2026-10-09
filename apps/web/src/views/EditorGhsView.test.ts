import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { knownHazardStatementCodes } from '@packwright/label-core'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorView from './EditorView.vue'
import { testRouter } from './editorTestRouter'
import { withAnnouncer } from './withAnnouncer'

/**
 * The GHS label, driven through the real editor.
 *
 * Everything below this line ran for the first time when the GHS rules were
 * added to the registry. Until then `GHS_RULES` was empty, so the store's GHS
 * branch had never returned a finding and nothing downstream of it had ever
 * executed for this label type — not the rail, not the blocking-export path, and
 * not the finding → canvas highlight, which had only ever been pointed at a
 * barcode.
 */

// jsdom has no layout, so scrolling is a no-op it does not implement.
Element.prototype.scrollIntoView = vi.fn()

const mountEditor = () =>
  mount(EditorView, { global: { plugins: [testRouter()], stubs: { RouterLink: true } } })

/** Serious eye damage puts GHS05 on the label; skin irritation puts GHS07 on it. */
const PRECEDENCE_HAZARDS = ['3.3/serious-eye-damage-1', '3.2/skin-irritation-2']

describe('the editor on a GHS label', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the chemical label and its findings', async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    const wrapper = mountEditor()
    await nextTick()

    expect(wrapper.find('svg[role="img"]').exists()).toBe(true)
    // The rail is showing GHS findings, not an empty "no checks have run" state.
    expect(store.findings.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('Compliance')
  })

  it('shows the citation on a GHS finding, not a GS1 one', async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.hazards = PRECEDENCE_HAZARDS
    // The seeded document lists pictograms explicitly, which overrides the
    // classification; clearing it lets them derive, as a real document would.
    delete store.ghsData.pictograms
    const wrapper = mountEditor()
    await nextTick()

    expect(wrapper.text()).toContain('1272/2008')
    expect(wrapper.text()).not.toContain('GS1 General Specifications')
  })

  it('clicking a pictogram finding outlines that pictogram on the canvas', async () => {
    // The signature interaction, pointed at a pictogram for the first time —
    // GHS findings carry element ids like `ghs-pictograms-GHS05`, and nothing had
    // ever exercised the link against anything but `upca-symbol`.
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.hazards = PRECEDENCE_HAZARDS
    // Stated rather than derived: the rail now reduces the set by Article 26, so
    // a label carrying the forbidden pictogram has to say so explicitly.
    store.ghsData.pictograms = ['GHS05', 'GHS07']
    const wrapper = mountEditor()
    await nextTick()

    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(false)

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('exclamation mark may not appear'))
    expect(finding, 'the precedence finding was not rendered as a button').toBeDefined()

    await finding!.trigger('click')
    await nextTick()

    expect(store.selectedElementId).toContain('ghs-pictograms-')
    const outline = wrapper.find('rect[stroke-dasharray]')
    expect(outline.exists()).toBe(true)

    // The outline is drawn over the box the engine allocated to that pictogram.
    const element = store
      .layout!.elements.concat(
        store.layout!.pictograms.map((p) => ({
          elementId: p.elementId,
          label: p.code,
          box: p.box,
        })),
      )
      .find((e) => e.elementId === store.selectedElementId)
    expect(element, 'the selected element has no resolved box').toBeDefined()
  })

  it('reports a blocking finding on a US label, where an empty frame is forbidden', async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'us-osha'
    mountEditor()
    await nextTick()

    // Every pictogram this engine draws is a frame without its symbol, which
    // OSHA C.2.3.1 forbids outright. The store must surface that as blocking.
    expect(store.hasBlocking).toBe(true)
    const blocking = store.findings.filter((f) => f.severity === 'blocking')
    expect(blocking.length).toBeGreaterThan(0)
    expect(blocking[0]!.citation.authority).toBe('OSHA')
  })

  it('still offers the export when a finding is blocking but the label drew', async () => {
    // A combination that could not occur before: blocking comes from a *rule*,
    // while the export gate reads omissions. The button stays enabled and the
    // confirmation carries the warning — refusing here would be the export path
    // and the rail disagreeing about what "blocking" means.
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'us-osha'
    const wrapper = mountEditor()
    await nextTick()

    const exportButton = wrapper
      .findAll('button')
      .find((button) => button.text().toLowerCase().includes('export'))
    expect(exportButton, 'no export button rendered').toBeDefined()
    expect(exportButton!.attributes('disabled')).toBeUndefined()
  })
})

describe('the GHS form rail', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const mountGhs = async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    const wrapper = mountEditor()
    await nextTick()
    return { store, wrapper }
  }

  it('shows the chemical form, not the barcode one', async () => {
    const { wrapper } = await mountGhs()
    expect(wrapper.find('#field-ghs-product').exists()).toBe(true)
    // The GTIN field belongs to the other label type and must not be mounted.
    expect(wrapper.find('#field-gtin').exists()).toBe(false)
  })

  it('derives pictograms from the classification rather than asking for them', async () => {
    const { store, wrapper } = await mountGhs()
    delete store.ghsData.pictograms
    delete store.ghsData.hazards
    await nextTick()

    const flammable = wrapper.find('#field-hazard-2\\.6\\/flammable-liquids-1-2-3')
    expect(flammable.exists(), 'the flammable-liquids classification was not offered').toBe(true)

    await flammable.setValue(true)
    await nextTick()

    expect(store.ghsData.hazards).toContain('2.6/flammable-liquids-1-2-3')
    // GHS02 appears because the classification requires it, not because it was picked.
    expect(store.layout!.pictograms.map((p) => p.code)).toContain('GHS02')
  })

  it('previews no environment pictogram on a US label, and draws none', async () => {
    // OSHA recognises eight symbols (1910.1200 Appendix C.2.3.2) and GHS09 is not among
    // them. The preview and the engine work the set out through one function, so the
    // rail cannot list a pictogram the label will not carry.
    const { store, wrapper } = await mountGhs()
    delete store.ghsData.pictograms
    store.ghsData.regime = 'us-osha'
    store.ghsData.hazards = [
      '2.6/flammable-liquids-1-2-3',
      '4.1/hazardous-to-the-aquatic-environment-acute-acute-1-long',
    ]
    await nextTick()

    expect(wrapper.text()).toContain('Currently GHS02.')
    expect(store.layout!.pictograms.map((p) => p.code)).toEqual(['GHS02'])
    // And says why, beside the class captioned with it — and that nothing here checks the
    // set against OSHA's own tables.
    const note = wrapper.get('[data-us-pictogram-note]').text()
    expect(note).toContain('GHS09 is left out')
    expect(note).toContain('not checked them against OSHA’s Appendix C.4')
  })

  it('says nothing of OSHA on an EU label', async () => {
    const { store, wrapper } = await mountGhs()
    store.ghsData.regime = 'eu-clp'
    await nextTick()
    expect(wrapper.find('[data-us-pictogram-note]').exists()).toBe(false)
  })

  it('stores a statement as a code, never as text', async () => {
    const { store, wrapper } = await mountGhs()
    const add = wrapper.find('#field-add-h')
    expect(add.exists()).toBe(true)

    await add.setValue('H225')
    await nextTick()

    // The code is what is stored; the exact wording is looked up. This is the
    // whole reason the field holds codes — a typed H225 could be paraphrased.
    expect(store.ghsData.hazardStatementCodes).toEqual(['H225'])
    const drawn = store.layout!.primitives.flatMap((p) =>
      p.kind === 'text' ? [(p as { text: string }).text] : [],
    )
    expect(drawn).toContain('Highly flammable liquid and vapour.')
  })

  it('offers no statements for a market whose text is not verified', async () => {
    const { store, wrapper } = await mountGhs()
    store.ghsData.regime = 'us-osha'
    await nextTick()

    // An empty dropdown would imply there are none; the rail says why instead.
    expect(wrapper.find('#field-add-h').exists()).toBe(false)
    expect(wrapper.text()).toContain('No verified statement text exists for this market')
  })

  it('lets both signal words be selected, so a wrong label can be drawn', async () => {
    const { store, wrapper } = await mountGhs()
    await wrapper.find('#field-signal-Danger').setValue(true)
    await wrapper.find('#field-signal-Warning').setValue(true)
    await nextTick()

    expect(store.ghsData.signalWords).toEqual(['Danger', 'Warning'])
    // And the rule catches it, which is the point of the form permitting it.
    expect(store.findings.some((f) => f.code === 'GHS_SIGNAL_WORD_CONFLICT')).toBe(true)
  })
})

describe('the small container path is reachable from the editor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is declared by the user, never inferred from capacity', async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'us-osha'
    store.ghsData.capacityL = 0.05
    const wrapper = mountEditor()
    await nextTick()

    // A 50 ml container that has not invoked the provision is still judged in
    // full; the rail only notes that a lighter path exists.
    expect(store.findings.some((f) => f.code === 'GHS_SMALL_CONTAINER_AVAILABLE')).toBe(true)
    expect(store.findings.some((f) => f.code === 'GHS_SMALL_CONTAINER_INCOMPLETE')).toBe(false)

    await wrapper.find('#field-small-container').setValue(true)
    await nextTick()

    expect(store.ghsData.smallContainerLabelling).toBe(true)
    // Now the reduced minimum applies, and the seeded document does not meet it.
    expect(store.findings.some((f) => f.code === 'GHS_SMALL_CONTAINER_INCOMPLETE')).toBe(true)
  })

  it('offers the outer-package statement only where OSHA requires one', async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'us-osha'
    const wrapper = mountEditor()
    await nextTick()
    expect(wrapper.find('#field-outer-statement').exists()).toBe(true)

    store.ghsData.regime = 'eu-clp'
    await nextTick()
    // CLP 1.5.1.2 names no such statement, so the field is not offered.
    expect(wrapper.find('#field-outer-statement').exists()).toBe(false)
  })
})

describe('the statement rail belongs to the label\u2019s regime', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('does not caption a code on a US label with the EU wording for it', async () => {
    // `textFor` read `EU_CLP_HAZARD_STATEMENTS` directly, so any code sitting on
    // a `us-osha` label was captioned with CLP text — the cross-regime
    // substitution `ghs/statements.ts` exists to prevent, printed in the editor
    // beside the code it misdescribes.
    //
    // **Reached the way a saved label reaches it.** It used to take three clicks — choose
    // EU, pick a statement, change Market — but a change of market now sets aside what the
    // new one cannot carry. A label saved with a code on a US regime, or handed over from an
    // audit, still arrives with one, so the label is built that way here.
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'us-osha'
    store.ghsData.hazardStatementCodes = ['H225']
    const wrapper = mountEditor()
    await nextTick()

    const chip = wrapper.findAll('li').find((li) => li.text().includes('H225'))
    expect(chip, 'the premise: the code has to be on screen at all').toBeDefined()
    expect(
      chip?.text(),
      'this build has no verified us-osha wording, so it must show none',
    ).not.toContain('Highly flammable')
    expect(chip?.text().replace(/[\s\u00d7]/g, '')).toBe('H225')
  })

  it('still captions the same code on an EU label', async () => {
    // The other half: the fix must not silence a caption that was correct.
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'eu-clp'
    store.ghsData.hazardStatementCodes = ['H225']
    const wrapper = mountEditor()
    await nextTick()

    const chip = wrapper.findAll('li').find((li) => li.text().includes('H225'))
    expect(chip?.text()).toContain('Highly flammable liquid and vapour')
  })

  it('offers a US label nothing to choose, because the table is empty', async () => {
    // Asserted through the emptiness of the table rather than through the regime
    // name, which is what the rail used to test. The two agree today and would
    // part company the day Appendix C.4 is transcribed.
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'us-osha'
    const wrapper = mountEditor()
    await nextTick()

    expect(knownHazardStatementCodes('us-osha'), 'the premise').toHaveLength(0)
    const options = wrapper.findAll('select option').filter((o) => /^H\d{3}/.test(o.text()))
    expect(options).toHaveLength(0)
  })
})

describe('a change of market', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const mountChosen = async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.regime = 'eu-clp'
    store.ghsData.hazardStatementCodes = ['H225']
    store.ghsData.precautionaryStatementCodes = ['P210']
    // Beside the root's announcer, so what is said can be read.
    const wrapper = mount(withAnnouncer(EditorView), {
      global: { plugins: [testRouter()], stubs: { RouterLink: true } },
    })
    await nextTick()
    return { store, wrapper }
  }

  it('sets aside the codes the new market cannot carry, and brings them back', async () => {
    // They stayed through the switch, and the label could then be neither saved nor
    // exported: this build holds no verified US wording. Measured 2026-10-09.
    const { store, wrapper } = await mountChosen()
    await wrapper.find('#field-ghs-regime').setValue('us-osha')
    await nextTick()
    expect(store.ghsData.hazardStatementCodes).toBeUndefined()
    expect(store.ghsData.precautionaryStatementCodes).toBeUndefined()
    // Said under each statements section, where the codes went missing from.
    expect(wrapper.get('[data-statements-set-aside="hazard"]').text()).toBe(
      'H225 is set aside: this build has no verified US — OSHA HazCom wording for it. ' +
        'Switch the market back to EU — CLP and it returns. It is held in this form only, so changing the label type or opening another label lets it go.',
    )
    expect(wrapper.get('[data-statements-set-aside="precautionary"]').text()).toBe(
      'P210 is set aside: this build has no verified US — OSHA HazCom wording for it. ' +
        'Switch the market back to EU — CLP and it returns. It is held in this form only, so changing the label type or opening another label lets it go.',
    )
    // And once through the announcer, since the switch happened away from both.
    expect(wrapper.get('[aria-live]').text()).toContain(
      'H225, P210 are set aside: this build has no verified US — OSHA HazCom wording for them.',
    )

    await wrapper.find('#field-ghs-regime').setValue('eu-clp')
    await nextTick()
    expect(store.ghsData.hazardStatementCodes).toEqual(['H225'])
    expect(store.ghsData.precautionaryStatementCodes).toEqual(['P210'])
    expect(wrapper.find('[data-statements-set-aside]').exists()).toBe(false)
  })

  it('does not carry codes set aside on one label into the next', async () => {
    const { store, wrapper } = await mountChosen()
    await wrapper.find('#field-ghs-regime').setValue('us-osha')
    await nextTick()
    store.supersede()
    await nextTick()
    expect(wrapper.find('[data-statements-set-aside]').exists()).toBe(false)
  })
})

describe('an export the server refuses', () => {
  beforeEach(() => setActivePinia(createPinia()))
  // In an `afterEach`, so a failing test does not leave its stubs for the next.
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('says what the server said, not "[object Object]"', async () => {
    // Measured 2026-10-09: "Invalid label request: [object Object]; [object Object]".
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Invalid label request',
          detail: [{ path: 'data.hazardStatementCodes', message: 'No verified text.' }, 'Plain.'],
        }),
      } as unknown as Response),
    )
    const wrapper = mountEditor()
    await nextTick()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Export'))!
      .trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(wrapper.text()).toContain(
      'Invalid label request: data.hazardStatementCodes No verified text.; Plain.',
    )
    expect(wrapper.text()).not.toContain('[object Object]')
  })

  it('says a refusal whose detail is one sentence, as the layout refusal sends it', async () => {
    // `Array.isArray` alone dropped it, so the user read the error and not the reason.
    // Found by review.
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: 'Label cannot be laid out',
          detail: 'The margin leaves no panel.',
        }),
      } as unknown as Response),
    )
    const wrapper = mountEditor()
    await nextTick()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Export'))!
      .trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(wrapper.text()).toContain('Label cannot be laid out: The margin leaves no panel.')
  })
})
