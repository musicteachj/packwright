/**
 * The audit page's sample label: a photograph, and a reading of it on record.
 *
 * Since 2026-10-18 a public deployment reads photographs only for people given
 * its audit key (`docs/security-review-2026-10-18.md`, fix 2), so a visitor
 * without one could not see the audit do anything. This lets them, and sends
 * nothing to do it.
 *
 * - **The photograph** is `apps/api/src/audit/fixtures/sampleLabel.png`, copied
 *   into `public/`: a hand-authored acetone label printed with both DANGER and
 *   WARNING, which CLP Article 20(3) forbids.
 * - **The reading** is what the server's own `extractGhsLabel` makes of
 *   `recorded.json`, the reply claude-opus-5 gave to that photograph when it was
 *   recorded, under `eu-clp`. It is written by `npm run write:sample-reading` in
 *   `apps/api`.
 *
 * `apps/api/src/audit/sampleReading.test.ts` fails if either copy drifts from its
 * source. Nothing here is label data: the page shows the reading as it shows any
 * other, every row unaccepted until the visitor accepts it, and capacity and
 * size are left for the visitor to type.
 */
import type { GhsRegime } from '@packwright/label-core'
import type { LabelReading } from '../api/audit'
import sampleReading from './sampleReading.json'

/**
 * Frozen all the way down. The page holds a reading in a deep `ref`, which would
 * otherwise make this module's one copy reactive and editable for the life of
 * the page, so a later load could show an edited reading as the recorded one.
 * Vue leaves a frozen object as it is.
 */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) frozen(inner)
    Object.freeze(value)
  }
  return value
}

export const SAMPLE = {
  photoUrl: '/samples/acetone-label.png',
  /** The market the reply was recorded under, which a reading belongs to. */
  regime: 'eu-clp' satisfies GhsRegime,
  /** When the reply was recorded (`f35f630`). */
  recordedOn: '2026-09-15',
  reading: frozen(sampleReading as LabelReading),
} as const
