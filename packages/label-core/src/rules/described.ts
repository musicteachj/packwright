/**
 * Rules that give no verdict on a label printed elsewhere.
 *
 * On a `described` label (`LabelSubject`) the layout is this engine's reconstruction,
 * and a rule measuring something the request cannot state measures the
 * reconstruction instead. Every such rule passed by construction: the engine's
 * default for an unstated type size is the regulation's own minimum, its default
 * anchor is the compliant one, and the Nutrition Facts sizes are the table the rule
 * checks against. `/code-review high` on #86 found `check_label` issuing those passes
 * about users' labels, and James decided on 2026-10-11 that on a label printed
 * elsewhere a check gives a verdict only on values the request states in the terms
 * the regulation measures.
 *
 * **Type sizes are not among them.** 21 CFR 101.7(h)(2) and 101.2(c) measure the
 * height of the printed letters ("it is the lower case letter 'o' or its equivalent
 * that shall meet the minimum standards"; "in no case may the letters and/or numbers
 * be less than one-sixteenth inch in height"), both read from the eCFR on
 * 2026-10-11. A request states sizes, where it states them at all, as em sizes, and
 * how tall an em's letters print is the typeface's to decide — this engine measures
 * them in its own face (`text/measure.ts`). A bound was considered and dropped:
 * "an em smaller than the minimum fails in any typeface" assumes no letter is taller
 * than its em, and type designers make no such rule — some faces exceed their set
 * size (read 2026-10-11, Thomas Phinney's typography glossary and the W3C www-style
 * archive). So these checks give no verdict either way.
 *
 * Nor are positions: where the net quantity sits, and how far it is from its
 * neighbours, are where this engine stacked things. An anchor word in the request
 * only restates what its author said, and a pass on it would be a pass on a
 * declaration.
 */

import type { Citation, Finding } from '../types/index'
import type { Decline, DeclinedFact, Rule, RuleContext } from './types'

/**
 * A rule that, on a label printed elsewhere, gives no verdict and says so as a limit
 * of the tool. On a drawing it is the rule unchanged.
 *
 * Wrapping rather than a branch in each `check`, so the stand-down cannot be half
 * done — a rule that dropped its pass and kept its violation would accuse a label
 * of what it declined to clear it of — and so `declines` and `check` agree by
 * construction, which `declinesOf` requires.
 */
export function noVerdictOnADescribedLabel<TContext extends RuleContext>(
  rule: Rule<TContext>,
  limit: { why: string; citation?: Citation },
): Rule<TContext> {
  return {
    ...rule,
    check: (context) => (context.subject === 'described' ? [] : rule.check(context)),
    // Only where the drawing gave a verdict to set aside. A label with no Nutrition
    // Facts panel was told its panel's type sizes went unchecked, which is true of
    // nothing on it. Found by review.
    declines: (context): Decline | undefined =>
      context.subject === 'described' && rule.check(context).length > 0
        ? {
            reason:
              `${limit.why} So it gives no verdict either way on a label it did not draw. That ` +
              'is a limit of this tool, not a fault found in your label.',
            ...(limit.citation === undefined ? {} : { citation: limit.citation }),
            wants: [],
            limit: true,
          }
        : rule.declines?.(context),
  }
}

/**
 * A rule whose verdict, on a label printed elsewhere, waits for fields the request
 * left out — the engine's default stood in for each, and a verdict computed with a
 * default in it is not the label's, either way. On a drawing it is the rule
 * unchanged.
 *
 * The whole verdict, not just the pass: a bar height measured against the minimum for
 * an unstated magnification is as unfounded as a pass on it — a label printed at 80%
 * was told it needed 22.85 mm, the figure for 100%. Found by `/code-review medium` on
 * stage 23. Once the request states every field, the rule runs as it does on a
 * drawing, violations included — the fields named here are the design values the
 * regulation measures (GS1's magnification, bar height and whether the digits are
 * printed), so a verdict on them is a verdict on the label.
 */
