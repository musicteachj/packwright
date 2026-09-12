import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorView from './EditorView.vue'

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

const mountEditor = () => mount(EditorView, { global: { stubs: { RouterLink: true } } })

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
    // The seeded document lists pictograms explicitly, which overrides the
    // classification; clearing it lets them derive, as a real document would.
    delete store.ghsData.pictograms
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
