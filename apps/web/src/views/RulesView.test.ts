/**
 * The catalogue lists the registry, and nothing else.
 *
 * Every assertion here compares the page against `listRules()` rather than
 * against a number someone typed. A test that expected "34 rules" would pass a
 * page that had silently stopped rendering one and been updated to match — which
 * is the same failure as the hand-written catalogue this view exists to avoid,
 * moved into the test file.
 *
 * **Listing a rule is a claim that the rule runs.** So the count, the per-type
 * totals and the ids are all checked against the registry the engine dispatches
 * through, and the citations against `citationsOf` — the same function the
 * findings are drawn from.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { LABEL_TYPES, citationsOf, listRules } from '@packwright/label-core'
import RulesView from './RulesView.vue'

const mountCatalogue = () =>
  mount(RulesView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })

describe('the rule catalogue', () => {
  it('renders every rule in the registry, and no others', () => {
    const wrapper = mountCatalogue()
    const rendered = wrapper.findAll('article')

    expect(rendered).toHaveLength(listRules().length)

    // Ids, not just a count: two sections rendering the same rule would give the
    // right total and describe a rule set that does not exist.
    const ids = rendered.map((article) => article.find('p.numeric').text())
    expect(ids).toEqual(listRules().map((rule) => rule.id))
  })

  it('preserves registry order within each label type', () => {
    // The order is deliberate — "as a person would check a label", per the
    // registry's own comment — so the page must not sort it into something
    // tidier.
    const wrapper = mountCatalogue()
    const ids = wrapper.findAll('article').map((article) => article.find('p.numeric').text())

    const expected = LABEL_TYPES.flatMap((labelType) => listRules(labelType).map((rule) => rule.id))
    expect(ids).toEqual(expected)
  })

  it('gives each label type a section headed with its own count', () => {
    const wrapper = mountCatalogue()

    for (const labelType of LABEL_TYPES) {
      const heading = wrapper.find(`#section-${labelType}`)
      expect(heading.exists(), labelType).toBe(true)
      expect(heading.text()).toContain(`${listRules(labelType).length} rules`)
    }
  })

  it('prints every provision a rule cites, not only its primary', () => {
    // The reason this view needed `Rule.citations` at all. Sixteen of the
    // thirty-four rules report under more than one paragraph, and the primary
    // alone would answer under half the question the page exists to answer.
    const text = mountCatalogue().text()

    for (const rule of listRules()) {
      for (const citation of citationsOf(rule)) {
        expect(text, `${rule.id} is missing ${citation.reference}`).toContain(citation.reference)
      }
    }
  })

  it('shows the OSHA reference on the GHS signal-word rule, not only the EU one', () => {
    // The case that made a multi-citation catalogue necessary rather than merely
    // better: this rule carries CLP as its primary and reports under 29 CFR
    // 1910.1200 whenever the label's regime is `us-osha`.
    const article = mountCatalogue()
      .findAll('article')
      .find((candidate) => candidate.text().includes('ghs/signal-word-precedence'))

    expect(article, 'the signal-word rule must be listed').toBeDefined()
    expect(article!.text()).toContain('29 CFR 1910.1200')
    expect(article!.text()).toContain('Regulation (EC) No 1272/2008')
  })

  it('lists every code a rule can emit', () => {
    const text = mountCatalogue().text()
    for (const rule of listRules()) {
      for (const code of rule.codes) {
        expect(text, `${rule.id} is missing ${code}`).toContain(code)
      }
    }
  })

  it('puts the masthead in a banner landmark, outside the main content', () => {
    // The header was mounted inside `<main>`, so the page had no `banner` and a
    // skip-to-content jump landed on the nav rather than past it.
    const wrapper = mountCatalogue()
    expect(wrapper.find('main header').exists(), 'the masthead must not be inside main').toBe(false)
    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.find('main').exists()).toBe(true)
  })

  it('marks the catalogue as the current page in the nav', () => {
    // `current` was accepted and half-ignored: every branch tested for 'rules',
    // so the landing link could never be marked current either.
    const links = mountCatalogue().findAll('a')
    const current = links.filter((link) => link.attributes('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]!.text()).toBe('Rules')
  })

  it('renders a citation that has a reference and no title', () => {
    // `untitled()` drops an inherited title rather than composing one, because
    // writing a description of a regulated provision would be this project
    // authoring regulatory text. So a reference without a title is a legitimate
    // state, and the page has to show the reference rather than a blank row.
    const untitled = listRules().flatMap((rule) =>
      citationsOf(rule).filter((citation) => citation.title === undefined),
    )
    expect(untitled.length, 'the premise: some citations carry no title').toBeGreaterThan(0)

    const text = mountCatalogue().text()
    for (const citation of untitled) expect(text).toContain(citation.reference)
  })
})
