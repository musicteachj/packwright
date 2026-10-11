/**
 * One question to a model, carried through as many tool rounds as it takes.
 *
 * A manual loop rather than the SDK's tool runner, because every round is part
 * of the record: what the model sent each tool and what it got back is the
 * evidence of how it used them. The history is only ever appended to, and each
 * assistant turn goes back exactly as it arrived — thinking blocks included,
 * which Claude Sonnet 5.5 binds to the conversation that produced them.
 *
 * No refusal fallback is set: it would let a different model answer, and the
 * evaluation measures the model named.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { ToolCallRecord } from '../withoutTool/records'

/** The one API call the loop makes, injected so a test can stand in for the API. */
export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>

export interface ToolRunner {
  tools: Anthropic.Tool[]
  call(name: string, input: unknown): Promise<{ text: string; isError: boolean }>
}

export interface Conversation {
  /** The last message, whose text is the answer. */
  final: Anthropic.Message
  /** Every message after the prompt. */
  transcript: Anthropic.MessageParam[]
  usage: { input_tokens: number; output_tokens: number }
  toolCalls: ToolCallRecord[]
  /** True when the model was still calling tools when the rounds ran out. */
  turnLimitReached: boolean
}

/**
 * A conversation that failed partway, carrying what its finished rounds cost.
 *
 * The rounds before the failure were billed, and the record that would have
 * counted them is never written. Without this the runner's cap saw none of it,
 * and a resume pays for the whole conversation again, so real spend could pass
 * the cap while the runner reported less.
 */
export class ConversationFailed extends Error {
  constructor(
    readonly usage: { input_tokens: number; output_tokens: number },
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'ConversationFailed'
  }
}

export async function converse(
  create: CreateMessage,
  request: {
    model: string
    maxTokens: number
    prompt: string
    system?: string | undefined
    tools?: ToolRunner | undefined
    maxRounds: number
  },
): Promise<Conversation> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: request.prompt }]
  const usage = { input_tokens: 0, output_tokens: 0 }
  const toolCalls: ToolCallRecord[] = []

  for (let round = 0; ; round++) {
    let response: Anthropic.Message
    try {
      response = await create({
        model: request.model,
        max_tokens: request.maxTokens,
        messages,
        ...(request.system === undefined ? {} : { system: request.system }),
        ...(request.tools === undefined ? {} : { tools: request.tools.tools }),
      })
    } catch (error) {
      throw new ConversationFailed({ ...usage }, error)
    }
    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens

    const uses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    const wantsTools =
      response.stop_reason === 'tool_use' && uses.length > 0 && request.tools !== undefined
    if (!wantsTools || round + 1 >= request.maxRounds) {
      messages.push({ role: 'assistant', content: response.content })
      return {
        final: response,
        transcript: messages.slice(1),
        usage,
        toolCalls,
        turnLimitReached: wantsTools,
      }
    }

    messages.push({ role: 'assistant', content: response.content })
    // Every result in one message, in the order asked: splitting them teaches the
    // model to stop calling in parallel.
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of uses) {
      const { text, isError } = await request.tools!.call(use.name, use.input)
      toolCalls.push({ name: use.name, input: use.input, isError, result: text })
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: text,
        ...(isError ? { is_error: true } : {}),
      })
    }
    messages.push({ role: 'user', content: results })
  }
}
