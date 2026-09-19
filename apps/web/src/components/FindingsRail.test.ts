import type { Finding, Severity } from '@packwright/label-core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FindingsRail from './FindingsRail.vue'
import { NOT_A_VERDICT, SEVERITY_STYLES } from '../severity'

const finding = (severity: Severity, code: string): Finding =>
  ({
    severity,
    code,
    message: `${code} says something`,
    citation: { authority: 'EU', reference: 'CLP Annex I, 1.2.1.2' },
  }) as unknown as Finding

const mountRail = (over: Record<string, unknown> = {}) =>
  mount(FindingsRail, {
    props: {
      groups: [
        ['violation', [finding('violation', 'A'), finding('violation', 'B')]],
      ] as ReadonlyArray<[Severity, Finding[]]>,
      failures: [finding('violation', 'A'), finding('violation', 'B')],
      passes: [finding('pass', 'P')],
      uncertifiable: [{ elementId: 'ghs02', reasons: ['No verified vector.'] }],
      declined: [
        {
          ruleId: 'ghs/pictograms',
          reason: 'State a classification.',
          citation: { reference: '1.2' },
        },
      ],
      selectedElementId: null,
      ...over,
    },
  })

describe('the rail tells a verdict from a silence', () => {
  it('borrows no severity mark for the things that are not verdicts', () => {
    // "Cannot be checked" used CAUTION's own diamond and colour, so on a GHS
    // label it sat beneath two warnings and read as a third finding. A reader
    // who has learned that a diamond means CAUTION was being taught something
    // false.
    const rail = mountRail()

    // Found by the section's own text, not by an id. The first version of this
    // guessed `[aria-labelledby$="uncertifiable-heading"]`, which matches
    // nothing — the id is built elsewhere — so the selector fell through to the
    // root rail and the `text-caution` assertion was unscoped. It passed because
    // nothing anywhere carried that class, and would have started failing for
    // the wrong reason the day a legitimate advisory finding appeared.
    const block = rail
      .findAll('section')
      .find((section) => section.text().includes('Cannot be checked'))
    expect(block, 'the uncertifiable block must be findable').toBeDefined()

    expect(block!.text()).toContain(NOT_A_VERDICT.uncertifiable)
    expect(block!.html()).not.toContain('text-caution')
    expect(block!.html()).not.toContain(SEVERITY_STYLES.advisory.icon)
    expect(rail.text()).toContain(NOT_A_VERDICT.declined)
  })

  it('draws a line where the verdicts stop', () => {
    expect(mountRail().text()).toContain('Not verdicts')
  })

  it('draws no such line when there is nothing beneath it', () => {
    // The rule is a claim about what follows. With nothing following, it is a
    // heading over an empty space.
    const rail = mountRail({ uncertifiable: [], declined: [] })
    expect(rail.text()).not.toContain('Not verdicts')
  })

  it('keeps the words the limits document explains to a reader', () => {
    // `docs/WHAT-IS-NOT-CHECKED.md` uses both verbatim to tell a reader they are
    // different and only one is theirs to fix. The structure may move; these
    // may not, unless that document moves with them.
    const text = mountRail().text()
    expect(text).toContain('Cannot be checked')
    expect(text).toContain('Checks that did not run')
  })
})

describe('the rail states its totals where they can be seen', () => {
  it('counts every kind, including the two that are not verdicts', () => {
    // `summary` was `sr-only`, so a sighted reader got a heading and a scroll.
    const strip = mountRail().get('[aria-hidden="true"].numeric')
    expect(strip.text()).toContain('2') // violations
    expect(strip.text()).toContain(NOT_A_VERDICT.uncertifiable)
    expect(strip.text()).toContain(NOT_A_VERDICT.declined)
  })

  it('hides the strip from assistive technology, which already hears the summary', () => {
    // The live region below says the same thing in prose. Announcing both reads
    // it twice.
    expect(mountRail().get('.numeric').attributes('aria-hidden')).toBe('true')
  })

  it('shows no strip at all when nothing has run', () => {
    const rail = mountRail({
      groups: [],
      failures: [],
      passes: [],
      uncertifiable: [],
      declined: [],
    })
    expect(rail.find('[aria-hidden="true"].numeric').exists()).toBe(false)
  })
})
