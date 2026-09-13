/**
 * A label carries one signal word, never both.
 *
 * CLP Article 20(3), verbatim: "Where the signal word 'Danger' is used on the
 * label, the signal word 'Warning' shall not appear on the label." OSHA states
 * the same rule in its own words at 1910.1200 Appendix C.2.1.1, so unlike the
 * dimensional rules this one applies under either regime — each cited to its own
 * regulator rather than one standing in for the other.
 *
 * This rule is only checkable because the document can hold more than one signal
 * word. It could not before: a single-valued field made the violation
 * unrepresentable, and a rule with nothing to catch is not a check.
 */

import { GHS_ELEMENTS } from '../../templates/ghs'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_SIGNAL_WORD_CONFLICT = 'GHS_SIGNAL_WORD_CONFLICT'
export const GHS_SIGNAL_WORD_SINGLE = 'GHS_SIGNAL_WORD_SINGLE'

const EU: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Article 20(3)',
  title: 'Precedence of signal words',
}

const US: Citation = {
  authority: 'OSHA',
  reference: '29 CFR 1910.1200, Appendix C, C.2.1.1',
  title: 'Precedence of hazard information',
}

export const ghsSignalWordRule: GhsChemicalRule = {
  id: 'ghs/signal-word-precedence',
  title: 'Where “Danger” is used, “Warning” does not appear.',
  citation: EU,
  citations: [EU, US],
  codes: [GHS_SIGNAL_WORD_CONFLICT, GHS_SIGNAL_WORD_SINGLE],
  appliesTo: 'ghs-chemical',

  check({ data }: GhsChemicalContext): Finding[] {
    const words = data.signalWords ?? []
    // No signal word is a different question — whether one was required at all
    // depends on the classification, and that belongs to a rule that reads it.
    if (words.length === 0) return []

    const citation = data.regime === 'us-osha' ? US : EU

    if (words.includes('Danger') && words.includes('Warning')) {
      return [
        finding(ghsSignalWordRule, {
          code: GHS_SIGNAL_WORD_CONFLICT,
          severity: 'violation',
          message:
            'The label carries both “Danger” and “Warning”. Where “Danger” is used, ' +
            '“Warning” may not appear.',
          measurement: { actual: words.join(' and '), required: 'Danger' },
          elementId: GHS_ELEMENTS.signalWord,
          citation,
        }),
      ]
    }

    return [
      passed(
        ghsSignalWordRule,
        GHS_SIGNAL_WORD_SINGLE,
        `The label carries one signal word, “${words[0]}”.`,
        GHS_ELEMENTS.signalWord,
        citation,
      ),
    ]
  },
}
