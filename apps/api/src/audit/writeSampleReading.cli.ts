/**
 * Writes the audit page's sample reading from the recorded reply.
 *
 * Run with `npm run write:sample-reading --workspace @packwright/api` whenever
 * `sampleReading.test.ts` says the committed reading has drifted. It makes **no
 * call**: it replays `recorded.json`, the one real reply on file, through the same
 * `extractGhsLabel` the route runs (`sampleReading.ts`), so the page shows what
 * this server would make of that reply today.
 *
 * The output lives in the web app because the mapping does not: `extract.ts`
 * imports the Anthropic SDK, which has no place in the browser bundle.
 */

import { writeFileSync } from 'node:fs'
import { format, resolveConfig } from 'prettier'
import { SAMPLE_READING_PATH, replaySampleReading } from './sampleReading'

const reading = await replaySampleReading()

// Formatted as the repository formats JSON, so `format:check` passes on what this writes.
const options = { ...(await resolveConfig(SAMPLE_READING_PATH)), filepath: SAMPLE_READING_PATH }
writeFileSync(SAMPLE_READING_PATH, await format(JSON.stringify(reading), options))
console.log(`Wrote ${SAMPLE_READING_PATH}`)
