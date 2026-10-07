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
    'a chemical label with no hazard classification',
    (store) => {
      store.labelType = 'ghs-chemical'
      store.ghsData.hazards = []
    },
  ],
]

describe('the fields a check that did not run links to', () => {
  const asked = new Set<DeclinedFact>()

  it.each(scenarios)('are on the page when they are asked for: %s', async (_name, arrange) => {
    const store = useLabelDocumentStore()
    arrange(store)
    const wrapper = mount(EditorView, {
      global: { plugins: [testRouter()], stubs: { RouterLink: true } },
    })
    await nextTick()

    const wanted = store.declined.flatMap((check) => check.wants)
    expect(wanted.length, 'the premise: something was asked for').toBeGreaterThan(0)
    for (const fact of wanted) {
      asked.add(fact)
      const { fieldId } = DECLINED_FACT_FIELDS[fact]
      expect(
        wrapper.find(`#${fieldId}`).exists(),
        `${fact} links to #${fieldId}, which is not there`,
      ).toBe(true)
    }
  })

  it('cover every fact the engine can ask for', () => {
    // Run after the cases above, which record what they saw asked. Without
    // this, a fact no scenario reaches would never have its field checked.
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
