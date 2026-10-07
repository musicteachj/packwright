import type { Finding, Severity } from '@packwright/label-core'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import FindingsRail from './FindingsRail.vue'
import { NOT_A_VERDICT, SEVERITY_STYLES } from '../severity'
import { useAnnouncerStore } from '../stores/announcer'

// The rail says its summary through the announcer, which is a store, so each
// test gets a fresh one and nothing said in one is heard in the next.
beforeEach(() => setActivePinia(createPinia()))

/** What the rail is saying aloud, as the announcer holds it. */
const heard = () => useAnnouncerStore().lines.map((line) => line.text)

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
      uncertifiable: [{ elementId: 'ghs02', reasons: [{ text: 'No verified vector.' }] }],
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

/**
 * The block a heading names, found through the wiring rather than by its text.
 *
 * `findAll('section').find(s => s.text().includes(title))` looks scoped and is
 * not: the rail's own root is a `<section>`, and its text contains every word
 * in every block beneath it, so that predicate matches the root first and every
 * assertion after it runs against the whole rail. The test below was written
 * that way, the `text-caution` assertion at the top of this file has always been
 * that way, and both passed — the first because no other paragraph happened to
 * print `1.2`, the second because nothing anywhere carried that class. The
 * browser spec added in the same change hit the identical trap and only a
 * mutation test found it.
 *
 * `aria-labelledby` is the relationship the markup actually makes, so read the
 * heading's id off the DOM and ask for the section that points at it. Nothing
 * here knows what the id is, which is the point — an assertion written as a
 * literal id is a relationship in disguise.
 */
const blockNamed = (rail: ReturnType<typeof mountRail>, title: string) => {
  const heading = rail.findAll('h3').find((entry) => entry.text().includes(title))
  expect(heading, `a heading reading “${title}” must exist`).toBeDefined()

  const id = heading!.attributes('id')
  expect(id, `“${title}” must have an id for its block to point at`).toBeTruthy()

  const blocks = rail.findAll(`section[aria-labelledby="${id}"]`)
  expect(blocks, `exactly one block may be named by “${title}”`).toHaveLength(1)
  return blocks[0]!
}

