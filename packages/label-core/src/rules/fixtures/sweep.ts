/**
 * Every finding every rule emits across every fixture, in one place.
 *
 * **It is here because two tests grew their own copy of it.** `citations.test.ts`
 * asked whether each finding's citation was declared; `certification.test.ts`
 * asked whether each pass said what it certified. The second was written from
 * the first, and dropped the one thing the first had added on purpose — the
 * documents below, which reach paragraphs no known-bad fixture does. So the
 * newer sweep silently missed ten pass codes including *both* of the two
 * `passedOnDocument` sites there were then: the half of the distinction that
 * actually changes a verdict was never observed by the test built to police it.
 *
 * One sweep, two filters. Neither can fall behind the other now.
 *
 * **Rule by rule, not through `runRules`.** The withholding drops exactly the
 * findings these tests have to inspect — a pass it discards still had to declare
 * a citation and still had to say what it rested on.
 *
 * `bwip` is a parameter for the reason `layOutUpcALabel` takes one: `label-core`
 * does not import it. The renderer is handed in at the edge so the package keeps
 * running in the browser, on the server and in tests unchanged.
 */

import { layOutUpcALabel } from '../../layout/engine'
import { layOutGhsLabel } from '../../layout/ghsEngine'
import { layOutUsFoodLabel } from '../../layout/usFoodEngine'
import type { LabelStock } from '../../templates/stock'
import type { Finding } from '../../types/index'
import { GHS_RULES, GS1_RETAIL_RULES, US_FOOD_RULES } from '../registry'
import type { Rule } from '../types'
import { CONFORMANT_FIXTURE, GS1_RETAIL_FIXTURES } from './gs1Retail'
import { GHS_CONFORMANT, GHS_FIXTURES } from './ghs'
import { US_FOOD_CONFORMANT, US_FOOD_FIXTURES, US_FOOD_SMALL_PANEL } from './usFood'

export interface SweptFinding {
  rule: Rule
  finding: Finding
  /** `'fixtures'` for the known-bad and conformant labels, or a permission path's label. */
  source: string
}

/**
 * Documents that reach branches no known-bad fixture does.
 *
 * The fixtures are known-bad labels, one per violation code, so a pass issued
 * only for a **permission** is never exercised by them: there is nothing bad
 * about being exempt, so no fixture is.
 *
 * Still incomplete, and `docs/BACKLOG.md` says which pass codes remain out of
 * reach — one of them cannot be reached at all while the GHS engine hardcodes
 * `glyphDrawn: false`.
 */
type UsFoodDocument = (typeof US_FOOD_CONFORMANT)['data']

const { nutritionFacts: _panel, ...WITHOUT_A_PANEL } = US_FOOD_CONFORMANT.data

/**
 * **Each entry is described by what it makes a rule do, and by nothing else.**
 * The first draft characterised the paragraphs these reach. One characterisation
 * dropped the condition its paragraph attaches — (d)(11)(iii) permits the tabular
 * display where continuous vertical space runs short — so the document built on
 * it never declared that fact and reached nothing. A second left a panel in place
 * that its rule's exemption branch requires to be absent.
 * Both carried comments naming the pass they existed for. `certification.test.ts`
 * now asserts that every entry here produces a pass code the known-bad and
 * conformant fixtures do not, so a document that reaches nothing fails rather
 * than decorates.
 */
