/**
 * How a severity is presented.
 *
 * The scale is domain and lives in `label-core`; how it looks is this layer's
 * business. Both halves of that split matter — a rule may never take a colour
 * from here, and the engine may never decide what an icon is.
 *
 * **Every severity carries an icon and a word, never a colour alone.** That is
 * not a general accessibility gesture: warning and pass differ in luminance by a
 * factor of 1.06 on this chrome, which is all but identical in greyscale, and
 * `theme.test.ts` pins that fact precisely so the rule cannot quietly be
 * dropped. The signal words are the ANSI Z535.4 ones the labels this app
 * generates are printed with.
 *
 * Class names are written out rather than composed. Tailwind scans source text
 * for literals, so an interpolated `text-${severity}` produces no CSS at all and
 * fails silently at runtime.
 */

import type { Severity } from '@packwright/label-core'

export interface SeverityStyle {
  /** The ANSI Z535.4 signal word, or `PASS` for a check that cleared. */
  word: string
  /** Geometric, not emoji — the interface should look exacting. */
  icon: string
  text: string
  border: string
  /** The 2px rule beside a finding. Measured against 3:1, not 4.5:1 — it is a graphical object. */
  edge: string
  /** Longer form, for the group heading. */
  heading: string
}

export const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  blocking: {
    word: 'DANGER',
    icon: '⊘',
    text: 'text-danger',
    border: 'border-danger',
    edge: 'border-l-danger-edge',
    heading: 'Blocking — non-compliant as drawn',
  },
  violation: {
    word: 'WARNING',
    icon: '▲',
    text: 'text-warning',
    border: 'border-warning',
    edge: 'border-l-warning-edge',
    heading: 'Violations',
  },
  advisory: {
    word: 'CAUTION',
    icon: '◆',
    text: 'text-caution',
    border: 'border-caution',
    edge: 'border-l-caution-edge',
    heading: 'Advisories',
  },
  guidance: {
    word: 'NOTICE',
    icon: 'ⓘ',
    text: 'text-notice',
    border: 'border-notice',
    edge: 'border-l-notice-edge',
    heading: 'Guidance',
  },
  pass: {
    word: 'PASS',
    icon: '✓',
    text: 'text-pass',
    border: 'border-pass',
    edge: 'border-l-pass-edge',
    heading: 'Checks passed',
  },
}

/**
 * Marks for the two blocks that are **not** verdicts, kept deliberately outside
 * the table above.
 *
 * The rail states four different kinds of thing, and only one of them is a
 * severity. "Cannot be checked" used `SEVERITY_STYLES.advisory.icon` and
 * `text-caution` — CAUTION's own diamond and colour — so on a GHS label it sat
 * beneath two `▲ WARNING` findings and read as a third one. A reader who has
 * learned that a diamond means CAUTION was being taught something false.
 *
 * Geometric, like the five above, and drawn from a different part of the set so
 * neither can be mistaken for a signal word. The hollow square is an element the
 * engine could not draw; the ellipsis is a check that stood down waiting for a
 * fact. Neither carries colour: these blocks are neutral, because a colour here
 * would be the interface implying a severity where no provision is being applied
 * at all.
 */
export const NOT_A_VERDICT = {
  uncertifiable: '□',
  declined: '⋯',
} as const
