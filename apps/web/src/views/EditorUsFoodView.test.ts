import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { US_FOOD_RULES } from '@packwright/label-core'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorView from './EditorView.vue'
import { testRouter } from './editorTestRouter'

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

const mountEditor = () =>
  mount(EditorView, { global: { plugins: [testRouter()], stubs: { RouterLink: true } } })

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

    // Not every rule *passes*, and that is the design rather than a gap. The
    // seeded panel states its analysis and lets the printed figures derive, so
    // the order, rounding and percent-Daily-Value rules have nothing
    // independent to measure — checking a derived value would be checking the
    // engine against itself, and a rule that cannot fail must not pass either.
    const declining = [
      'nutrition-order',
      'nutrition-rounding',
      'nutrition-percent-dv',
      // Every package may use the standard vertical display, so there is no
      // entitlement to judge and the format rule says nothing.
      'nutrition-format',
      // (b)(12)(i) turns on a reference amount from §101.12(b), which the seeded
      // document does not state — and a rule that reports a label for *not*
      // carrying a second column must not fire on a figure nobody supplied.
      'dual-column-required',
      // And its form rule, which has nothing to judge on a single-column panel.
      'dual-column-form',
      // (c)(7)(i) permits an adult food to omit its protein percentage, so there is
      // nothing to require of the seeded label and nothing to clear.
      'protein-percent',
    ]
    expect(store.passes.length).toBe(US_FOOD_RULES.length - declining.length)
    for (const code of ['FDA_NUTRITION_ORDER_MET', 'FDA_NUTRITION_ROUNDING_MET']) {
      expect(store.findings.map((f) => f.code)).not.toContain(code)
    }
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
    // A 120 x 240 mm panel is 44.64 in², still in the "more than 25 but not
    // more than 100" band, so the requirement is the same 3/16 inch = 4.7625 mm.
    const { wrapper } = await mountFood()
    expect(wrapper.text()).toContain('44.64 in²')
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
      totalSurfaceAreaSqMm: 120 * 240 * 2,
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
    // Nothing was drawn, so no net quantity check measured anything. Scoped to
    // those, because the ingredient and firm rules on this label ran and
    // legitimately passed — and that distinction is the point.
    expect(store.passes.filter((f) => f.code.startsWith('FDA_NET_QUANTITY'))).toEqual([])
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

describe('the ingredient statement, from the form to the rail', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reports a list moved out of descending order', async () => {
    const { store, wrapper } = await mountFood()
    expect(store.failures).toEqual([])

    // Almonds are 7% of the food and the oats 90%. Putting almonds first is the
    // defect 101.4(a)(1) exists to catch, and the form has to be able to make
    // it. Moving *sugar* up would not: sugar is inside the grouped tail, which
    // 101.4(a)(2) releases from the ordering requirement altogether, so the
    // label would still be compliant — which it is, and the rules say so.
    await wrapper.find('[aria-label="Move almonds up"]').trigger('click')
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_INGREDIENTS_OUT_OF_ORDER')
    expect(finding, 'reordering produced no finding').toBeDefined()
    expect(finding!.citation.reference).toBe('21 CFR 101.4(a)(1)')
  })

  it('offers only the four thresholds 101.4(a)(2) permits', async () => {
    const { wrapper } = await mountFood()
    const options = wrapper.find('#field-food-threshold').findAll('option')
    expect(options.map((o) => o.attributes('value'))).toEqual(['2', '1.5', '1', '0.5'])
  })

  it('reports a missing statement rather than passing an empty one', async () => {
    const { store, wrapper } = await mountFood()
    for (let i = store.foodData.ingredients!.length; i > 0; i -= 1) {
      await wrapper.find(`[aria-label^="Remove "]`).trigger('click')
      await nextTick()
    }
    expect(store.findings.some((f) => f.code === 'FDA_INGREDIENTS_MISSING')).toBe(true)
    expect(store.hasBlocking).toBe(true)
  })

  it('stops asking once an exemption is claimed and nothing is listed', async () => {
    // §101.100's exemptions turn on facts about the product, so the label
    // declares one and no rule infers it — the GHS small-container call again.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-ing-exemption').setValue('bulk-at-retail')
    await nextTick()
    for (let i = store.foodData.ingredients!.length; i > 0; i -= 1) {
      await wrapper.find('[aria-label^="Remove "]').trigger('click')
      await nextTick()
    }
    expect(store.findings.some((f) => f.code === 'FDA_INGREDIENTS_EXEMPT')).toBe(true)
    expect(store.findings.some((f) => f.code === 'FDA_INGREDIENTS_MISSING')).toBe(false)
  })

  it('takes an assortment with its statement, and prints it after the list', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-ing-exemption').setValue('assortment')
    await nextTick()
    expect(
      store.findings.some((f) => f.code === 'FDA_ASSORTMENT_STATEMENT_MISSING'),
      'claimed with no statement yet',
    ).toBe(true)

    const statement = 'May also contain pecans or walnuts.'
    await wrapper.find('#field-food-ing-assortment-statement').setValue(statement)
    const names = wrapper.find('#field-food-ing-may-be-present')
    await names.setValue('pecans, walnuts')
    await names.trigger('change')
    await nextTick()

    expect(store.foodData.ingredientsExemption).toEqual({
      kind: 'assortment',
      statement,
      mayBePresent: ['pecans', 'walnuts'],
    })
    const pass = store.findings.find((f) => f.code === 'FDA_INGREDIENTS_EXEMPT')
    expect(pass?.citation.reference).toBe('21 CFR 101.100(a)(1)')
    expect(wrapper.find('svg[role="img"]').text(), 'and the canvas prints it').toContain(statement)
    expect(
      store.findings.some((f) => f.code === 'FDA_INGREDIENTS_ORDER_MET'),
      'the common ingredients are still listed and judged',
    ).toBe(true)
  })

  it('still checks a list printed despite the exemption', async () => {
    // The exemption excuses the absence of a statement, not the disorder of one
    // printed anyway. A consumer reading a printed list has no way of knowing it
    // was voluntary, so what is on the label is checked like any other list.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-ing-exemption').setValue('bulk-at-retail')
    await nextTick()
    await wrapper.find('[aria-label="Move almonds up"]').trigger('click')
    await nextTick()

    expect(store.findings.some((f) => f.code === 'FDA_INGREDIENTS_EXEMPT')).toBe(false)
    expect(store.findings.some((f) => f.code === 'FDA_INGREDIENTS_OUT_OF_ORDER')).toBe(true)
  })
})

