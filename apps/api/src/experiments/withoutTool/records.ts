/**
 * What `responses.jsonl` holds, and how a resume decides what is already done.
 *
 * Kept apart from `run.cli.ts` so the decisions can be tested: the CLI makes
 * billed calls at import, and every rule here exists because getting it wrong
 * costs money or corrupts the record. All three were found by review on
 * 2026-10-09, after the experiment's 72 calls had been made.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'

export interface Recorded {
  caseId: string
  model: string
  run: number
  recordedAt: string
  /**
   * SHA-256 of the prompt as sent, so a resume can refuse to mix answers to two
   * versions of a case. Absent on the 72 records of 2026-10-09, which predate it;
   * the README says what stands in for it there.
   */
  promptSha256?: string
  response: Anthropic.Message
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export const keyOf = (caseId: string, model: string, run: number) => `${caseId}|${model}|${run}`

/**
 * Parses the file. A last line that does not parse is the trace of a process
 * killed mid-append: it is skipped, and reported through `truncatedTail`, rather
 * than blocking every later resume. One that is not last is damage, and throws.
 *
 * `intact` is the file without that fragment, ending in a line break — also
 * when every line is whole but the last lacks one, as a hand edit can leave it.
 * The caller writes it back whenever it differs, before appending: otherwise the
 * next record is joined onto that last line, which is then unreadable and no
 * longer last, and stops every resume after it.
 */
export function parseRecorded(text: string): {
  records: Recorded[]
  truncatedTail: boolean
  intact: string
} {
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  let truncatedTail = false
  const records = lines.flatMap((line, index) => {
    try {
      return [JSON.parse(line) as Recorded]
    } catch (error) {
      if (index < lines.length - 1) throw error
      truncatedTail = true
      return []
    }
  })
  const kept = truncatedTail ? text.slice(0, text.trimEnd().lastIndexOf('\n') + 1) : text
  const intact = kept === '' || kept.endsWith('\n') ? kept : `${kept}\n`
  return { records, truncatedTail, intact }
}

/**
 * The keys a resume may skip. Only a finished answer counts: a reply cut off at
 * `max_tokens`, or a refusal, stays in the file — it was paid for — but its call
 * is made again, and the later record supersedes it.
 */
export function finishedKeys(records: readonly Recorded[]): Set<string> {
  return new Set(
    records
      .filter((record) => record.response.stop_reason === 'end_turn')
      .map((record) => keyOf(record.caseId, record.model, record.run)),
  )
}

/**
 * The prompts a `cases.md` written by `run.cli.ts` holds, by case id.
 *
 * It reads only the format that file writes — a `## <id>` heading, then the
 * prompt in a text fence — and is the check that works for records with no hash:
 * the 72 of 2026-10-09 answered exactly the prompts their `cases.md` shows, so a
 * case whose prompt no longer matches it may not be rewritten over them.
 */
export function promptsInCasesMd(markdown: string): Map<string, string> {
  const prompts = new Map<string, string>()
  for (const match of markdown.matchAll(/^## (\S+)\n[\s\S]*?^```text\n([\s\S]*?)\n```$/gm)) {
    prompts.set(match[1]!, match[2]!)
  }
  return prompts
}

/**
 * Answered case ids whose prompt in `cases.md` differs from, or is missing in,
 * the prompts now generated. Only answered cases: a case nobody has been asked
 * yet is free to change, which is the point of piloting one first.
 */
export function promptsThatChanged(
  recorded: ReadonlyMap<string, string>,
  now: ReadonlyMap<string, string>,
  answered: ReadonlySet<string>,
): string[] {
  return [...recorded]
    .filter(([id, prompt]) => answered.has(id) && now.get(id) !== prompt)
    .map(([id]) => id)
}

/** Records that answer a prompt other than the one this case now produces. */
export function answeringChangedPrompts(
  records: readonly Recorded[],
  promptFor: (caseId: string) => string | undefined,
): Recorded[] {
  return records.filter((record) => {
    if (record.promptSha256 === undefined) return false
    const prompt = promptFor(record.caseId)
    return prompt === undefined || record.promptSha256 !== sha256(prompt)
  })
}
