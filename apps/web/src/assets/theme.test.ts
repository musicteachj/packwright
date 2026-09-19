// @vitest-environment node
//
// Reads a file, so it needs Node rather than the jsdom default this workspace
// uses for component tests.

import { globSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contrast is a requirement here, not a preference.
 *
 * The severity scale is derived from ANSI Z535's signal words, and safety
 * colours are chosen to be legible across a factory floor rather than on a
 * screen — they are high-chroma by design. None of them can be assumed to pass
 * a contrast check just because it looks vivid, so every pairing is measured.
 *
 * The values are read out of `main.css` rather than restated here. That is
 * deliberate: a copy of the palette in the test would let the shipped tokens
 * drift from the tested ones, each passing its own checks — the exact failure
 * pattern that produced three separate defects in the stage 1 and 2 reviews.
 */

const css = readFileSync(fileURLToPath(new URL('./main.css', import.meta.url)), 'utf8')

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Token --color-${name} not found in main.css`)
  return match[1] as string
}

/** WCAG 2.2 relative luminance. */
function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as [number, number, number]
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACES = ['chrome-950', 'chrome-900', 'chrome-800'] as const
const SEVERITIES = ['danger', 'warning', 'caution', 'notice', 'pass'] as const

describe('severity colours against the chrome', () => {
  it.each(SEVERITIES)('%s clears 4.5:1 on every surface it can sit on', (severity) => {
    for (const surface of SURFACES) {
      expect(
        contrast(token(severity), token(surface)),
        `${severity} on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the five severities distinct in hue, not merely in lightness', () => {
    // Warning and pass are within 1.06 of each other in luminance — all but
    // identical in greyscale. That is not a defect to fix by shifting the
    // palette; it is why the design rule is that colour never carries meaning
    // alone. This pins the fact so the rule cannot quietly be dropped.
    const values = SEVERITIES.map(token)
    expect(new Set(values).size).toBe(SEVERITIES.length)
  })
})

describe('text on the chrome', () => {
  it.each(['chrome-100', 'chrome-300'] as const)('%s is readable as body text', (text) => {
    for (const surface of SURFACES) {
      expect(contrast(token(text), token(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })

  it('chrome-500 is NOT body text — it is a hairline and disabled-state token', () => {
    // 2.71:1 on chrome-800. Recorded as a failing case on purpose: the guardrail
    // is knowing which greys may carry words, and this one may not.
    expect(contrast(token('chrome-500'), token('chrome-800'))).toBeLessThan(4.5)
  })
})

describe('the canvas', () => {
  it('prints black bars on paper at print-grade contrast', () => {
    // The label is the artifact. Whatever the interface does, the symbol itself
    // has to be a true black on a true white or it will not scan.
    expect(contrast('#000000', token('paper'))).toBeGreaterThan(20)
  })

  it('floats the paper clearly off the graphite field', () => {
    expect(contrast(token('paper'), token('chrome-950'))).toBeGreaterThan(15)
  })
})

describe('the palette states its provenance', () => {
  it('does not claim to be ANSI Z535.1 values', () => {
    // The one thing this file must never imply. The standard is paywalled and
    // its Pantone equivalents are explicitly not valid for compliance, so the
    // comment has to say these are derived — and a rule may never take a
    // label's colour from them.
    expect(css).toMatch(/not its published values/i)
    expect(css).toMatch(/nothing generated onto a label may take its colour from here/i)
  })
})

describe('the guardrail is enforced, not just documented', () => {
  it('no component sets text in a token that fails contrast', () => {
    // chrome-500 measures 3.01:1 on chrome-900 — legible enough to look fine to
    // whoever wrote it, and below the threshold. Documenting that in a comment
    // did not stop it being used for the citation lines on the landing view, so
    // the rule is checked rather than trusted.
    const components = globSync('../**/*.vue', { cwd: dirname(fileURLToPath(import.meta.url)) })
    const offenders = components.filter((file) =>
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), 'utf8').includes(
        'text-chrome-500',
      ),
    )
    expect(offenders).toEqual([])
  })
})

/** Every `--color-*` main.css actually declares. */
const DECLARED = new Set([...css.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1] as string))

/**
 * The families that resolve to a `--color-*` token rather than to a Tailwind
 * built-in — `border-b` and `text-xs` are not colours and must not be caught.
 *
 * **Derived, not listed.** A hand-written list is a second copy of the palette,
 * and the whole reason this file reads `main.css` rather than restating it is
 * that two copies drift while each passes its own checks. Declaring a new family
 * in `main.css` now extends this guard by itself.
 */
const COLOUR_FAMILIES = [...new Set([...DECLARED].map((name) => name.replace(/-\d+$/, '')))]

/**
 * Comments are prose, and prose has to be able to name a broken class in order
 * to explain it — the note inside the test below does exactly that. An earlier
 * draft of this guard scanned comments too and flagged its own explanation,
 * which is unfixable without either weakening the guard or forbidding a comment
 * from quoting a class name. Only code may *use* a utility, so comments come
 * out first.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

describe('a colour utility may only name a token that exists', () => {
  it('no source file asks for a token main.css does not declare', () => {
    // `LabelsView` asked for `text-danger-300` and `border-danger-600` for a
    // phase. Neither is a token — `main.css` declares a flat `--color-danger` —
    // so Tailwind generated no rule at all and the saved-labels error and the
    // delete button rendered in inherited body colour. Nothing failed, because
    // the test that touched it selected on the class name, and a class name is
    // present whether or not it styles anything.
    const root = dirname(fileURLToPath(import.meta.url))
    const pattern = new RegExp(
      `\\b(?:text|bg|border|outline|accent|fill|stroke|ring|divide|decoration)-` +
        `(?:${COLOUR_FAMILIES.join('|')})(?:-[a-z0-9]+)?\\b`,
      'g',
    )

    const offenders: string[] = []
    for (const file of globSync(['../**/*.vue', '../**/*.ts'], { cwd: root })) {
      const source = withoutComments(readFileSync(join(root, file), 'utf8'))
      for (const [utility] of source.matchAll(pattern)) {
        const name = utility.slice(utility.indexOf('-') + 1)
        if (!DECLARED.has(name)) offenders.push(`${file} → ${utility}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