describe('the responsible firm', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('demands a qualifying phrase once the firm says it did not make the food', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-is-mfr').setValue(false)
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_RESPONSIBLE_FIRM_UNQUALIFIED')
    expect(finding!.citation.reference).toBe('21 CFR 101.5(c)')

    await wrapper.find('#field-food-qualifier').setValue('Distributed by')
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_RESPONSIBLE_FIRM_UNQUALIFIED')).toBe(false)
  })

  it('drops the street address requirement only when the label says it is on file', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-street').setValue('')
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE')).toBe(
      true,
    )

    // 101.5(d)'s own escape, and a fact about a directory rather than a label.
    await wrapper.find('#field-food-directory').setValue(true)
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE')).toBe(
      false,
    )
  })

  it('reports a label that names nobody as blocking', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-has-firm').setValue(false)
    await nextTick()
    const finding = store.findings.find((f) => f.code === 'FDA_RESPONSIBLE_FIRM_MISSING')
    expect(finding!.severity).toBe('blocking')
  })
})

describe('the type-size override seeds a size that complies', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('rounds the seeded em up, never down', async () => {
    // An all-caps declaration needs 6.823066 mm. `toFixed(2)` gave 6.82, which is
    // 0.002 mm short — past the measurement tolerance — so ticking the box
    // reported the label too small the instant the user took control of it.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-inch-pound').setValue('NET WT 12 OZ')
    await nextTick()
    await wrapper.find('#field-food-metric').setValue('(340 G)')
    await nextTick()
    expect(store.failures).toEqual([])

    await wrapper.find('#field-food-override-type').setValue(true)
    await nextTick()

    expect(store.foodData.netQuantityFontSizeMm).toBe(6.83)
    expect(store.failures).toEqual([])
  })

  it('does the same for a mixed-case declaration', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-override-type').setValue(true)
    await nextTick()
    // 4.7625 / 0.540 = 8.819444, so 8.82 rounds up and clears.
    expect(store.foodData.netQuantityFontSizeMm).toBe(8.82)
    expect(store.failures).toEqual([])
  })

  it('lowers the grouped count when the list it covers shrinks', async () => {
    const { store, wrapper } = await mountFood()
    expect(store.foodData.ingredientThreshold!.count).toBe(2)

    for (let i = store.foodData.ingredients!.length; i > 1; i -= 1) {
      await wrapper.find('[aria-label^="Remove "]').trigger('click')
      await nextTick()
    }

    // One entry left, so the statement can cover at most one.
    expect(store.foodData.ingredients!.length).toBe(1)
    expect(store.foodData.ingredientThreshold?.count ?? 0).toBeLessThanOrEqual(1)
  })
})

