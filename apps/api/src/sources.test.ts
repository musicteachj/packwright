import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { citationsOf, listRules } from '@packwright/label-core'
import { describe, expect, it } from 'vitest'

/**
 * `docs/SOURCES.md` lists every document a rule cites.
 *
 * The list is written by hand, so it drifts the first time a rule cites a new document, a new section, or a new
 * release (GS1 publishes the General Specifications every January) and nobody remembers the list. The citations
 * are the registry's own, so this reads them rather than a copy. Here rather than in `label-core` because it reads
 * a file, and `label-core` imports no `node:*`.
 *
 * Each citation's document is matched by its pattern below, which names the table row that lists it and what that
 * row must say. Checked within the row, not anywhere in the file, so a release number in another row or in prose
 * cannot stand in for this one. A citation no pattern matches fails too: that is a new document, and it belongs in
 * the list before it ships.
 *
 * Only what a citation states can be checked. The GS1 citations name their release, so the release is held to the
 * row; the CFR, U.S. Code and CLP citations name none, so their editions are kept by hand.
 */

const SOURCES = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'SOURCES.md'),
  'utf8',
)

const ROWS = SOURCES.split('\n').filter((line) => line.startsWith('|'))

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A section number named in a row, and not as the start of a longer one: 101.10 is not in "101.100". */
const names = (section: string) => new RegExp(`${escape(section)}(?![.\\d])`)

/** A citation's document: the words that pick out its row, and what that row must also say for this citation. */
const DOCUMENTS: {
  pattern: RegExp
  row: string
  rowSays: (match: RegExpMatchArray) => RegExp[]
}[] = [
  {
    pattern: /^21 CFR (101\.\d+)/,
    row: '21 CFR Part 101, Food Labeling',
    rowSays: (match) => [names(match[1]!)],
  },
  { pattern: /^15 U\.S\.C\. 1453\b/, row: '15 U.S.C. 1453', rowSays: () => [] },
  { pattern: /^FD&C Act §403\(w\)/, row: '§ 403(w), 21 U.S.C. 343(w)', rowSays: () => [] },
  {
    pattern: /^29 CFR 1910\.1200\b/,
    row: '29 CFR 1910.1200, Hazard Communication',
    rowSays: () => [],
  },
  {
    pattern: /^Regulation \(EC\) No 1272\/2008 \(CLP\)/,
    row: 'Regulation (EC) No 1272/2008 (CLP)**, consolidated text in force',
    rowSays: () => [],
  },
  {
    pattern: /^GS1 General Specifications (\d+\.\d+)/,
    row: 'GS1 General Specifications',
    rowSays: (match) => [names(`Release ${match[1]}`)],
  },
  {
    pattern: /^GS1 Digital Link URI Syntax (\d+\.\d+\.\d+)/,
    row: 'GS1 Digital Link Standard: URI Syntax',
    rowSays: (match) => [names(`Release ${match[1]}`)],
  },
]

const references = [
  ...new Set(listRules().flatMap((rule) => citationsOf(rule).map((c) => c.reference))),
]

describe('docs/SOURCES.md', () => {
  it('has citations to check', () => {
    expect(references.length).toBeGreaterThan(50)
  })

  it.each(references)('lists the document "%s" cites', (reference) => {
    const document = DOCUMENTS.find(({ pattern }) => pattern.test(reference))
    expect(
      document,
      `no document pattern matches "${reference}"; add it to docs/SOURCES.md and here`,
    ).toBeDefined()

    const rows = ROWS.filter((line) => line.includes(document!.row))
    expect(rows, `docs/SOURCES.md should have one row for "${document!.row}"`).toHaveLength(1)
    for (const says of document!.rowSays(reference.match(document!.pattern)!)) {
      expect(rows[0], `the "${document!.row}" row should name ${says} for "${reference}"`).toMatch(
        says,
      )
    }
  })
})
