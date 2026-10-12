/**
 * Stage 19: the same labels, the same question, with Packwright's tools and without.
 *
 * Run with `npm run experiment:mcp --workspace @packwright/api -- <mode>`.
 * **Never run by CI** — every mode but `--describe` makes real, billed calls.
 *
 *   --describe  free: lays out every case, checks the engine still raises each
 *               planted defect, and writes `cases.md` and `engine.json`
 *   --pilot     four calls: case 08 once, on each model, in each half
 *   --full      every case, three runs, both models, both halves
 *
 * And the re-check of 2026-10-12 (`docs/experiments/2026-10-12-mcp-recheck/`), which
 * asks whether stages 20–24 changed what models make of `check_label`'s answers. The
 * "with" half only — nothing the "without" half sees has changed — into its own
 * record, under its own cap, with `engine.json` recording what `check_label`
 * answers rather than the drawing:
 *
 *   --recheck-describe, --recheck-pilot, --recheck  as above, for that record
 *
 * **Both halves run afresh** (`docs/plans/2026-10-10-mcp.md`, stage 19). Since
 * 2026-10-09 the engine prints "Includes 0g Added Sugars", so today's food prompts
 * differ from the ones the "without" experiment sent, and pairing new "with"
 * answers with those would compare two different labels. This record sits beside
 * that one, which is left as it was graded.
 *
 * The "without" half is the experiment of 2026-10-09 exactly: one message, no
 * system prompt, no tools. The "with" half adds what an MCP client hands a model
 * — the four tools from `tools/list` and the server's instructions as the system
 * prompt — and runs the tool calls in-process (`mcpTools.ts`). Each response is
 * written the moment its conversation ends, and a resume skips every (half, case,
 * model, run) already recorded, as the first runner does.
 *
 * The key is read from `apps/api/.env` and handed to the client. It is never
 * printed, logged or written.
 */

import Anthropic from '@anthropic-ai/sdk'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotenv } from '../../dotenv'
import { CASES, type ExperimentCase } from '../withoutTool/cases'
import { describeCases } from '../withoutTool/describe'
import { runPool } from '../withoutTool/pool'
import {
  answeringChangedPrompts,
  finishedKeys,
  keyOf,
  parseRecorded,
  sha256,
  lostSpendIn,
  type Arm,
  type Recorded,
} from '../withoutTool/records'
import type { LabelSubject } from '@packwright/label-core'
import { ConversationFailed, converse } from './converse'
import { connectMcpTools, type McpTools } from './mcpTools'

/**
 * The two models of 2026-10-09, at their API defaults, for a like-for-like
 * comparison. Prices are USD per million tokens, from the claude-api reference
 * cached 2026-09-25, unchanged since the first run.
 */
const MODELS = [
  { id: 'claude-sonnet-5-5', inputPerMTok: 2, outputPerMTok: 10 },
  { id: 'claude-haiku-4-5', inputPerMTok: 1, outputPerMTok: 5 },
] as const

const RUNS = 3
const MAX_TOKENS = 16_000
/**
 * Requests before the conversation is cut off — so at most nine rounds of tool
 * results, the tenth request being the last chance to answer. A label needs one
 * `check_label`; a model that fixes a refused document and asks again, then
 * looks up a statement or two, is still well inside this.
 */
const MAX_ROUNDS = 10
const CONCURRENCY = 4
const EXPERIMENTS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../docs/experiments',
)

/** Which record a mode writes, and what it holds. */
interface Study {
  out: string
  arms: readonly Arm[]
  /** Stop starting conversations once recorded spend reaches this, in USD. */
  capUsd: number
  subject: LabelSubject
  /** The mode that writes this record's `cases.md`, as it names itself there. */
  describeMode: string
  /** What `cases.md` says was sent around each prompt. */
  sentWith: string
  /**
   * A record whose prompts this one must send unchanged, or not run. A re-check
   * compares answers to the same labels; a prompt that drifted would compare two.
   */
  samePromptsAs?: string
}