export function verdictWaitsOnADescribedLabel<TContext extends RuleContext>(
  rule: Rule<TContext>,
  wait: {
    unstated: (context: TContext) => readonly DeclinedFact[]
    /** Said for the fields actually missing, so a field the request gave is not asked for. */
    reason: (wants: readonly DeclinedFact[]) => string
  },
): Rule<TContext> {
  const waiting = (context: TContext) =>
    context.subject === 'described' ? wait.unstated(context) : []
  return {
    ...rule,
    check: (context) => (waiting(context).length === 0 ? rule.check(context) : []),
    // Asked only where the drawing gave a verdict to wait on: a GTIN whose check digit
    // is wrong draws no symbol, and "state the magnification and this check will run"
    // would promise a check that has nothing to measure. Found by review.
    declines: (context): Decline | undefined => {
      const wants = waiting(context)
      if (wants.length === 0) return rule.declines?.(context)
      if (rule.check(context).length > 0) return { reason: wait.reason(wants), wants }
      // Nothing set aside, so nothing to wait on — but the rule's own question, if it
      // has one, still stands: the dual-column form asking what a second column counts
      // vanished on a label described without its size. Found by review.
      return rule.declines?.(context)
    },
  }
}

/**
 * A rule some of whose findings, on a label printed elsewhere, rest on something no
 * field can state — so those go, the rule's findings on what was stated stay, and
 * where nothing else is left it says so as a limit of the tool.
 *
 * For a rule that measures stated facts and an unstatable one together: the
 * dual-column form, whose headings and cells are stated and whose pass also certifies
 * the separating line and equal prominence by default; and the unit-container
 * exemption, whose wording is stated and whose type size — pass or violation — is
 * the typeface's. Its own declines, which ask for facts the label could state, come
 * first.
 */
export function someFindingsGoOnADescribedLabel<TContext extends RuleContext>(
  rule: Rule<TContext>,
  go: {
    goes: (finding: Finding, context: TContext) => boolean
    why: string
    citation?: Citation
    /**
     * What would let the set-aside findings be judged, where something can: the
     * decline then asks for it, in `why`'s words, instead of standing down at a
     * limit of the tool.
     */
    wants?: readonly DeclinedFact[]
  },
): Rule<TContext> {
  const goes = (one: Finding, context: TContext) =>
    context.subject === 'described' && go.goes(one, context)
  return {
    ...rule,
    check: (context) => rule.check(context).filter((one) => !goes(one, context)),
    declines: (context): Decline | undefined => {
      const own = rule.declines?.(context)
      if (own !== undefined || context.subject !== 'described') return own
      // A limit only where nothing is left: a rule that still judged has not stood down,
      // whatever `declinesOf` would drop. Found by `/code-review high` on #87.
      const findings = rule.check(context)
      if (!findings.some((one) => goes(one, context))) return undefined
      if (findings.some((one) => !goes(one, context))) return undefined
      if (go.wants !== undefined) {
        return {
          reason: go.why,
          ...(go.citation === undefined ? {} : { citation: go.citation }),
          wants: go.wants,
        }
      }
      return {
        reason:
          `${go.why} So it gives no verdict on that on a label it did not draw. That is a ` +
          'limit of this tool, not a fault found in your label.',
        ...(go.citation === undefined ? {} : { citation: go.citation }),
        wants: [],
        limit: true,
      }
    },
  }
}

/** The sentence every type-size stand-down opens with, so they say it one way. */
export const TYPE_SIZE_IS_THE_TYPEFACES =
  'The regulation measures the height of the printed letters, and how tall a type size’s ' +
  'letters print depends on the typeface, which Packwright cannot see.'

/** The decline every size-dependent check gives on a label described without its size. */
export const SIZE_UNSTATED_REASON =
  'The label’s size was not given, and this check is measured against it. State the ' +
  'label’s width and height in millimeters and this check will run.'
