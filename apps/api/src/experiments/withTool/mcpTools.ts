/**
 * Packwright's four tools as a model is handed them: through the MCP server.
 *
 * The evaluation's "with" half runs before there is any public address, so the
 * tools are served in-process — the SDK's own client against the same
 * `createMcpHandler` the `/mcp` route mounts, as `mcp/server.test.ts` does. What
 * reaches the model is what an MCP client passes on: each tool's name,
 * description and input schema from `tools/list`, the server's instructions,
 * and each call's text answer. The client speaks the older, `initialize`-era
 * protocol, because Claude's clients do.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createPackwrightMcpServer } from '../../mcp/server'

export interface McpTools {
  /** The tools as the Messages API takes them. */
  tools: Anthropic.Tool[]
  /** The server's `instructions`, which a Claude client puts in front of the model. */
  instructions: string | undefined
  /** Calls a tool and answers with the text the model is given, and whether it is an error. */
  call(name: string, input: unknown): Promise<{ text: string; isError: boolean }>
  close(): Promise<void>
}

export async function connectMcpTools(): Promise<McpTools> {
  const handler = createMcpHandler(createPackwrightMcpServer)
  const transport = new StreamableHTTPClientTransport(new URL('http://packwright.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  })
  const client = new Client({ name: 'packwright-eval', version: '1.0.0' })
  await client.connect(transport)

  const listed = await client.listTools()
  const tools: Anthropic.Tool[] = listed.tools.map((tool) => ({
    name: tool.name,
    ...(tool.description === undefined ? {} : { description: tool.description }),
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }))

  return {
    tools,
    instructions: client.getInstructions(),
    async call(name, input) {
      try {
        const result = await client.callTool({
          name,
          arguments: (input ?? {}) as Record<string, unknown>,
        })
        const text = (result.content as Array<{ type: string; text?: string }>)
          .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
          .join('')
        return { text, isError: result.isError === true }
      } catch (error) {
        // A protocol error rather than a tool's own answer — an unknown tool name,
        // say. The model is told, as a client would tell it, rather than the
        // conversation ending.
        return { text: error instanceof Error ? error.message : String(error), isError: true }
      }
    },
    async close() {
      await client.close()
      await handler.close()
    },
  }
}
