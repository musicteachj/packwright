/**
 * The audit page's sample reading, made the one way both its writer and its test make it.
 *
 * `writeSampleReading.cli.ts` writes what this returns into the web app, and
 * `sampleReading.test.ts` holds the committed copy to it, so the two cannot replay
 * different inputs. Nothing that ships imports this: the page reads the copy.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractGhsLabel, type LabelReading } from './extract'
import { recorded } from './fixtures/responses'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '../../../web')

/** The photograph `recorded.json` was recorded against. */
export const SAMPLE_PHOTO_PATH = join(here, 'fixtures/sampleLabel.png')
/** Its copy, served by the web app. */
export const SERVED_SAMPLE_PHOTO_PATH = join(web, 'public/samples/acetone-label.png')
/** The reading the audit page shows beside it. */
export const SAMPLE_READING_PATH = join(web, 'src/audit/sampleReading.json')

/**
 * What this server makes of the recorded reply today, under the market it was
 * recorded under. It makes no call: the reply is replayed, and the photograph is
 * handed over only because `extractGhsLabel` takes one.
 */
export function replaySampleReading(): Promise<LabelReading> {
  const photo = {
    mediaType: 'image/png',
    data: readFileSync(SAMPLE_PHOTO_PATH).toString('base64'),
  } as const
  const replay = async (): Promise<Anthropic.Message> => recorded
  return extractGhsLabel(replay, photo, 'eu-clp')
}
