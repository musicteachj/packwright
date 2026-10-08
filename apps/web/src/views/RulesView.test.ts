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
import {
  LABEL_TYPES,
  citationsOf,
  codesOf,
  compareSeverity,
  listRules,
  severitiesOf,
} from '@packwright/label-core'
import { SEVERITY_STYLES } from '../severity'
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
      for (const code of codesOf(rule)) {
        expect(text, `${rule.id} is missing ${code}`).toContain(code)
      }
    }
  })

  it('says what each code is, in words and an icon, never by colour alone', () => {
    // The chips were identical grey for a pass and a violation, so the page could
    // not answer which codes are verdicts. Each now carries every severity its
    // code declares — one code declares two, by regime.
    const wrapper = mountCatalogue()
    let twoSeverities = 0
    for (const rule of listRules()) {
      for (const code of codesOf(rule)) {
        const chip = wrapper.get(`[data-code="${code}"]`)
        const severities = severitiesOf(rule, code)
        if (severities.length > 1) twoSeverities += 1
        for (const severity of severities) {
          expect(chip.text(), `${code} must say it is ${severity}`).toContain(
            SEVERITY_STYLES[severity].word,
          )
          expect(chip.text()).toContain(SEVERITY_STYLES[severity].icon)
        }
      }
    }
    // The premise of the sentence above: the loop met a code with two.
    expect(twoSeverities).toBeGreaterThan(0)
  })

  it('reads a code with two severities as one or the other, most severe first', () => {
    // Side by side, "DANGER WARNING" read as a contradiction — and a screen reader
    // heard exactly that. Which one applies depends on the label (the regime, or
    // the capacity band), so the chip says "or".
    const wrapper = mountCatalogue()
    const twoOrMore = listRules().flatMap((rule) =>
      codesOf(rule)
        .filter((code) => severitiesOf(rule, code).length > 1)
        .map((code) => ({ code, severities: severitiesOf(rule, code) })),
    )
    expect(twoOrMore.length, 'the premise: some code declares two').toBeGreaterThan(0)
    for (const { code, severities } of twoOrMore) {
      const words = [...severities]
        .sort(compareSeverity)
        .map((severity) => SEVERITY_STYLES[severity].word)
      const text = wrapper.get(`[data-code="${code}"]`).text().replace(/\s+/g, ' ')
      expect(text, code).toMatch(new RegExp(words.join('.*\\bor\\b.*')))
    }
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
