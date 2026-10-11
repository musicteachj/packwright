import { afterEach, describe, expect, it } from 'vitest'
import { connectMcpTools, type McpTools } from './mcpTools'

let open: McpTools | undefined
afterEach(async () => {
  await open?.close()
  open = undefined
})

const connect = async () => (open = await connectMcpTools())

describe('the tools as the evaluation hands them to a model', () => {
  it('are the four the server lists, each with an object schema the API accepts', async () => {
    const { tools } = await connect()
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      ['check_gtin', 'check_label', 'ghs_statement_text', 'list_rules'].sort(),
    )
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy()
      expect(tool.input_schema.type, tool.name).toBe('object')
      expect(tool.input_schema, tool.name).not.toHaveProperty('oneOf')
    }
  })

  it('come with the server’s instructions', async () => {
    expect((await connect()).instructions).toContain('not a statement of compliance')
  })

  it('answer a call with the text a model reads', async () => {
    const answer = await (await connect()).call('check_gtin', { gtin: '036000291453' })
    expect(answer.isError).toBe(false)
    expect(JSON.parse(answer.text)).toMatchObject({ valid: false, expectedCheckDigit: 2 })
  })

  it('answer bad arguments and an unknown tool as errors the model is told of', async () => {
    const tools = await connect()
    expect((await tools.call('check_gtin', { gtin: '12' })).isError).toBe(true)
    expect((await tools.call('no_such_tool', {})).isError).toBe(true)
  })
})