/** Stage 19's evaluation of 2026-10-10, under the plan's cap. */
const STAGE_19: Study = {
  out: join(EXPERIMENTS, '2026-10-10-mcp-with-and-without'),
  arms: ['without', 'with'],
  capUsd: 8,
  subject: 'drawing',
  describeMode: '--describe',
  sentWith:
    'Each prompt is the first message of its conversation. In the\n' +
    '"without" half it is the only message: no system prompt, no tools. In the "with" half the\n' +
    "request also carries the MCP server's instructions as the system prompt and its four tools,\n" +
    'as `tools/list` gives them; the conversation goes on through the tool calls.',
}

/** The re-check of 2026-10-12: the cap James approved, and the view its models saw. */
const RECHECK: Study = {
  out: join(EXPERIMENTS, '2026-10-12-mcp-recheck'),
  arms: ['with'],
  capUsd: 6,
  subject: 'described',
  describeMode: '--recheck-describe',
  // Only the "with" half runs here; saying a "without" half was sent misdescribed the
  // record. Found by review.
  sentWith:
    'Each prompt is the first message of its conversation, sent with the\n' +
    "MCP server's instructions as the system prompt and its four tools as `tools/list` gives\n" +
    'them; the conversation goes on through the tool calls. There is no "without" half here.',
  samePromptsAs: STAGE_19.out,
}

const MODES = {
  '--describe': { study: STAGE_19, run: 'describe' },
  '--pilot': { study: STAGE_19, run: 'pilot' },
  '--full': { study: STAGE_19, run: 'full' },
  '--recheck-describe': { study: RECHECK, run: 'describe' },
  '--recheck-pilot': { study: RECHECK, run: 'pilot' },
  '--recheck': { study: RECHECK, run: 'full' },
} as const

// Own keys only: `toString` is on every object, and fell through to a billed run of
// the stage 19 study instead of the usage message. Found by review.
const arg = process.argv[2] ?? ''
const chosen: (typeof MODES)[keyof typeof MODES] | undefined = Object.hasOwn(MODES, arg)
  ? MODES[arg as keyof typeof MODES]
  : undefined
const STUDY: Study = chosen?.study ?? STAGE_19
const OUT = STUDY.out
const RESPONSES = join(OUT, 'responses.jsonl')
/**
 * What conversations that failed partway cost, one line each. Kept apart from
 * the answers, which they are not, so that a resume still counts that money
 * against the cap: `responses.jsonl` never holds a failed conversation, and spend
 * rebuilt from it alone forgot every one.
 */
const LOST = join(OUT, 'lost-spend.jsonl')

const lostSoFar = (): number => (existsSync(LOST) ? lostSpendIn(readFileSync(LOST, 'utf8')) : 0)

type ModelSpec = (typeof MODELS)[number]

/** What a set of tokens cost on a model. */
function priced(model: ModelSpec, usage: { input_tokens: number; output_tokens: number }): number {
  return (
    (usage.input_tokens * model.inputPerMTok + usage.output_tokens * model.outputPerMTok) /
    1_000_000
  )
}

function costOf(record: Recorded): number {
  const spec = MODELS.find((model) => model.id === record.model)
  if (spec === undefined) throw new Error(`No price for ${record.model}`)
  return priced(spec, record.usage ?? record.response.usage)
}

function readRecorded(): Recorded[] {
  if (!existsSync(RESPONSES)) return []
  const text = readFileSync(RESPONSES, 'utf8')
  const { records, truncatedTail, intact } = parseRecorded(text)
  if (truncatedTail)
    console.error(
      `Removing an unfinished last line from ${RESPONSES}; its conversation will be held again.`,
    )
  if (intact !== text) writeFileSync(RESPONSES, intact)
  return records
}

async function hold(
  client: Anthropic,
  tools: McpTools,
  job: { item: ExperimentCase; model: ModelSpec; run: number; arm: Arm },
  prompt: string,
): Promise<Recorded> {
  const { item, model, run, arm } = job
  const conversation = await converse((params) => client.messages.create(params), {
    model: model.id,
    maxTokens: MAX_TOKENS,
    prompt,
    maxRounds: MAX_ROUNDS,
    ...(arm === 'with' ? { system: tools.instructions, tools } : {}),
  })
  const record: Recorded = {
    caseId: item.id,
    model: model.id,
    run,
    arm,
    recordedAt: new Date().toISOString(),
    promptSha256: sha256(prompt),
    response: conversation.final,
    usage: conversation.usage,
    ...(arm === 'with'
      ? { transcript: conversation.transcript, toolCalls: conversation.toolCalls }
      : {}),
    ...(conversation.turnLimitReached ? { turnLimitReached: true as const } : {}),
  }
  appendFileSync(RESPONSES, `${JSON.stringify(record)}\n`)
  return record
}

