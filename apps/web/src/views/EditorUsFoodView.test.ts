import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorView from './EditorView.vue'

/**
 * The US food label, driven through the real editor.
 *
 * Named for the scenario rather than for a component: there is no
 * `EditorUsFoodView.vue`, and there should not be. One editor renders all three
 * label types, which is what keeps the finding ↔ canvas ↔ form link from working
 * on one type and silently not on another.
 *
 * The case worth the most here is the type-size one. It is the first rule in the
 * project whose verdict depends on font metrics rather than on geometry the
 * engine placed, so "the rail shows what the rule found" is a claim the earlier
 * label types never tested.
 */

// jsdom has no layout, so scrolling is a no-op it does not implement.
Element.prototype.scrollIntoView = vi.fn()

const mountEditor = () => mount(EditorView, { global: { stubs: { RouterLink: true } } })

const mountFood = async () => {
  const store = useLabelDocumentStore()
  store.labelType = 'us-food'
  const wrapper = mountEditor()
  await nextTick()
  return { store, wrapper }
}

describe('the editor on a US food label', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the label and runs its rules', async () => {
    const { store, wrapper } = await mountFood()
    expect(wrapper.find('svg[role="img"]').exists()).toBe(true)
    expect(store.findings.length).toBeGreaterThan(0)
  })

  it('opens on a label that complies', async () => {
    // The seeded document states no type size, so the engine derives the em
    // 21 CFR 101.7(i) requires. A default label its own rules reject would be a
    // bad first impression and a worse advertisement for the engine.
    const { store } = await mountFood()
    expect(store.failures).toEqual([])
    expect(store.passes.length).toBe(5)
  })

  it('shows FDA citations, not GS1 or CLP ones', async () => {
    const { wrapper } = await mountFood()
    expect(wrapper.text()).toContain('21 CFR 101.7')
    expect(wrapper.text()).not.toContain('GS1 General Specifications')
    expect(wrapper.text()).not.toContain('1272/2008')
  })

  it('shows the form for this label type and not another', async () => {
    const { wrapper } = await mountFood()
    expect(wrapper.find('#field-food-identity').exists()).toBe(true)
    expect(wrapper.find('#field-gtin').exists()).toBe(false)
    expect(wrapper.find('#field-ghs-product').exists()).toBe(false)
  })
})

describe('the type-size rule, from the form to the rail to the canvas', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reports type set below the minimum once the size is taken by hand', async () => {
    const { store, wrapper } = await mountFood()
    expect(store.failures).toEqual([])

    await wrapper.find('#field-food-override-type').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-type-size').setValue(3)
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_NET_QUANTITY_TYPE_TOO_SMALL')
    expect(finding, 'undersized type produced no finding').toBeDefined()
    expect(finding!.citation.reference).toBe('21 CFR 101.7(i)')
    expect(wrapper.text()).toContain('21 CFR 101.7(i)')
  })

  it('outlines the declaration on the canvas when its finding is clicked', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-override-type').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-type-size').setValue(3)
    await nextTick()

    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(false)

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('The declaration measures'))
    expect(finding, 'the type-size finding was not rendered as a button').toBeDefined()

    await finding!.trigger('click')
    await nextTick()

    expect(store.selectedElementId).toBe('food-net-quantity')
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(true)
  })

  it('echoes the requirement from label-core rather than restating it', async () => {
    // The rail prints the panel area and the letter height the table demands.
    // A 120 x 170 mm panel is 31.62 in², whose band is 3/16 inch = 4.7625 mm.
    const { wrapper } = await mountFood()
    expect(wrapper.text()).toContain('31.62 in²')
    expect(wrapper.text()).toContain('4.76 mm')
  })

  it('states the requirement the same way the finding does', async () => {
    // Two renderings of one number is a defect a user can see. The rail formats
    // with `mm()` rather than `toFixed`, so the figure beside the field and the
    // figure in the rail cannot disagree about 4.7625.
    const { store, wrapper } = await mountFood()
    const pass = store.findings.find((f) => f.code === 'FDA_NET_QUANTITY_TYPE_SIZE_MET')
    const required = pass!.message.match(/meeting the ([\d.]+ mm)/)?.[1]
    expect(required).toBeDefined()
    expect(wrapper.find('#field-food-shape').exists()).toBe(true)
    expect(wrapper.text()).toContain(`101.7(i) requires ${required}`)
  })
})

describe('the package is declared separately from the label', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('changes the requirement when the container becomes a cylinder', async () => {
    const { store, wrapper } = await mountFood()

    await wrapper.find('#field-food-shape').setValue('cylindrical')
    await nextTick()

    // 21 CFR 101.1(b): 40% of height x circumference. The stock has not moved,
    // so anything that changed came from the container.
    expect(store.foodData.container.shape).toBe('cylindrical')
    expect(wrapper.find('#field-food-circumference').exists()).toBe(true)
    expect(wrapper.find('#field-food-panel-width').exists()).toBe(false)
  })

  it('drops the dimensions of the shape it is no longer', async () => {
    // A container carrying both a circumference and a panel width describes two
    // packages. Switching replaces it rather than merging into it.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-shape').setValue('cylindrical')
    await nextTick()
    await wrapper.find('#field-food-shape').setValue('other')
    await nextTick()

    expect(store.foodData.container).toEqual({
      shape: 'other',
      totalSurfaceAreaSqMm: 120 * 170 * 2,
    })
  })
})

