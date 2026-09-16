/**
 * Finding builders.
 *
 * They exist for one reason: a finding's citation is taken from the rule that
 * produced it rather than passed in alongside. Hand-writing the citation at each
 * `return` is how a quiet-zone message ends up carrying the bar-height clause —
 * a mistake that is invisible in review, survives every test that only checks
 * the code, and is precisely the kind of thing that makes a compliance report
 * untrustworthy.
 */

import { roundTo } from '../geometry/units'
import type { Certifies, Citation, Finding, Measurement, Severity } from '../types/index'
import type { Rule } from './types'

interface FindingInputBase {
  code: string
  message: string
  elementId?: string
  measurement?: Measurement
  /** Overrides the rule's citation, for a rule enforcing more than one clause. */
  citation?: Finding['citation']
}

/**
 * Mirrors `Finding`'s own discrimination: a `pass` states what it certifies and
 * everything else may not. `severity: 'pass'` without `certifies` does not
 * compile, which is the guarantee — a fixture sweep can only catch a missing one
 * where a fixture reaches that branch, and several passes are entitlements no
 * known-bad label exercises.
 */
type FindingInput =
  | (FindingInputBase & { severity: 'pass'; certifies: Certifies })
  | (FindingInputBase & { severity: Exclude<Severity, 'pass'>; certifies?: never })

export function finding(rule: Rule, input: FindingInput): Finding {
  if (!rule.codes.includes(input.code)) {
    throw new Error(
      `Rule "${rule.id}" emitted the code "${input.code}", which it does not declare. ` +
        'The rule catalogue is generated from `codes`, so an undeclared code would be ' +
        'invisible to a user browsing the encoded rules.',
    )
  }

  const common = {
    code: input.code,
    message: input.message,
    citation: input.citation ?? rule.citation,
    ...(input.elementId === undefined ? {} : { elementId: input.elementId }),
    ...(input.measurement === undefined ? {} : { measurement: input.measurement }),
  }

  // Branched rather than spread, because the discrimination is the point: one
  // object literal carrying a widened `severity` satisfies neither arm.
  return input.severity === 'pass'
    ? { ...common, severity: 'pass', certifies: input.certifies }
    : { ...common, severity: input.severity }
}

/**
 * A check that ran and cleared **on the artwork** — on what was printed.
 *
 * The strict one, and the default in spirit: a pass built here is withheld when
 * the engine could not draw the element it names. Use it for any requirement the
 * regulation states about the label itself, even where the rule reads the
 * document to judge it. `us-food/responsible-firm` is the shape to keep in mind
 * — it inspects `data.responsibleFirm` and nothing else, but 21 CFR 101.5 is
 * about a name and address *appearing on the label*, so a firm that did not
 * print has not been cleared. Reading the document is a means; what the
 * provision governs is the question.
 *
 * **It is spelled out rather than left to a default.** This used to be `passed`,
 * and omitting `certifies` meant the artwork — so thirty-seven of the thirty-nine
 * passes in the registry took that answer without anyone choosing it, and a
 * fortieth would have done the same. Two named builders make the choice
 * unskippable at the call site, and `Finding` is discriminated on `severity` so a
 * `pass` built any other way does not compile.
 *
 * **Reaching for this name is not, by itself, evidence that anyone read the
 * provision.** When the builders were split, every existing `passed` call became
 * a `passedOnArtwork` call so that no verdict changed in the same commit as the
 * mechanism; the provisions were read afterwards, rule set by rule set. A call
 * site that has been judged carries a note saying what the provision governs. One
 * without such a note has not been.
 *
 * `citation` overrides the rule's own, for the same reason `finding()` allows it
 * — a rule that enforces the same requirement under two regulators must cite the
 * one it actually judged against. Without it a *passing* GHS signal-word check
 * on a US label reported against the EU regulation, which is a wrong citation on
 * a finding a user is being asked to trust.
 */
export function passedOnArtwork(
  rule: Rule,
  code: string,
  message: string,
  elementId?: string,
  citation?: Finding['citation'],
): Finding {
  return finding(rule, {
    code,
    severity: 'pass',
    message,
    certifies: 'artwork',
    ...(elementId === undefined ? {} : { elementId }),
    ...(citation === undefined ? {} : { citation }),
  })
}

