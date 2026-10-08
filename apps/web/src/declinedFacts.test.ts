import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { DeclinedFact } from '@packwright/label-core'
import { DECLINED_FACT_FIELDS } from './declinedFacts'
import { useLabelDocumentStore } from './stores/labelDocument'
import EditorView from './views/EditorView.vue'
import { testRouter } from './views/editorTestRouter'

/**
 * Each fact the engine can ask for has a field, and the field is there when it
 * is asked for.
 *
 * The compiler holds the first half: `DECLINED_FACT_FIELDS` is a `Record` over
 * the engine's closed union. This holds the second, which no type can: an id
 * here that the form renames, or a field rendered only under a condition the
 * decline does not share, is a link to nowhere — and `stateFact` would quietly
 * do nothing.
 */

Element.prototype.scrollIntoView = vi.fn()

beforeEach(() => setActivePinia(createPinia()))

type Store = ReturnType<typeof useLabelDocumentStore>

/** The states a check stands down in, built the way a user would reach them. */
const scenarios: Array<[string, (store: Store) => void]> = [
  [
    'a food label that states nothing a second column turns on',
    (store) => {
      store.labelType = 'us-food'
    },
  ],
  [
    'a food label whose second column does not say what it counts',
    (store) => {
      store.labelType = 'us-food'
      const facts = store.foodData.nutritionFacts!
      facts.columns = {
        mode: 'dual',
        headings: ['Per serving', 'Per container'],
        secondAmounts: { ...facts.amounts },
      }
    },
  ],
  [
    'a food label with a per-unit column and no unit content',
    (store) => {
      store.labelType = 'us-food'
      const facts = store.foodData.nutritionFacts!
      facts.referenceAmount = { amount: 40, unit: 'g', category: 'Breakfast cereals' }
      facts.packagedAndSoldIndividually = false
      facts.columns = {
        mode: 'dual',
        basis: 'per-unit',
        headings: ['Per serving', 'Per unit'],
        secondAmounts: { ...facts.amounts },
      }
    },
  ],
  [
    'a food label with an ingredient whose percentage was cleared',
    (store) => {
      store.labelType = 'us-food'
      const [first, ...rest] = store.foodData.ingredients!
      const { percentByWeight: _cleared, ...unweighed } = first!
      store.foodData.ingredients = [unweighed, ...rest]
    },
  ],
  [
    'a chemical label with no hazard classification',
    (store) => {
      store.labelType = 'ghs-chemical'
      store.ghsData.hazards = []
    },
  ],
]

/** One scenario's editor, fresh, with what the engine asked for. */
const mountIn = async (arrange: (store: Store) => void) => {
  setActivePinia(createPinia())
  const store = useLabelDocumentStore()
  arrange(store)
  const wrapper = mount(EditorView, {
    global: { plugins: [testRouter()], stubs: { RouterLink: true } },
  })
  await nextTick()
  return { store, wrapper, wanted: store.declined.flatMap((check) => check.wants) }
}

/**
 * What the page calls the field: its `<label>`, or for a group of controls the
 * heading of the section it sits in.
 */
const labelOn = (wrapper: Awaited<ReturnType<typeof mountIn>>['wrapper'], fieldId: string) => {
  const label = wrapper.find(`label[for="${fieldId}"]`)
  if (label.exists()) return label.text()
  return (
    wrapper.get(`#${fieldId}`).element.closest('section')?.querySelector('h3')?.textContent ?? ''
  )
}