describe('clearing an optional number means unset, not a blank string', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('removes servings per container rather than writing an empty string', async () => {
    // `v-model.number` hands back the string when `parseFloat` gives NaN, so an
    // emptied box wrote '' into the document — which the API rejects with a raw
    // 400 and the panel draws as " servings per container". 101.9(d)(3)(i)
    // excuses the count outright on a single-serving container, so declining to
    // state it is a thing the label may do, not a malformed request.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-servings').setValue('')
    await nextTick()
    expect('servingsPerContainer' in store.foodData.nutritionFacts!).toBe(false)
    expect(store.failures).toEqual([])
  })

  it('removes a hand-set net quantity type size the same way', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-override-type').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-type-size').setValue('')
    await nextTick()
    expect('netQuantityFontSizeMm' in store.foodData).toBe(false)
    expect(store.failures).toEqual([])
  })
})

describe('the Nutrition Facts displays, from the editor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reports a second column declared with no figures in it', async () => {
    // What ticking the box alone produces. The panel declares two columns and
    // draws one, and the engine says so rather than clearing it — which it did,
    // because the element marking "a second column was drawn" was emitted on the
    // strength of the declaration instead.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-dual').setValue(true)
    await nextTick()

    expect(store.layout!.elements.map((e) => e.elementId)).not.toContain(
      'food-nutrition-second-column',
    )
    expect(store.findings.map((f) => f.code)).not.toContain('FDA_DUAL_COLUMN_FORM_MET')
    expect(store.layout!.omissions.map((o) => o.reason).join(' ')).toContain('second column')
  })

  it('reaches the tabular display and its entitlement rule', async () => {
    // None of stage 6 was reachable from the app until this section existed: the
    // reduced displays, the dual column and the areas the entitlement turns on had
    // no control at all, so `us-food/nutrition-format` was a rule nobody could
    // provoke from the editor it ships in.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-format').setValue('tabular')
    await nextTick()
    await wrapper.find('#field-food-nf-area').setValue(80)
    await nextTick()

    // 80 in² is twice the (j)(13) cap and the label claims no shortage of vertical
    // space, so nothing entitles it to a reduced display.
    expect(store.findings.map((f) => f.code)).toContain('FDA_NUTRITION_FORMAT_NOT_PERMITTED')

    await wrapper.find('#field-food-nf-vertical-space').setValue(2)
    await nextTick()
    // (d)(11)(iii) reaches a package of any size, and the pass cites it rather
    // than the rule's own paragraph.
    const met = store.findings.find((f) => f.code === 'FDA_NUTRITION_FORMAT_MET')
    expect(met!.citation.reference).toBe('21 CFR 101.9(d)(11)(iii)')
  })

  it('declares the facts no artwork can show, rather than inferring them', async () => {
    const { store, wrapper } = await mountFood()
    // A label and panel that do not rule out the 9 in² declared below: 120 × 60 mm is
    // 11.16 in². On the default 44.64 in² label no declaration could reach the route.
    Object.assign(store.foodStock, { widthMm: 120, heightMm: 60, marginMm: 3 })
    store.foodData.container = { shape: 'rectangular', widthMm: 50, heightMm: 60 }
    await nextTick()
    await wrapper.find('#field-food-nf-format').setValue('linear')
    await nextTick()
    await wrapper.find('#field-food-nf-area').setValue(9)
    await nextTick()
    // Linear is gated behind tabular: "only if the label will not accommodate a
    // tabular display", and the label has not said so.
    expect(store.findings.map((f) => f.code)).toContain('FDA_NUTRITION_FORMAT_NOT_PERMITTED')

    await wrapper.find('#field-food-nf-no-tab').setValue(true)
    await nextTick()
    expect(store.findings.map((f) => f.code)).toContain('FDA_NUTRITION_FORMAT_MET')
  })

  /** Every second-column box the rail shows, filled at 250 percent of the serving. */
  const fillSecondColumn = async (wrapper: Awaited<ReturnType<typeof mountFood>>['wrapper']) => {
    const store = useLabelDocumentStore()
    const amounts = store.foodData.nutritionFacts!.amounts
    for (const [id, value] of Object.entries(amounts)) {
      if (id === 'calories' || value === undefined) continue
      const field = wrapper.find(`#field-food-nf2-${id}`)
      if (field.exists()) await field.setValue(String(value * 2.5))
    }
    await nextTick()
  }

  it('reports a second column carrying one figure out of fourteen', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-dual').setValue(true)
    await nextTick()
    // The figures have to be typed — there is no "x2" button, because deriving
    // them would mean this tool authoring part of a regulated statement. So a
    // partly filled column is a state every dual-column label passes through.
    await wrapper.find('#field-food-nf2-total-fat').setValue('7.5')
    await nextTick()

    expect(store.foodData.nutritionFacts!.columns!.mode).toBe('dual')
    // Drawn, not merely declared — the rules read the layout.
    expect(store.layout!.elements.map((e) => e.elementId)).toContain('food-nutrition-second-column')

    // This test previously asserted `store.failures` was empty here, which is
    // how a column of fourteen rows carrying one figure passed for compliant.
    const incomplete = store.failures.find((f) => f.code === 'FDA_DUAL_COLUMN_INCOMPLETE')
    expect(incomplete, 'one figure is not a second declaration').toBeDefined()
    // The rail seeds a per-serving and per-container column and no reference amount, and
    // (e)(6) reaches only the columns (b)(12)(i) and (b)(2)(i)(D) require. With no declared
    // reference amount the engine cannot tell whether they do, so the finding cites (e) —
    // the dual labeling paragraph itself — and says the figure is missing rather than
    // calling the column a choice the user made.
    expect(incomplete!.citation.reference).toBe('21 CFR 101.9(e)')
    expect(incomplete!.message).toContain('has not stated everything')
    expect(incomplete!.message).not.toContain('voluntarily')
  })

  it('clears a second column once every nutrient carries one', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-dual').setValue(true)
    await nextTick()
    await fillSecondColumn(wrapper)

    expect(store.layout!.elements.map((e) => e.elementId)).toContain('food-nutrition-second-column')
    expect(store.failures.map((f) => f.code)).toEqual([])
    expect(store.findings.map((f) => f.code)).toContain('FDA_DUAL_COLUMN_FORM_MET')
  })

  it('reports two columns headed the same, from the form', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-dual').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-nf2-total-fat').setValue('7.5')
    await nextTick()
    await wrapper.find('#field-food-nf-heading-1').setValue('Per serving')
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_DUAL_COLUMN_HEADINGS_MISSING')
    expect(finding, 'identical headings produced no finding').toBeDefined()
    expect(finding!.citation.reference).toBe('21 CFR 101.9(e)(1)')
  })
})

