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
import type { Finding, Measurement, Severity } from '../types/index'
import type { Rule } from './types'

interface FindingInput {
  code: string
  severity: Severity
  message: string
  elementId?: string
  measurement?: Measurement
  /** Overrides the rule's citation, for a rule enforcing more than one clause. */
  citation?: Finding['citation']
}

export function finding(rule: Rule, input: FindingInput): Finding {
  if (!rule.codes.includes(input.code)) {
    throw new Error(
      `Rule "${rule.id}" emitted the code "${input.code}", which it does not declare. ` +
        'The rule catalogue is generated from `codes`, so an undeclared code would be ' +
        'invisible to a user browsing the encoded rules.',
    )
  }

  return {
    code: input.code,
    severity: input.severity,
    message: input.message,
    citation: input.citation ?? rule.citation,
    ...(input.elementId === undefined ? {} : { elementId: input.elementId }),
    ...(input.measurement === undefined ? {} : { measurement: input.measurement }),
  }
}

/**
 * A check that ran and cleared.
 *
 * `citation` overrides the rule's own, for the same reason `finding()` allows it
 * — a rule that enforces the same requirement under two regulators must cite the
 * one it actually judged against. Without it a *passing* GHS signal-word check
 * on a US label reported against the EU regulation, which is a wrong citation on
 * a finding a user is being asked to trust.
 */
export function passed(
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