describe('the form can express a label that is wrong', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('lets the declaration be anchored outside the bottom 30 percent', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-anchor').setValue('top-centre')
    await nextTick()

    // Enforced by a rule that reports, not by a form that prevents — the same
    // way both GHS signal words can be ticked.
    expect(store.findings.some((f) => f.code === 'FDA_NET_QUANTITY_OUTSIDE_ZONE')).toBe(true)
  })

  it('lets the SI declaration be removed, and reports the statute when it is', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-metric').setValue('')
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_NET_QUANTITY_METRIC_MISSING')
    expect(finding, 'a label with no metric declaration produced no finding').toBeDefined()
    // The Fair Packaging and Labeling Act, not 21 CFR 101, which never required it.
    expect(finding!.citation.reference).toBe('15 U.S.C. 1453(a)(2)')
  })

  it('stops asking for the SI declaration on a random-weight package', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-metric').setValue('')
    await nextTick()
    await wrapper.find('#field-food-packaging').setValue('random')
    await nextTick()

    expect(store.findings.some((f) => f.code === 'FDA_NET_QUANTITY_METRIC_MISSING')).toBe(false)
    expect(store.findings.some((f) => f.code === 'FDA_NET_QUANTITY_METRIC_NOT_REQUIRED')).toBe(true)
  })

  it('raises the requirement when the declaration is molded into the surface', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-override-type').setValue(true)
    await nextTick()
    // 8.82 mm of em puts the "o" a hair over the printed 3/16 inch.
    await wrapper.find('#field-food-type-size').setValue(8.82)
    await nextTick()
    expect(store.failures).toEqual([])

    await wrapper.find('#field-food-molded').setValue(true)
    await nextTick()

    // 101.7(i)'s closing sentence adds a sixteenth of an inch. Nothing but the
    // marking method changed.
    expect(store.findings.some((f) => f.code === 'FDA_NET_QUANTITY_TYPE_TOO_SMALL')).toBe(true)
  })
})

describe('switching label type keeps the other documents', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('does not discard the food label when the editor moves to a barcode', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-identity').setValue('Pearl barley')
    await nextTick()

    store.labelType = 'gs1-retail'
    await nextTick()
    expect(wrapper.find('#field-gtin').exists()).toBe(true)

    store.labelType = 'us-food'
    await nextTick()
    expect(store.foodData.statementOfIdentity).toBe('Pearl barley')
  })
})

describe('the form does not author label content', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('never invents the SI declaration', async () => {
    // The metric field was a checkbox that wrote `(340 g)` when ticked, so
    // `NET WT 5 LB` gained a metric half that was simply false and the
    // dual-declaration rule passed it. Converting pounds to grams is the
    // labeller's arithmetic, and a wrong conversion printed confidently is worse
    // than a missing one a rule reports.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-metric').setValue('')
    await nextTick()
    await wrapper.find('#field-food-inch-pound').setValue('NET WT 5 LB')
    await nextTick()

    expect(store.foodData.netQuantity.metric).toBeUndefined()
    expect(store.findings.some((f) => f.code === 'FDA_NET_QUANTITY_METRIC_MISSING')).toBe(true)
  })

  it('seeds the hand-set type size with an em, not a letter height', async () => {
    // Ticking the box used to write 4.76 — the 3/16 inch *letter* height — into
    // a field that holds the em, so a compliant label became a violation the
    // instant the user took control of the size. The exact conflation this stage
    // exists to remove, one layer up from where it was removed.
    const { store, wrapper } = await mountFood()
    expect(store.failures).toEqual([])

    await wrapper.find('#field-food-override-type').setValue(true)
    await nextTick()

    // 4.7625 / 0.540 = 8.819, rounded to two places for the field.
    expect(store.foodData.netQuantityFontSizeMm).toBeCloseTo(8.82, 2)
    expect(store.failures).toEqual([])
  })

  it('reports a label with no net quantity rather than passing it', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-inch-pound').setValue('')
    await nextTick()
    await wrapper.find('#field-food-metric').setValue('')
    await nextTick()

    expect(store.hasBlocking).toBe(true)
    // Nothing was drawn, so nothing was measured, so nothing passed.
    expect(store.passes).toEqual([])
    const match = store.findings.find((f) => f.code === 'FDA_NET_QUANTITY_MISSING')
    expect(match!.citation.reference).toBe('21 CFR 101.7(a)')
  })

  it('still measures a metric-only declaration, while reporting it as missing', async () => {
    // A label showing "(340 g)" and nothing else has real ink on it, and the
    // rules that measure ink are entitled to say it is correctly sized. What
    // makes the label wrong is the absent inch/pound half, and that is reported
    // as blocking — the severity a user acts on first.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-inch-pound').setValue('')
    await nextTick()

    expect(store.hasBlocking).toBe(true)
    expect(store.findings.some((f) => f.code === 'FDA_NET_QUANTITY_MISSING')).toBe(true)
    expect(store.findings.some((f) => f.code === 'FDA_NET_QUANTITY_TYPE_SIZE_MET')).toBe(true)
  })
})