describe('the nutrient readout beside each field', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows no protein percentage, because the panel prints none', async () => {
    // 101.9(d)(7)(ii) sends protein's percentage to (c)(7)(ii), which corrects the
    // amount by a digestibility score no label carries, so the panel omits it.
    // This column claims to say what the panel will print, and it was saying 10%
    // beside a panel printing nothing — the readout and the preview disagreeing
    // about the same document.
    const { wrapper } = await mountFood()
    const protein = wrapper.find('[data-testid="field-food-nf-readout-protein"]')
    expect(protein.exists()).toBe(true)
    expect(protein.text()).toContain('5g')
    expect(protein.text()).not.toContain('%')

    // A nutrient that does print one, so the assertion above is about protein
    // rather than about the column being empty.
    expect(wrapper.find('[data-testid="field-food-nf-readout-sodium"]').text()).toContain('%')
  })
})

describe('major food allergens in the editor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('opens on a label that declares its allergen both ways', async () => {
    const { store, wrapper } = await mountFood()
    expect(store.failures).toEqual([])
    // Belt and braces, which is what most real labels do: the parenthetical in
    // the list and the statement after it.
    expect(wrapper.text()).toContain('almonds (almonds)')
    expect(wrapper.text()).toContain('Contains: almonds.')
  })

  it('reports an allergen the label declares neither way', async () => {
    const { store, wrapper } = await mountFood()
    // The allergen sits on the almonds, at index 1. Its own name carries the
    // food source, which §403(w)(1)(B)(i) accepts by itself — so the ingredient
    // has to be renamed as well as undeclared before the rule can fire.
    await wrapper.find('#field-food-ing-name-1').setValue('nut pieces')
    await nextTick()
    await wrapper.find('#field-food-ing-inline-1').setValue(false)
    await nextTick()
    await wrapper.find('#field-food-contains-tree-nuts').setValue(false)
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_ALLERGEN_NOT_DECLARED')
    expect(finding, 'an undeclared allergen produced no finding').toBeDefined()
    expect(finding!.citation.reference).toBe('FD&C Act §403(w)(1)')
  })

  it('asks for a species once an ingredient is marked as fish', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-ing-allergen-1').setValue('fish')
    await nextTick()

    // §403(w)(2): three of the nine need the specific type, six do not.
    expect(wrapper.find('#field-food-ing-source-1').exists()).toBe(true)
    expect(store.findings.some((f) => f.code === 'FDA_ALLERGEN_SOURCE_NOT_SPECIFIC')).toBe(true)

    await wrapper.find('#field-food-ing-source-1').setValue('cod')
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_ALLERGEN_SOURCE_NOT_SPECIFIC')).toBe(false)
  })

  it('asks for no species for milk', async () => {
    const { wrapper } = await mountFood()
    await wrapper.find('#field-food-ing-allergen-1').setValue('milk')
    await nextTick()
    expect(wrapper.find('#field-food-ing-source-1').exists()).toBe(false)
  })

  it('offers a Contains checkbox only for allergens the recipe carries', async () => {
    const { wrapper } = await mountFood()
    expect(wrapper.find('#field-food-contains-tree-nuts').exists()).toBe(true)
    expect(wrapper.find('#field-food-contains-sesame').exists()).toBe(false)
  })

  it('names all nine, sesame included', async () => {
    const { wrapper } = await mountFood()
    const options = wrapper.find('#field-food-ing-allergen-0').findAll('option')
    // Nine allergens plus the "no major food allergen" entry.
    expect(options).toHaveLength(10)
    expect(wrapper.find('#field-food-ing-allergen-0').text()).toContain('sesame')
  })
})

