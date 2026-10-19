/**
 * The audit page's sample, held to what it claims to be.
 *
 * The page offers a recorded reading of `fixtures/sampleLabel.png` so that a
 * visitor without the audit key can see the audit work. Both halves live in the
 * web app, copied rather than served from here, so each is checked against its
 * source: the picture must be the one the reply was recorded against, and the
 * reading must be what `extractGhsLabel` makes of that reply today. A copy that
 * drifted would show a reading of one label beside a picture of another, or a
 * mapping this server no longer performs.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SAMPLE_PHOTO_PATH,
  SAMPLE_READING_PATH,
  SERVED_SAMPLE_PHOTO_PATH,
  replaySampleReading,
} from './sampleReading'

const committed = JSON.parse(readFileSync(SAMPLE_READING_PATH, 'utf8')) as {
  extraction: { fields: { signalWords?: { value: unknown } } }
}

describe('the audit page’s sample label', () => {
  it('shows the picture the recorded reply was made from', () => {
    // `npm run sample:photo` writes both.
    expect(readFileSync(SERVED_SAMPLE_PHOTO_PATH).equals(readFileSync(SAMPLE_PHOTO_PATH))).toBe(
      true,
    )
  })

  it('shows what this server makes of the recorded reply today', async () => {
    expect(
      committed,
      'apps/web/src/audit/sampleReading.json has drifted. If extract.test.ts fails too, the mapping has regressed: fix extract.ts, and do not re-write the sample. Otherwise run `npm run write:sample-reading --workspace @packwright/api`.',
    ).toEqual(await replaySampleReading())
  })

  it('still carries the defect the demo is there to find', () => {
    // DANGER beside WARNING, which CLP Article 20(3) forbids and
    // `ghs/signal-word-precedence` reports. Without it the sample finds nothing.
    expect(committed.extraction.fields.signalWords?.value).toEqual(['Danger', 'Warning'])
  })
})