describe('the fields a check that did not run links to', () => {
  it.each(scenarios)(
    'are on the page, named as the page names them: %s',
    async (_name, arrange) => {
      const { wrapper, wanted } = await mountIn(arrange)
      expect(wanted.length, 'the premise: something was asked for').toBeGreaterThan(0)
      for (const fact of wanted) {
        const { fieldId, name } = DECLINED_FACT_FIELDS[fact]
        expect(
          wrapper.find(`#${fieldId}`).exists(),
          `${fact} links to #${fieldId}, which is not there`,
        ).toBe(true)
        // The link says `name`; the field must be called that, unit aside. They
        // were named two ways until review read both.
        expect(
          labelOn(wrapper, fieldId).trim(),
          `${fact}: the link and the field disagree`,
        ).toMatch(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
      }
      wrapper.unmount()
    },
  )

  it('cover every fact the engine can ask for', async () => {
    // Gathered here rather than left by the cases above, so this does not
    // depend on which tests ran before it: alone, shuffled or with a case
    // skipped, the old form failed with nothing broken. Found by review.
    const asked = new Set<DeclinedFact>()
    for (const [, arrange] of scenarios) {
      const { wrapper, wanted } = await mountIn(arrange)
      for (const fact of wanted) asked.add(fact)
      wrapper.unmount()
    }
    expect([...asked].sort()).toEqual(Object.keys(DECLINED_FACT_FIELDS).sort())
  })
})

describe('following a fact', () => {
  it('lands on the field that states it', async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'us-food'
    const wrapper = mount(EditorView, {
      attachTo: document.body,
      global: { plugins: [testRouter()], stubs: { RouterLink: true } },
    })
    await nextTick()

    const control = wrapper
      .findAll('button')
      .find(
        (button) => button.text() === DECLINED_FACT_FIELDS['nutritionFacts.referenceAmount'].name,
      )
    expect(control, 'the rail offers the reference amount').toBeDefined()
    await control!.trigger('click')
    await nextTick()

    expect(document.activeElement?.id).toBe('field-food-nf-racc')
    wrapper.unmount()
  })

  it('lands inside a group of controls on the first of them', async () => {
    // The GHS classification is a group of checkboxes, not a field.
    const store = useLabelDocumentStore()
    store.labelType = 'ghs-chemical'
    store.ghsData.hazards = []
    const wrapper = mount(EditorView, {
      attachTo: document.body,
      global: { plugins: [testRouter()], stubs: { RouterLink: true } },
    })
    await nextTick()

    const control = wrapper.findAll('button').find((b) => b.text() === 'Hazard classification')
    expect(control).toBeDefined()
    await control!.trigger('click')
    await nextTick()

    const focused = document.activeElement as HTMLElement | null
    expect(focused?.tagName).toBe('INPUT')
    expect(
      focused?.closest('#field-ghs-classification'),
      'inside the classification',
    ).not.toBeNull()
    wrapper.unmount()
  })
})

describe('following a fact on a narrow screen', () => {
  // jsdom has no `matchMedia`, which `useNarrowEditor` reads as wide. Faked
  // here so the panes take turns the way they do below `lg`.
  const narrowScreen = () =>
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))

  const onTheChecksPane = async () => {
    const store = useLabelDocumentStore()
    store.labelType = 'us-food'
    const wrapper = mount(EditorView, {
      attachTo: document.body,
      global: { plugins: [testRouter()], stubs: { RouterLink: true } },
    })
    await nextTick()
    await wrapper.get('#tab-checks').trigger('click')
    await nextTick()
    return wrapper
  }

  const showing = (wrapper: Awaited<ReturnType<typeof onTheChecksPane>>, pane: string) =>
    !wrapper.get(`#pane-${pane}`).classes().includes('hidden')

  it('shows the form before it focuses the field', async () => {
    narrowScreen()
    const wrapper = await onTheChecksPane()
    expect(showing(wrapper, 'checks')).toBe(true)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Reference amount')!
      .trigger('click')
    await nextTick()

    expect(showing(wrapper, 'form')).toBe(true)
    expect(document.activeElement?.id).toBe('field-food-nf-racc')
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('stays where it is when the field is not on the page', async () => {
    // Switching first and looking second hid the Checks pane for a field that
    // was not there, taking the focused control with it and leaving an empty
    // form. A link that can go nowhere should at least leave the user where
    // they were.
    narrowScreen()
    const wrapper = await onTheChecksPane()
    document.getElementById('field-food-nf-racc')!.remove()

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Reference amount')!
      .trigger('click')
    await nextTick()

    expect(showing(wrapper, 'checks'), 'still on the pane the link was on').toBe(true)
    expect(showing(wrapper, 'form')).toBe(false)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