export const PERMISSION_PATHS: Array<{ label: string; data: UsFoodDocument; stock?: LabelStock }> =
  [
    // `us-food/ingredient-list` clears an exempt label with no list.
    {
      label: 'ingredients exempt',
      data: {
        ...US_FOOD_CONFORMANT.data,
        ingredients: [],
        ingredientsExemption: { kind: 'bulk-at-retail' },
      },
    },
    // The same rule clears an assortment whose statement names what may be present,
    // citing (a)(1) — the one citation no other document here emits.
    {
      label: 'assortment exempt',
      data: {
        ...US_FOOD_CONFORMANT.data,
        ingredientsExemption: {
          kind: 'assortment',
          statement: 'May also contain pecans or walnuts.',
          mayBePresent: ['pecans', 'walnuts'],
        },
      },
    },
    // `us-food/nutrition-completeness` clears an exempt label with no panel. The
    // panel has to be *absent*, not merely unused: its exemption branch tests for it.
    {
      label: 'nutrition exempt',
      data: { ...WITHOUT_A_PANEL, nutritionExemption: { kind: 'small-business' } },
    },
    // The same rule clears a small package bearing (j)(13)(i)(A)'s line, citing the
    // subparagraph rather than (j) — the one citation no other document here emits.
    {
      label: 'small package nutrition exempt',
      data: {
        ...WITHOUT_A_PANEL,
        container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
        nutritionExemption: {
          kind: 'small-package',
          availableSurfaceSqInches: 11.5,
          contactLine: 'For nutrition information, call 1-800-555-0100',
        },
      },
      // A label and a panel under 12 in² too, since each is a floor under the package's surface.
      stock: { widthMm: 60, heightMm: 70, marginMm: 3 },
    },
    // `us-food/net-quantity-placement` exempts a 4.65 in² package whose declaration
    // clears its presence, type size and separation. `US_FOOD_SMALL_PANEL` reached
    // this until the exemption learned to ask, and its declaration is crowded.
    {
      label: 'small package placement exempt',
      data: {
        ...US_FOOD_CONFORMANT.data,
        container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
      },
    },
    // `us-food/nutrition-format` clears a small package on the tabular display.
    // It declines outright for the vertical display, which needs no entitlement.
    {
      label: 'tabular display, small package',
      data: {
        ...US_FOOD_CONFORMANT.data,
        container: { shape: 'rectangular', widthMm: 50, heightMm: 60 },
        nutritionFacts: {
          ...US_FOOD_CONFORMANT.data.nutritionFacts!,
          format: 'tabular',
          availableSurfaceSqInches: 5,
        },
      },
      // A label and panel under 12 in², so the declared 5 in² is not ruled out. Built on
      // the conformant 44.64 in² label, this document reached the pass it existed for
      // by trusting a figure the label contradicted.
      stock: { widthMm: 60, heightMm: 70, marginMm: 3 },
    },
    // `us-food/dual-column-required` reports a second column excused. It is built
    // with `passedOnDocument`, and without it the sweep observes only one of the
    // two answers `certifies` can take.
    {
      label: 'second column excused',
      data: {
        ...US_FOOD_CONFORMANT.data,
        nutritionFacts: {
          ...US_FOOD_CONFORMANT.data.nutritionFacts!,
          availableSurfaceSqInches: 60,
          referenceAmount: { amount: 22, unit: 'g', category: 'Snacks' },
          packageContent: 55,
          packagedAndSoldIndividually: true,
          dualColumnExemption: { rawCommodityVoluntary: true },
        },
      },
    },
  ]

export function sweepEveryRule(bwip: unknown): SweptFinding[] {
  const swept: SweptFinding[] = []
  // `source` has no default. Only the US-food loop used to pass one, so a GHS
  // permission document added later would have been labelled a fixture and
  // escaped the check that every permission document reaches something.
  const collect = (rule: Rule, findings: Finding[], source: string) => {
    for (const finding of findings) swept.push({ rule, finding, source })
  }

  for (const fixture of [...GS1_RETAIL_FIXTURES, CONFORMANT_FIXTURE]) {
    const layout = layOutUpcALabel(bwip as never, { data: fixture.data, stock: fixture.stock })
    const context = {
      labelType: 'gs1-retail',
      data: fixture.data,
      stock: fixture.stock,
      layout,
    } as const
    for (const rule of GS1_RETAIL_RULES) collect(rule, rule.check(context), 'fixtures')
  }

  for (const fixture of [...GHS_FIXTURES, GHS_CONFORMANT]) {
    const layout = layOutGhsLabel({ data: fixture.data, stock: fixture.stock })
    const context = {
      labelType: 'ghs-chemical',
      data: fixture.data,
      stock: fixture.stock,
      layout,
    } as const
    for (const rule of GHS_RULES) collect(rule, rule.check(context), 'fixtures')
  }

  for (const fixture of [
    ...US_FOOD_FIXTURES.map((f) => ({ ...f, source: 'fixtures' })),
    { ...US_FOOD_CONFORMANT, source: 'fixtures' },
    { ...US_FOOD_SMALL_PANEL, source: 'fixtures' },
    ...PERMISSION_PATHS.map(({ label, data, stock }) => ({
      data,
      stock: stock ?? US_FOOD_CONFORMANT.stock,
      source: label,
    })),
  ]) {
    const layout = layOutUsFoodLabel({ data: fixture.data, stock: fixture.stock })
    const context = {
      labelType: 'us-food',
      data: fixture.data,
      stock: fixture.stock,
      layout,
    } as const
    for (const rule of US_FOOD_RULES) collect(rule, rule.check(context), fixture.source)
  }

  return swept
}
