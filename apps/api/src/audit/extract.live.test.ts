/**
 * The one test that calls the real API.
 *
 * **Skipped unless `PACKWRIGHT_LIVE_EXTRACTION` is set, as well as a key.** The
 * key alone is deliberately not enough. `ANTHROPIC_API_KEY` is a variable people
 * export into a shell profile and leave there, so gating on it would mean a
 * plain `npm test` quietly making a paid call for anyone set up that way. It
 * also does not read `apps/api/.env`, which configures the server for
 * `npm run dev` and would bill every run for everyone with a working
 * development setup. Two ways to spend somebody's money without their saying
 * so, both closed: running a billed test is an explicit act and has to look
 * like one.
 *
 *     PACKWRIGHT_LIVE_EXTRACTION=1 npx vitest run src/audit/extract.live.test.ts
 *
 * It asserts the plumbing and **nothing about accuracy**. Whether the model read
 * the label correctly is a different question, it needs a labelled dataset to
 * answer, and `docs/DESIGN.md` files it under the eval harness that is
 * deliberately deferred. What this catches is the API changing shape underneath
 * the recorded fixture — which the fixture, by its nature, cannot.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  extractGhsLabel,
  sendThrough,
  visionClient,
  VISION_MAX_RETRIES,
  VISION_TIMEOUT_MS,
} from './extract'

const apiKey = process.env.ANTHROPIC_API_KEY
const optedIn = process.env.PACKWRIGHT_LIVE_EXTRACTION

const wanted = (value: string | undefined) => value !== undefined && value !== ''

describe.skipIf(!wanted(apiKey) || !wanted(optedIn))('against the real API', () => {
  it(
    'reads the sample label into an extraction the contract accepts',
    // Derived, not typed in. A flat 120 s was exactly one attempt of a client
    // configured for one retry, so the retry this test exists to exercise could
    // never finish inside it — the test would fail on its own budget and report
    // it as the API being slow.
    { timeout: VISION_TIMEOUT_MS * (VISION_MAX_RETRIES + 1) + 30_000 },
    async () => {
      const photo = {
        mediaType: 'image/png',
        data: readFileSync(
          join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sampleLabel.png'),
        ).toString('base64'),
      } as const

      // Through `visionClient`, so the timeout and retry cap this server actually
      // ships are the ones exercised — a bare client here would leave the one
      // configuration that only matters in production untested in the one test
      // that reaches production.
      const { extraction } = await extractGhsLabel(
        sendThrough(visionClient(apiKey!)),
        photo,
        'eu-clp',
      )

      // Deliberately weak assertions. A strong one here would fail on a rewording
      // rather than on a breakage, and this test exists to notice the API moving,
      // not to grade the model.
      expect(Object.keys(extraction.fields).length).toBeGreaterThan(0)
      for (const field of Object.values(extraction.fields)) {
        expect(field?.confidence).toBeGreaterThanOrEqual(0)
        expect(field?.confidence).toBeLessThanOrEqual(1)
      }
    },
  )
})