async function main(): Promise<void> {
  if (chosen === undefined) {
    console.error(`Usage: run.cli.ts ${Object.keys(MODES).join(' | ')}`)
    process.exit(1)
  }
  const mode = chosen.run

  const prompts = describeCases(
    OUT,
    new Set(readRecorded().map((record) => record.caseId)),
    STUDY.sentWith,
    STUDY.subject,
    `run.cli.ts ${STUDY.describeMode}`,
    STUDY.samePromptsAs,
  )
  console.log(`Described ${CASES.length} cases in ${OUT}`)
  if (STUDY.samePromptsAs !== undefined)
    console.log(`Every prompt is byte for byte the one ${STUDY.samePromptsAs} sent.`)
  if (mode === 'describe') return

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
        changed.map((r) => `  ${keyOf(r.caseId, r.model, r.run, r.arm)}`).join('\n') +
        `\nMove ${RESPONSES} aside to start again.`,
    )
    process.exit(1)
  }
  const done = finishedKeys(recorded)
  let spent = recorded.reduce((sum, r) => sum + costOf(r), 0) + lostSoFar()

  const pending: { item: ExperimentCase; model: ModelSpec; run: number; arm: Arm }[] = []
  const runs = mode === 'pilot' ? [1] : Array.from({ length: RUNS }, (_, i) => i + 1)
  const cases = mode === 'pilot' ? CASES.filter((c) => c.id.startsWith('08-')) : CASES
  for (const run of runs)
    for (const item of cases)
      for (const model of MODELS)
        for (const arm of STUDY.arms)
          if (!done.has(keyOf(item.id, model.id, run, arm))) pending.push({ item, model, run, arm })

  console.log(`${done.size} already recorded ($${spent.toFixed(4)}); ${pending.length} to hold`)

  const tools = await connectMcpTools()
  try {
    const { failed, notStarted } = await runPool(
      pending,
      async (job) => {
        let record: Recorded
        try {
          record = await hold(client, tools, job, prompts.get(job.item.id)!)
        } catch (error) {
          // Billed and not recorded: count it against the cap, and say what it cost.
          if (error instanceof ConversationFailed) {
            const lost = priced(job.model, error.usage)
            spent += lost
            appendFileSync(
              LOST,
              `${JSON.stringify({
                at: new Date().toISOString(),
                caseId: job.item.id,
                model: job.model.id,
                arm: job.arm,
                run: job.run,
                usage: error.usage,
                costUsd: lost,
              })}\n`,
            )
            console.error(
              `${job.item.id} ${job.model.id} ${job.arm} run ${job.run}: failed after ` +
                `$${lost.toFixed(4)} of rounds, which a resume will pay for again`,
            )
          }
          throw error
        }
        const cost = costOf(record)
        spent += cost
        const { input_tokens, output_tokens } = record.usage ?? record.response.usage
        console.log(
          `${job.item.id} ${job.model.id} ${job.arm} run ${job.run}: ` +
            `${record.response.stop_reason}${record.turnLimitReached ? ' (round limit)' : ''}, ` +
            `${record.toolCalls?.length ?? 0} tool calls, ` +
            `${input_tokens} in / ${output_tokens} out, $${cost.toFixed(4)} (total $${spent.toFixed(4)})`,
        )
      },
      { concurrency: CONCURRENCY, shouldStop: () => spent >= STUDY.capUsd },
    )

    for (const { job, error } of failed) {
      // The SDK's errors carry a status and a message, never the key.
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`${job.item.id} ${job.model.id} ${job.arm} run ${job.run} failed: ${reason}`)
    }
    if (notStarted.length > 0)
      console.error(
        `Stopped at the $${STUDY.capUsd} cap with ${notStarted.length} conversations not held.`,
      )
    console.log(`Recorded spend: $${spent.toFixed(4)}`)
    if (failed.length > 0) {
      console.error(
        `${failed.length} conversations failed and were not recorded; run again to retry only those.`,
      )
      process.exitCode = 1
    }
  } finally {
    await tools.close()
  }
}

await main()
