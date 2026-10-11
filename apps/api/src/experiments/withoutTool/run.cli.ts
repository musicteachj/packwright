/**
 * The MCP "without" experiment: fixture labels given to a model with no tool.
 *
 * Run with `npm run experiment:without --workspace @packwright/api -- <mode>`.
 * **Never run by CI** — every mode but `--describe` makes real, billed calls.
 *
 *   --describe  free: lays out every case, checks the engine still raises each
 *               planted defect, and writes `cases.md` and `engine.json`
 *   --pilot     two calls: case 08 once on each model
 *   --full      every case, three runs, both models
 *
 * Shaped like `audit/recordFixture.cli.ts`, for the same reason: each response
 * is written to disk the moment it arrives, because it has already been paid
 * for. A run that stops part-way resumes, skipping every (case, model, run)
 * already recorded, so no recorded answer is paid for again. (The SDK's own
 * retry after a timeout may still be billed by the server; that is not visible
 * from here.)
 *
 * The key is read from `apps/api/.env` and handed to the client. It is never
 * printed, logged or written; what is written is the response.
 */

import Anthropic from '@anthropic-ai/sdk'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotenv } from '../../dotenv'
import { CASES, type ExperimentCase } from './cases'
import { runPool } from './pool'
import {
  answeringChangedPrompts,
  finishedKeys,
  keyOf,
  parseRecorded,
  sha256,
  type Recorded,
} from './records'
import { describeCases } from './describe'

/**
 * The two models, at their API defaults. Sonnet 5.5 runs adaptive thinking at
 * effort `high` when neither is set; Haiku 4.5 runs without thinking. Prices are
 * USD per million tokens, from the claude-api reference cached 2026-09-25.
 */
const MODELS = [
  { id: 'claude-sonnet-5-5', inputPerMTok: 2, outputPerMTok: 10 },
  { id: 'claude-haiku-4-5', inputPerMTok: 1, outputPerMTok: 5 },
] as const

const RUNS = 3
const MAX_TOKENS = 16_000
/** Calls in flight at once. The cap is checked before each call starts, so it can be overshot by this many. */
const CONCURRENCY = 4
/** Stop starting calls once recorded spend reaches this, in USD. */
const SPEND_CAP_USD = 6

const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/experiments/2026-10-09-mcp-without',
)
const RESPONSES = join(OUT, 'responses.jsonl')

type ModelSpec = (typeof MODELS)[number]

function costOf(record: Recorded): number {
  const spec = MODELS.find((model) => model.id === record.model)
  if (spec === undefined) throw new Error(`No price for ${record.model}`)
  const { input_tokens, output_tokens } = record.response.usage
  return (input_tokens * spec.inputPerMTok + output_tokens * spec.outputPerMTok) / 1_000_000
}

function readRecorded(): Recorded[] {
  if (!existsSync(RESPONSES)) return []
  const text = readFileSync(RESPONSES, 'utf8')
  const { records, truncatedTail, intact } = parseRecorded(text)
  if (truncatedTail)
    console.error(
      `Removing an unfinished last line from ${RESPONSES}; its call will be made again.`,
    )
  if (intact !== text) writeFileSync(RESPONSES, intact)
  return records
}

/** Lays out every case into this experiment's record. See `describe.ts`. */
const describe = (): Map<string, string> =>
  describeCases(
    OUT,
    new Set(readRecorded().map((record) => record.caseId)),
    'Each prompt is the only message in its request:\nno system prompt, no tools.',
  )

async function call(
  client: Anthropic,
  model: ModelSpec,
  item: ExperimentCase,
  run: number,
  prompt: string,
): Promise<Recorded> {
  const response = await client.messages.create({
    model: model.id,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  })
  const record: Recorded = {
    caseId: item.id,
    model: model.id,
    run,
    recordedAt: new Date().toISOString(),
    promptSha256: sha256(prompt),
    response,
  }
  appendFileSync(RESPONSES, `${JSON.stringify(record)}\n`)
  return record
}

async function main(): Promise<void> {
  const mode = process.argv[2]
  if (mode !== '--describe' && mode !== '--pilot' && mode !== '--full') {
    console.error('Usage: run.cli.ts --describe | --pilot | --full')
    process.exit(1)
  }

  const prompts = describe()
  console.log(`Described ${CASES.length} cases in ${OUT}`)
  if (mode === '--describe') return

  loadDotenv()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey === undefined || apiKey === '') {
    console.error('ANTHROPIC_API_KEY is not set. Put it in apps/api/.env — never in .env.example.')
    process.exit(1)
  }
  const client = new Anthropic({ apiKey, timeout: 600_000, maxRetries: 2 })

  const recorded = readRecorded()
  const changed = answeringChangedPrompts(recorded, (caseId) => prompts.get(caseId))
  if (changed.length > 0) {
    console.error(
      'These records answer a prompt that has since changed, and a resume would mix two versions of a case:\n' +
        changed.map((r) => `  ${keyOf(r.caseId, r.model, r.run)}`).join('\n') +
        '\nMove responses.jsonl aside to start again.',
    )
    process.exit(1)
  }
  const done = finishedKeys(recorded)
  let spent = recorded.reduce((sum, r) => sum + costOf(r), 0)

  const pending: { item: ExperimentCase; model: ModelSpec; run: number }[] = []
  const runs = mode === '--pilot' ? [1] : Array.from({ length: RUNS }, (_, i) => i + 1)
  const cases = mode === '--pilot' ? CASES.filter((c) => c.id.startsWith('08-')) : CASES
  for (const run of runs)
    for (const item of cases)
      for (const model of MODELS)
        if (!done.has(keyOf(item.id, model.id, run))) pending.push({ item, model, run })

  console.log(`${done.size} already recorded ($${spent.toFixed(4)}); ${pending.length} to call`)

  const { failed, notStarted } = await runPool(
    pending,
    async ({ item, model, run }) => {
      const record = await call(client, model, item, run, prompts.get(item.id)!)
      const cost = costOf(record)
      spent += cost
      const { input_tokens, output_tokens } = record.response.usage
      console.log(
        `${item.id} ${model.id} run ${run}: ${record.response.stop_reason}, ` +
          `${input_tokens} in / ${output_tokens} out, $${cost.toFixed(4)} (total $${spent.toFixed(4)})`,
      )
    },
    { concurrency: CONCURRENCY, shouldStop: () => spent >= SPEND_CAP_USD },
  )

  for (const { job, error } of failed) {
    // The SDK's errors carry a status and a message, never the key.
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`${job.item.id} ${job.model.id} run ${job.run} failed: ${reason}`)
  }
  if (notStarted.length > 0)
    console.error(`Stopped at the $${SPEND_CAP_USD} cap with ${notStarted.length} calls not made.`)
  console.log(`Recorded spend: $${spent.toFixed(4)}`)
  if (failed.length > 0) {
    console.error(
      `${failed.length} calls failed and were not recorded; run again to retry only those.`,
    )
    process.exitCode = 1
  }
}

await main()
