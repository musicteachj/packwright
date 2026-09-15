/**
 * Records the extraction fixture the suite replays.
 *
 * Run with `npm run record:extraction --workspace @packwright/api`. **Never run
 * by CI** — it makes one real, billed call. Everything else about extraction is
 * tested against what this writes.
 *
 * The fixture is recorded rather than written because a written one is the
 * implementation restated in JSON, and it would pass against code that had
 * stopped matching the API. `ghs/statements.ts` records at length what checking
 * an extract against itself cost the last time it was done here.
 *
 * It runs the whole of `extractGhsLabel` rather than only the request, so a
 * response the mapping cannot handle fails here, loudly, at the moment it is
 * recorded — rather than being committed and then explained.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotenv } from '../dotenv'
import { extractGhsLabel, sendThrough, visionClient, type SendMessage } from './extract'

loadDotenv()

const fixtures = dirname(fileURLToPath(import.meta.url)) + '/fixtures'
const photo = {
  mediaType: 'image/png',
  data: readFileSync(join(fixtures, 'sampleLabel.png')).toString('base64'),
} as const

const apiKey = process.env.ANTHROPIC_API_KEY
if (apiKey === undefined || apiKey === '') {
  console.error('ANTHROPIC_API_KEY is not set. Put it in apps/api/.env — never in .env.example.')
  process.exit(1)
}

let captured: Anthropic.Message | undefined
const live = sendThrough(visionClient(apiKey))
const recordedPath = join(fixtures, 'recorded.json')

const capturing: SendMessage = async (params) => {
  const message = await live(params)
  captured = message
  // Written here, before the mapping runs, because the call has already been
  // paid for. Writing it afterwards threw the response away on exactly the
  // failures worth keeping: a reply the mapping cannot handle is the one most
  // worth looking at, and re-recording it costs another call and may not
  // reproduce.
  writeFileSync(recordedPath, `${JSON.stringify(message, null, 2)}\n`)
  return message
}

const result = await extractGhsLabel(capturing, photo, 'eu-clp')

console.log(`Wrote ${recordedPath}`)

console.log(`stop_reason: ${captured?.stop_reason}`)
console.log(`content blocks: ${captured?.content.map((block) => block.type).join(', ')}`)
console.log(
  `usage: ${JSON.stringify(captured?.usage.input_tokens)} in, ${JSON.stringify(captured?.usage.output_tokens)} out`,
)
console.log('\nMapped to:')
console.log(JSON.stringify(result, null, 2))