describe('the rail tells a verdict from a silence', () => {
  it('borrows no severity mark for the things that are not verdicts', () => {
    // "Cannot be checked" used CAUTION's own diamond and colour, so on a GHS
    // label it sat beneath two warnings and read as a third finding. A reader
    // who has learned that a diamond means CAUTION was being taught something
    // false.
    const rail = mountRail()

    // Scoped through `aria-labelledby` — see `blockNamed`. An earlier version
    // of this found the block by its text, which matched the rail's own root
    // first, so both `not.toContain` assertions ran against every element in
    // the rail. They passed because nothing anywhere carried that class or that
    // glyph, and would have started failing for the wrong reason the day a
    // legitimate advisory finding appeared.
    const block = blockNamed(rail, 'Cannot be checked')

    expect(block.text()).toContain(NOT_A_VERDICT.uncertifiable)
    expect(block.html()).not.toContain('text-caution')
    expect(block.html()).not.toContain(SEVERITY_STYLES.advisory.icon)
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
    // The announcer says the same thing in prose. Announcing both reads it
    // twice.
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

describe('a citation is an identifier wherever it appears', () => {
  it('sets a declined check’s reference in the same face as every other one', () => {
    // It was spelled `font-mono tabular-nums` here: two of `numeric`'s three
    // declarations, missing `font-feature-settings: 'tnum' 1` — the one that
    // fixes the advance width. The same file already used `numeric` for the
    // count strip one block up, and `FindingItem.vue` uses it for the identical
    // kind of citation, so this was one block out of step with its neighbours
    // and nothing could fail because of it.
    const block = blockNamed(mountRail(), 'Checks that did not run')

    // Found by the reference it prints, not by the class under test — a
    // selector that asks for `.numeric` and then asserts `numeric` proves only
    // that `find` works.
    const citation = block.findAll('p').find((entry) => entry.text() === '1.2')
    expect(citation, 'the citation must be findable by its reference').toBeDefined()

    // Only the positive claim. The negative one — that the hand-rolled spelling
    // is gone — belongs to `theme.test.ts`'s source guard, which makes it
    // everywhere rather than here, and an assertion here would have to write
    // the forbidden utility into a file that guard scans.
    expect(citation!.classes()).toContain('numeric')
  })
})

describe('a rail waiting for its label', () => {
  it('says so aloud, and reports nothing about any label', () => {
    // The editor is fetching a label, and the findings it holds belong to
    // whichever document was there before. Reporting them would be the rail
    // certifying a label nobody asked for — so it reports none, and says why.
    const rail = mountRail({ pending: true })

    expect(heard()).toEqual(['Opening this label…'])

    expect(rail.text(), 'no finding from the document being replaced').not.toContain(
      'says something',
    )
    expect(rail.text(), 'and no verdict about it either').not.toContain('Not verdicts')
    expect(rail.find('[aria-hidden="true"].numeric').exists(), 'nor a count strip').toBe(false)
  })

  it('says it where it can be seen too, without saying it twice to a screen reader', () => {
    // Below `lg` this rail is a pane of its own, and someone on it during a
    // wait saw a heading over nothing — what is said aloud is not on screen.
    // The visible line is `aria-hidden` for the reason the count strip is: the
    // announcer already says these words, and hearing both is hearing it twice.
    const rail = mountRail({ pending: true })
    const line = rail.findAll('p').find((p) => p.text() === 'Opening this label…')
    expect(line, 'a visible line saying the wait').toBeDefined()
    expect(line!.attributes('aria-hidden')).toBe('true')
  })

  it('turns the wait into the counts on one line, so the arrival is heard as a change', async () => {
    // Why `pending` and not unmounting. A line that went away for the wait and
    // came back would be a new line; this one changes its words.
    const rail = mountRail({ pending: true })
    expect(heard()).toEqual(['Opening this label…'])

    await rail.setProps({ pending: false })
    expect(heard()).toHaveLength(1)
    expect(heard()[0]).toContain('2 findings')
  })
})

describe('the rail’s summary, said aloud', () => {
  it('is said once, through the announcer, and not by a region of the rail’s own', () => {
    // The rail had its own region, and on a narrow screen showing Checks it sat
    // beside the editor's copy of the same counts, worded differently, both
    // perceivable — measured. The rail now has no region at all.
    const rail = mountRail()
    expect(rail.findAll('[aria-live]')).toHaveLength(0)
    expect(heard()).toHaveLength(1)
    expect(heard()[0]).toContain('2 findings')
  })

  it('says nothing where the page has turned it off', () => {
    // The audit view, whose camera is talking while its report is built.
    mountRail({ announce: false })
    expect(heard()).toEqual([])
  })

  it('stops saying it when the rail is gone', () => {
    // Leaving the editor must not leave its counts standing for the next page
    // to be heard beside.
    mountRail().unmount()
    expect(heard()).toEqual([])
  })
})

describe('an explanation the engine shares is said once', () => {
  const pictogram = (code: string, name: string) => ({
    elementId: `ghs-pictograms-${code}`,
    reasons: [
      {
        text: `The ${code} symbol (${name}) is not drawn. CLP Annex V requires the specimen.`,
        explanation: {
          what: `The ${code} symbol (${name}) is not drawn.`,
          why: 'CLP Annex V requires the specimen.',
        },
      },
    ],
  })

  it('prints each element’s own part, and the shared part once', () => {
    // Two pictograms printed the same explanation twice; five would print it
    // five times. The engine now says which half is shared, so the rail groups
    // on that whole string — it does not take the sentence apart itself.
    const rail = mountRail({
      uncertifiable: [pictogram('GHS02', 'flame'), pictogram('GHS07', 'exclamation mark')],
    })
    const block = blockNamed(rail, 'Cannot be checked')
    const text = block.text()
    expect(text).toContain('The GHS02 symbol (flame) is not drawn.')
    expect(text).toContain('The GHS07 symbol (exclamation mark) is not drawn.')
    expect(text.split('CLP Annex V requires the specimen.').length - 1, 'said once').toBe(1)
  })

  it('still prints an explanation of an element’s own in full', () => {
    const rail = mountRail({
      uncertifiable: [
        pictogram('GHS02', 'flame'),
        { elementId: 'symbol', reasons: [{ text: 'Artwork is printed over the UPC-A symbol.' }] },
      ],
    })
    expect(blockNamed(rail, 'Cannot be checked').text()).toContain(
      'Artwork is printed over the UPC-A symbol.',
    )
  })

  it('counts elements, not sentences, so grouping moves no number', () => {
    // The strip and the summary say how many elements could not be checked.
    // Saying an explanation once must not change that count.
    mountRail({
      uncertifiable: [pictogram('GHS02', 'flame'), pictogram('GHS07', 'exclamation mark')],
    })
    expect(heard()[0]).toContain('2 elements could not be checked')
  })
})