describe('the form does not fabricate an allergen source', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('drops the specific type when the allergen changes', async () => {
    // fish/"cod" then tree-nuts produced `walnut pieces (cod)` — a food source
    // name for a species the ingredient is not, which the rule then accepted
    // because as far as it could tell the label had declared one.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-ing-allergen-1').setValue('fish')
    await nextTick()
    await wrapper.find('#field-food-ing-source-1').setValue('cod')
    await nextTick()
    expect(store.foodData.ingredients![1]!.allergenSpecificType).toBe('cod')

    await wrapper.find('#field-food-ing-allergen-1').setValue('tree-nuts')
    await nextTick()
    expect(store.foodData.ingredients![1]!.allergenSpecificType).toBeUndefined()
  })

  it('keeps an orphaned Contains checkbox visible so it can be unticked', async () => {
    // Clearing the ingredient's allergen used to hide the checkbox while the id
    // stayed in the statement, leaving the user no control over something the
    // label went on naming.
    const { store, wrapper } = await mountFood()
    expect(store.foodData.containsStatement).toContain('tree-nuts')

    await wrapper.find('#field-food-ing-allergen-1').setValue('')
    await nextTick()

    const orphan = wrapper.find('#field-food-contains-tree-nuts')
    expect(orphan.exists(), 'the orphaned allergen lost its checkbox').toBe(true)

    await orphan.setValue(false)
    await nextTick()
    expect(store.foodData.containsStatement).toBeUndefined()
  })
})

