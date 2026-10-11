import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { ConversationFailed, converse, type CreateMessage, type ToolRunner } from './converse'

/** A message as the API would send it, with only what the loop reads. */
const message = (
  stop_reason: Anthropic.Message['stop_reason'],
  content: unknown[],
  tokens = { input_tokens: 10, output_tokens: 5 },
): Anthropic.Message => ({ stop_reason, content, usage: tokens }) as unknown as Anthropic.Message

/** Replies in order, and keeps every request it was sent. */
function scripted(...replies: Anthropic.Message[]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = []
  const create: CreateMessage = async (params) => {
    // A copy, because the loop goes on appending to the array it sent.
    sent.push({ ...params, messages: [...params.messages] })
    const reply = replies.shift()
    if (reply === undefined) throw new Error('more calls than scripted')
    return reply
  }
  return { create, sent }
}

const thinking = { type: 'thinking', thinking: '', signature: 'sig-1' }
const useGtin = {
  type: 'tool_use',
  id: 'tu_1',
  name: 'check_gtin',
  input: { gtin: '036000291452' },
}
const useRules = { type: 'tool_use', id: 'tu_2', name: 'list_rules', input: {} }
const answer = { type: 'text', text: 'The label is fine.' }

function runner(): ToolRunner & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    tools: [{ name: 'check_gtin', input_schema: { type: 'object' } }],
    async call(name) {
      calls.push(name)
      return name === 'list_rules'
        ? { text: 'no such tool', isError: true }
        : { text: '{"valid":true}', isError: false }
    },
  }
}

const base = { model: 'claude-sonnet-5-5', maxTokens: 16_000, prompt: 'Is this label right?' }

describe('converse', () => {
  it('asks once when there are no tools, as the without half did', async () => {
    const { create, sent } = scripted(message('end_turn', [answer]))
    const result = await converse(create, { ...base, maxRounds: 10 })
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toHaveProperty('tools')
    expect(sent[0]).not.toHaveProperty('system')
    expect(result.final.content).toEqual([answer])
    expect(result.toolCalls).toEqual([])
  })

  it('runs every tool asked for and answers them together, errors included', async () => {
    const tools = runner()
    const { create, sent } = scripted(
      message('tool_use', [thinking, useGtin, useRules]),
      message('end_turn', [answer]),
    )
    const result = await converse(create, { ...base, tools, system: 'instructions', maxRounds: 10 })

    expect(tools.calls).toEqual(['check_gtin', 'list_rules'])
    expect(sent[1]!.system).toBe('instructions')
    expect(sent[1]!.tools).toBe(tools.tools)
    // The assistant turn goes back exactly as it came, thinking block and all.
    expect(sent[1]!.messages[1]).toEqual({
      role: 'assistant',
      content: [thinking, useGtin, useRules],
    })
    expect(sent[1]!.messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: '{"valid":true}' },
        { type: 'tool_result', tool_use_id: 'tu_2', content: 'no such tool', is_error: true },
      ],
    })
    expect(result.toolCalls).toEqual([
      { name: 'check_gtin', input: useGtin.input, isError: false, result: '{"valid":true}' },
      { name: 'list_rules', input: {}, isError: true, result: 'no such tool' },
    ])
    expect(result.usage).toEqual({ input_tokens: 20, output_tokens: 10 })
    expect(result.turnLimitReached).toBe(false)
    expect(result.transcript).toHaveLength(3)
  })

  it('stops at the round limit and says so, without running the last calls', async () => {
    const tools = runner()
    const { create, sent } = scripted(
      message('tool_use', [useGtin]),
      message('tool_use', [useGtin]),
    )
    const result = await converse(create, { ...base, tools, maxRounds: 2 })
    expect(sent).toHaveLength(2)
    expect(tools.calls).toEqual(['check_gtin'])
    expect(result.turnLimitReached).toBe(true)
  })

  it('carries the cost of the rounds already paid for when a later one fails', async () => {
    // The record is never written, so without this the runner's cap never sees
    // what those rounds cost.
    const tools = runner()
    let calls = 0
    const create: CreateMessage = async () => {
      calls++
      if (calls === 1)
        return message('tool_use', [useGtin], { input_tokens: 100, output_tokens: 40 })
      throw new Error('overloaded')
    }
    const failure = await converse(create, { ...base, tools, maxRounds: 10 }).catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ConversationFailed)
    expect((failure as ConversationFailed).usage).toEqual({ input_tokens: 100, output_tokens: 40 })
    expect((failure as ConversationFailed).message).toBe('overloaded')
  })

  it('treats a refusal as the end of the conversation', async () => {
    const tools = runner()
    const { create } = scripted(message('refusal', []))
    const result = await converse(create, { ...base, tools, maxRounds: 10 })
    expect(result.final.stop_reason).toBe('refusal')
    expect(result.turnLimitReached).toBe(false)
  })
})
