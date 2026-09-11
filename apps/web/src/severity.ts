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
  /** Longer form, for the group heading. */
  heading: string
}

export const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  blocking: {
    word: 'DANGER',
    icon: '⊘',
    text: 'text-danger',
    border: 'border-danger',
    heading: 'Blocking — non-compliant as drawn',
  },
  violation: {
    word: 'WARNING',
    icon: '▲',
    text: 'text-warning',
    border: 'border-warning',
    heading: 'Violations',
  },
  advisory: {
    word: 'CAUTION',
    icon: '◆',
    text: 'text-caution',
    border: 'border-caution',
    heading: 'Advisories',
  },
  guidance: {
    word: 'NOTICE',
    icon: 'ⓘ',
    text: 'text-notice',
    border: 'border-notice',
    heading: 'Guidance',
  },
  pass: {
    word: 'PASS',
    icon: '✓',
    text: 'text-pass',
    border: 'border-pass',
    heading: 'Checks passed',
  },
}