describe('the Nutrition Facts panel in the editor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the panel and its findings', async () => {
    const { store, wrapper } = await mountFood()
    expect(store.failures).toEqual([])
    expect(wrapper.text()).toContain('Nutrition Facts')
    // The panel's own text, drawn on the canvas rather than typed in the form.
    expect(wrapper.text()).toContain('8 servings per container')
    expect(wrapper.text()).toContain('Potassium 235mg')
  })

  it('shows what the panel will print, rounded as 101.9(c) requires', async () => {
    // 163 mg of sodium is above 140, so (c)(4) rounds it in tens to 160. The rail
    // shows the rounding as it happens rather than waiting for a finding.
    const { wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-sodium').setValue('163')
    await nextTick()
    expect(wrapper.text()).toContain('160mg')
  })

  it('reports a panel scaled below the minimums', async () => {
    const { store, wrapper } = await mountFood()
    expect(store.failures).toEqual([])

    await wrapper.find('#field-food-nf-scale').setValue('80')
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_NUTRITION_TYPE_TOO_SMALL')
    expect(finding, 'a shrunken panel produced no finding').toBeDefined()
    expect(finding!.citation.reference).toContain('21 CFR 101.9(d)')
  })

  it('lets the panel print a figure the analysis does not give', async () => {
    // The override is what makes the rounding and percentage rules reachable
    // from the editor at all — without it the printed figures derive and are
    // correct by construction.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-override').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-nf-amt-sodium').setValue('165')
    await nextTick()
    await wrapper.find('#field-food-nf-sodium').setValue('163')
    await nextTick()

    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_ROUNDING_WRONG')).toBe(true)
  })

  it('reports a wrong percentage under the rule that governs that nutrient', async () => {
    // Iron at 8 mg of an 18 mg RDI is 44.4 percent: 45 under 101.9(c)(8)(iii)'s
    // banding, 44 under the whole-percent rule that governs the DRV nutrients.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-override').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-nf-dv-iron').setValue('44')
    await nextTick()

    const finding = store.findings.find((f) => f.code === 'FDA_NUTRITION_PERCENT_DV_WRONG')
    expect(finding!.citation.reference).toBe('21 CFR 101.9(c)(8)(iii)')
  })

  it('clicking a nutrient finding outlines that row, not the whole label', async () => {
    // The debt stage 4 carried: every nutrition finding pointed at the principal
    // display panel because no smaller element existed.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-override').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-nf-dv-iron').setValue('44')
    await nextTick()

    const button = wrapper.findAll('button').find((b) => b.text().includes('Iron shows 44%'))
    expect(button, 'the percentage finding was not rendered as a button').toBeDefined()
    await button!.trigger('click')
    await nextTick()

    expect(store.selectedElementId).toBe('food-nutrition-row-iron')
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(true)
  })

  it('stops asking for a panel once the exemption is claimed', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-present').setValue(false)
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_MISSING')).toBe(true)

    await wrapper.find('#field-food-nf-exemption').setValue('small-business')
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_EXEMPT')).toBe(true)
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_MISSING')).toBe(false)
  })

  it('takes a small package only with its area, and prints the line it asks for', async () => {
    const { store, wrapper } = await mountFood()
    // A label under 12 in² as well: a package bears at least the labeling on it, so the
    // default 120 × 240 mm stock rules the exemption out on its own.
    Object.assign(store.foodStock, { widthMm: 60, heightMm: 70, marginMm: 3 })
    store.foodData.container = { shape: 'rectangular', widthMm: 50, heightMm: 60 }
    await nextTick()
    await wrapper.find('#field-food-nf-present').setValue(false)
    await wrapper.find('#field-food-nf-exemption').setValue('small-package')
    await nextTick()

    // Nothing is seeded, so the claim is not yet shown to qualify.
    expect(wrapper.find<HTMLInputElement>('#field-food-nf-small-area').element.value).toBe('')
    expect(
      store.findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')?.message,
      'a blank area is not read as small',
    ).toContain('declares no area')

    await wrapper.find('#field-food-nf-small-area').setValue(11.5)
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_CONTACT_MISSING')).toBe(true)

    const line = 'For nutrition information, call 1-800-555-0100'
    await wrapper.find('#field-food-nf-contact').setValue(line)
    await nextTick()
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_EXEMPT')).toBe(true)
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_CONTACT_MISSING')).toBe(false)
    expect(
      wrapper.find('svg[role="img"]').text(),
      'and the canvas prints it, wrapped on a label this narrow',
    ).toContain('1-800-555-0100')

    Object.assign(store.foodStock, { widthMm: 120, heightMm: 240, marginMm: 6 })
    await nextTick()
    expect(
      store.findings.find((f) => f.code === 'FDA_NUTRITION_MISSING')?.message,
      'and a label too big for the package it claims to be on is refused',
    ).toContain('The label is itself')
  })

  it('asks a label saved with the old bare flag which paragraph it claims', async () => {
    // Saved before the paragraph was recorded: excused, advised, and shown as such
    // until a paragraph is picked — which clears the flag, so the document never
    // carries both answers to one question.
    const { store, wrapper } = await mountFood()
    delete store.foodData.nutritionFacts
    store.foodData.nutritionFactsExempt = true
    await nextTick()

    const picker = wrapper.find<HTMLSelectElement>('#field-food-nf-exemption')
    expect(picker.element.value).toBe('unstated')
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_EXEMPTION_UNSTATED')).toBe(true)
    expect(store.findings.some((f) => f.code === 'FDA_NUTRITION_MISSING')).toBe(false)

    await picker.setValue('low-volume')
    await nextTick()
    expect(store.foodData.nutritionFactsExempt).toBeUndefined()
    expect(store.foodData.nutritionExemption).toEqual({ kind: 'low-volume' })
    expect(store.findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')?.citation.reference).toBe(
      '21 CFR 101.9(j)(18)',
    )
    expect(
      wrapper.find('#field-food-nf-exemption option[value="unstated"]').exists(),
      'and the placeholder for an unstated paragraph is gone',
    ).toBe(false)
  })

  it('takes a unit container, prints its statement, and lets the wording be chosen', async () => {
    const { store, wrapper } = await mountFood()
    delete store.foodData.nutritionFacts
    await nextTick()
    await wrapper.find('#field-food-nf-exemption').setValue('unit-container')
    await nextTick()

    expect(store.foodData.nutritionExemption).toEqual({ kind: 'unit-container', wording: 'retail' })
    const pass = store.findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')
    expect(pass?.citation.reference).toBe('21 CFR 101.9(j)(15)')
    const canvas = () => wrapper.find('svg[role="img"]').text()
    expect(canvas(), 'and the canvas prints the statement').toContain(
      'This Unit Not Labeled For Retail Sale',
    )

    await wrapper.find('#field-food-nf-unit-wording').setValue('individual')
    await nextTick()
    expect(store.foodData.nutritionExemption).toEqual({
      kind: 'unit-container',
      wording: 'individual',
    })
    expect(canvas()).toContain('This Unit Not Labeled For Individual Sale')
    expect(canvas()).not.toContain('For Retail Sale')
  })

  it('declares a food for children 1 through 3, and draws it against their Daily Values', async () => {
    // 101.9(c)(8)(i) moves such a food onto the children's column, and (d)(9) substitutes
    // "1,000 calories" in its footnote. Omitted means adults and children 4 or more years,
    // so choosing that group clears the field rather than writing the default back.
    const { store, wrapper } = await mountFood()
    const canvas = () => wrapper.find('svg[role="img"]').text()
    const picker = wrapper.find<HTMLSelectElement>('#field-food-nf-represented-for')
    expect(picker.element.value).toBe('adults-and-children-4-plus')
    expect(canvas(), 'premise: an adult footnote').toContain('2,000 calories a day')

    await picker.setValue('children-1-through-3')
    await nextTick()
    expect(store.foodData.nutritionFacts?.representedFor).toBe('children-1-through-3')
    expect(canvas()).toContain('1,000 calories a day')
    expect(canvas()).not.toContain('2,000 calories a day')

    await picker.setValue('adults-and-children-4-plus')
    await nextTick()
    expect(store.foodData.nutritionFacts).not.toHaveProperty('representedFor')
    expect(canvas()).toContain('2,000 calories a day')
  })

  it('asks a food for children 1 through 3 for its protein percentage, and takes one', async () => {
    // 101.9(c)(7)(i): the protein percentage "shall be given" for such a food. The panel
    // prints none unless one is stated, so the rail's printed-figure inputs are where a
    // user answers it.
    const { store, wrapper } = await mountFood()
    const codes = () => store.findings.map((f) => f.code)
    expect(codes(), 'premise: an adult food may omit it').not.toContain(
      'FDA_PROTEIN_PERCENT_MISSING',
    )

    await wrapper.find('#field-food-nf-represented-for').setValue('children-1-through-3')
    await nextTick()
    expect(codes()).toContain('FDA_PROTEIN_PERCENT_MISSING')

    await wrapper.find('#field-food-nf-override').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-nf-dv-protein').setValue(20)
    await nextTick()
    expect(store.foodData.nutritionFacts?.declaredPercentDv?.protein).toBe(20)
    expect(codes()).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
    expect(codes()).toContain('FDA_PROTEIN_PERCENT_MET')
  })

  it('takes a second-column percentage, which a toddler food needs to comply', async () => {
    // (c)(7)(i) requires the protein percentage of such a food, and (e)(6) requires it in
    // both columns of a per-serving and per-container panel. The engine derives none for
    // protein, so until the column could state one the label could not be made compliant.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-nf-represented-for').setValue('children-1-through-3')
    await wrapper.find('#field-food-nf-dual').setValue(true)
    await nextTick()
    const amounts = store.foodData.nutritionFacts!.amounts
    for (const [id, value] of Object.entries(amounts)) {
      if (id === 'calories' || value === undefined) continue
      const field = wrapper.find(`#field-food-nf2-${id}`)
      if (field.exists()) await field.setValue(String(value * 2.5))
    }
    await wrapper.find('#field-food-nf-override').setValue(true)
    await nextTick()
    await wrapper.find('#field-food-nf-dv-protein').setValue(38)
    await nextTick()
    expect(
      store.findings.map((f) => f.code),
      'premise: the second column still states none',
    ).toContain('FDA_PROTEIN_PERCENT_MISSING')

    await wrapper.find('#field-food-nf2-dv-protein').setValue(96)
    await nextTick()
    expect(store.foodData.nutritionFacts!.columns!.secondPercentDv).toEqual({ protein: 96 })
    expect(store.findings.map((f) => f.code)).not.toContain('FDA_PROTEIN_PERCENT_MISSING')
    expect(wrapper.find('svg[role="img"]').text(), 'and the panel prints it').toContain('96%')
  })

  it('takes an egg carton, keeps its nutrition information, and draws no panel', async () => {
    const { store, wrapper } = await mountFood()
    const canvas = () => wrapper.find('svg[role="img"]').text()
    expect(canvas(), 'premise: the panel is drawn').toContain('Nutrition Facts')

    await wrapper.find('#field-food-nf-exemption').setValue('egg-carton')
    await nextTick()
    expect(store.foodData.nutritionExemption).toEqual({
      kind: 'egg-carton',
      presentedIn: 'beneath-lid',
    })
    expect(store.foodData.nutritionFacts, 'the information is kept').toBeDefined()
    expect(canvas(), 'and not drawn on the outer carton').not.toContain('Nutrition Facts')
    const pass = store.findings.find((f) => f.code === 'FDA_NUTRITION_EXEMPT')
    expect(pass?.citation.reference).toBe('21 CFR 101.9(j)(14)')
    expect(
      wrapper.find('#field-food-nf-serving').exists(),
      'and its figures can still be edited',
    ).toBe(true)

    await wrapper.find('#field-food-nf-egg-location').setValue('insert')
    await nextTick()
    expect(store.foodData.nutritionExemption).toEqual({ kind: 'egg-carton', presentedIn: 'insert' })
  })
})

