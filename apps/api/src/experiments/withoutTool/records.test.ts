import { describe, expect, it } from 'vitest'
import {
  answeringChangedPrompts,
  finishedKeys,
  parseRecorded,
  promptsInCasesMd,
  promptsThatChanged,
  sha256,
  type Recorded,
} from './records'

const record = (overrides: Partial<Recorded> & { stop_reason?: string } = {}): Recorded => {
  const { stop_reason = 'end_turn', ...rest } = overrides
  return {
    caseId: '08-fda-ingredient-order',
    model: 'claude-haiku-4-5',
    run: 1,
    recordedAt: '2026-10-09T00:00:00.000Z',
    response: { stop_reason } as Recorded['response'],
    ...rest,
  }
}

describe('parseRecorded', () => {
  it('skips a last line cut off mid-append, and says so', () => {
    const first = JSON.stringify(record())
    const { records, truncatedTail, intact } = parseRecorded(`${first}\n{"caseId":"08-fda-ingre`)
    expect(records).toHaveLength(1)
    expect(truncatedTail).toBe(true)
    // What gets written back before the next append: without the fragment, so
    // the next record starts on a line of its own.
    expect(intact).toBe(`${first}\n`)
  })

  it('ends the kept file in a line break when the last whole line lacks one', () => {
    const first = JSON.stringify(record())
    const { truncatedTail, intact } = parseRecorded(first)
    expect(truncatedTail).toBe(false)
    expect(intact).toBe(`${first}\n`)
  })

  it('throws on a damaged line that is not the last', () => {
    expect(() => parseRecorded(`{"caseId":\n${JSON.stringify(record())}`)).toThrow()
  })
})

describe('finishedKeys', () => {
  it('counts only a finished answer as done, so a truncated one is called again', () => {
    const keys = finishedKeys([record({ run: 1 }), record({ run: 2, stop_reason: 'max_tokens' })])
    expect([...keys]).toEqual(['08-fda-ingredient-order|claude-haiku-4-5|1'])
  })
})

describe('answeringChangedPrompts', () => {
  it('finds a record whose prompt has since changed, and passes one that has not or predates the hash', () => {
    const now = 'the prompt as it is now'
    const changed = record({ run: 1, promptSha256: sha256('the prompt as it was') })
    const same = record({ run: 2, promptSha256: sha256(now) })
    const legacy = record({ run: 3 })
    expect(answeringChangedPrompts([changed, same, legacy], () => now)).toEqual([changed])
  })
})

describe('promptsInCasesMd and promptsThatChanged', () => {
  const casesMd = [
    '# The prompts, exactly as sent',
    '',
    '## 01-a',
    '',
    'Note: anything at all.',
    '',
    '```text',
    'first prompt',
    'over two lines',
    '```',
    '',
    '## C1-b',
    '',
    '```text',
    'second prompt',
    '```',
    '',
  ].join('\n')

  it('reads back every prompt the file holds, by case id', () => {
    expect([...promptsInCasesMd(casesMd)]).toEqual([
      ['01-a', 'first prompt\nover two lines'],
      ['C1-b', 'second prompt'],
    ])
  })

  it('names an answered case whose prompt would change, and passes one that would not', () => {
    const recorded = promptsInCasesMd(casesMd)
    const now = new Map([
      ['01-a', 'first prompt\nover two lines'],
      ['C1-b', 'second prompt, edited'],
    ])
    expect(promptsThatChanged(recorded, now, new Set(['01-a', 'C1-b']))).toEqual(['C1-b'])
  })

  it('lets a case nobody has answered yet change freely', () => {
    const recorded = promptsInCasesMd(casesMd)
    const now = new Map([
      ['01-a', 'first prompt, edited after a pilot of C1-b'],
      ['C1-b', 'second prompt'],
    ])
    expect(promptsThatChanged(recorded, now, new Set(['C1-b']))).toEqual([])
  })
})