/**
 * A check that ran and cleared on the document rather than on the artwork.
 *
 * Use this — and only this — for a verdict that stays true whatever the engine
 * managed to draw: an entitlement, an exemption, or a fact about the food. A
 * food excused from a second column under 101.9(b)(12)(i)(C) is excused whether
 * or not its panel printed, so withholding that pass when the panel is omitted
 * would delete the only explanation of why no column was demanded — and would
 * leave the label reporting nothing at all on the point.
 *
 * Everything else uses `passedOnArtwork`, whose verdict is withheld when the
 * element it names was not printed in full. Neither is a default: the call site
 * says which, and there is no third spelling that declines to answer.
 */
export function passedOnDocument(
  rule: Rule,
  code: string,
  message: string,
  elementId?: string,
  citation?: Finding['citation'],
): Finding {
  return finding(rule, {
    code,
    severity: 'pass',
    message,
    certifies: 'document',
    ...(elementId === undefined ? {} : { elementId }),
    ...(citation === undefined ? {} : { citation }),
  })
}

/**
 * A micrometre. Below this, a difference between two millimetre figures is
 * floating-point noise rather than a real one.
 *
 * Shared, because it was not: `barHeight.ts` guarded the comparison and
 * `quietZone.ts` did not, so a symbol on stock exactly its own footprint wide
 * produced "the right quiet zone measures 2.97 mm; UPC-A requires 2.97 mm" — a
 * violation whose own message says the values are equal, carrying a real GS1
 * citation, while the left side passed on identical numbers.
 */
export const MEASUREMENT_TOLERANCE_MM = 0.001

/**
 * Discards representation error before a value is rounded for display.
 *
 * A UPC-A centred on 60 mm stock leaves exactly 14.325 mm either side. In binary
 * one side lands at 14.325000000000001 and the other at 14.324999999999998, and
 * those straddle the boundary that two-decimal rounding turns on — so the readout
 * came back "14.33 mm / 14.32 mm" for a label that is symmetric to the
 * micrometre. On a tool whose entire claim is that it measures accurately, that
 * is not a rounding nicety; it reads as a bug in the engine.
 *
 * Nine places is far below any physical precision that matters here — a
 * nanometre — and far above where float error lives, so this collapses the noise
 * without touching a real measurement.
 */
function collapseFloatNoise(value: number): number {
  return roundTo(value, 9)
}

/**
 * Millimetres, to two places, with the unit — the house format for a measurement.
 *
 * Display only. Nothing rounds before a comparison: a quiet zone that rounds up
 * to the minimum is still under it, and the symbol still fails to scan.
 */
export function mm(value: number): string {
  return `${roundTo(collapseFloatNoise(value), 2).toFixed(2)} mm`
}

/**
 * An X-dimension, to three places.
 *
 * The nominal EAN/UPC X is 0.330 mm and the permitted range spans 0.264 to
 * 0.660, so two decimal places cannot tell 0.264 from 0.26 — a tenth of the
 * whole range hidden by the format. Measurements at this scale get their own
 * precision rather than the label-wide one.
 */
export function xDimensionMm(value: number): string {
  return `${roundTo(collapseFloatNoise(value), 3).toFixed(3)} mm`
}

/**
 * A sibling provision of `base`, carrying no title.
 *
 * `Citation.title` names the provision, so spreading a primary to reach another
 * paragraph copies a title that describes the wrong one: 101.9(b)(12)(i)(A), an
 * *exemption*, inherited "A second column for a package holding 200 to 300
 * percent of the reference amount". Harmless while nothing rendered it, and the
 * `/rules` catalogue exists to render exactly that field.
 *
 * The title is dropped rather than invented, because composing one here would be
 * this project authoring a description of a regulated provision. `title` is
 * optional; a catalogue shows the reference alone until someone reads the
 * paragraph and writes one.
 */
export function untitled(base: Citation, reference: string): Citation {
  return { authority: base.authority, reference }
}