/**
 * A withheld pass has to read as withheld.
 *
 * `runRules` declines to certify an element the engine could not print, which is
 * the fix for a label whose net quantity was drawn 57 mm off the panel and whose
 * five 101.7 rules all reported compliant. Silence would have been the wrong
 * half of that fix: the rail would simply show five fewer passes, which is
 * indistinguishable from five checks nobody wrote.
 */
describe('an element the engine could not draw', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('says so in the rail, and is certified by nothing', async () => {
    const { store, wrapper } = await mountFood()

    // 101.7(i) sizes the declaration from the package, so a carton far larger
    // than its artwork demands type too wide for the label to hold.
    store.foodData.container = { shape: 'rectangular', widthMm: 1800, heightMm: 1800 }
    await nextTick()

    expect(
      store.uncertifiable.map((item) => item.elementId),
      'the premise: the engine must have recorded what it could not draw',
    ).toContain('food-net-quantity')

    const netQuantityPasses = store.passes.filter((f) => f.elementId === 'food-net-quantity')
    expect(
      netQuantityPasses,
      'a declaration drawn off the label cannot be cleared by any of its rules',
    ).toEqual([])

    const rail = wrapper.find('section[aria-labelledby="cannot-check-heading"]')
    expect(rail.exists(), 'the rail must explain the checks it declined').toBe(true)
    expect(rail.text()).toMatch(/not printed/i)

    // The live region has to agree with the block above it, or the announcement
    // contradicts what is on screen.
    expect(wrapper.find('[aria-live="polite"]').text()).toMatch(/could not be checked/i)
  })
})

/**
 * A required dimension left blank stays a number.
 *
 * `v-model.number` hands back the original string when `parseFloat` gives NaN, so
 * clearing a box wrote `''` into a field typed `number`.
 *
 * **It was recorded in `BACKLOG.md` as a false clearance and it is not one.**
 * That entry said the empty string multiplied out to a zero-area panel and
 * cleared every 101.7 rule. The arithmetic holds and the path does not:
 * `assertContainerDrawable` reaches the container first and `Number.isFinite('')`
 * is `false`, so the label never resolved and no rule ever ran. The third test
 * below is the one that would have shown that, and it passes on the old code too
 * — kept for exactly that reason, since a test that cannot fail is worth having
 * only when it is labelled as the control it is.
 */
describe('a required dimension left blank', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('holds NaN rather than the empty string', async () => {
    const { store, wrapper } = await mountFood()

    expect(store.failures).toEqual([])
    expect(store.passes.length).toBeGreaterThan(0)

    await wrapper.find('#field-food-panel-width').setValue('')
    await nextTick()

    const width = (store.foodData.container as { widthMm: number }).widthMm
    expect(typeof width, 'a field typed `number` must hold a number').toBe('number')
    expect(Number.isNaN(width)).toBe(true)
  })

  it('control: the engine already declined to draw, before and after', async () => {
    // Passes on the old code as well, and is here to record that. The layout is
    // refused either way, which is why the entry claiming a false clearance was
    // wrong — there is no verdict to be false, because there is no verdict.
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-panel-width').setValue('')
    await nextTick()

    expect(store.layout).toBeNull()
    expect(store.findings).toEqual([])
    expect(store.layoutError).toMatch(/panel width/i)
    expect(store.findings.map((f) => f.code)).not.toContain('FDA_NET_QUANTITY_ZONE_NOT_REQUIRED')
  })

  it('recovers when a number is typed back in', async () => {
    const { store, wrapper } = await mountFood()
    await wrapper.find('#field-food-panel-width').setValue('')
    await nextTick()
    expect(store.layout).toBeNull()

    await wrapper.find('#field-food-panel-width').setValue('120')
    await nextTick()

    expect(store.layout).not.toBeNull()
    expect(store.failures).toEqual([])
  })
})
