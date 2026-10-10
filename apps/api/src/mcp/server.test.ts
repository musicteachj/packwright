/**
 * The MCP server, driven through the SDK's own client, in-process.
 *
 * `handler.fetch` serves each request through the same `createMcpHandler` the
 * route mounts, so these are the answers a real client gets — in both protocol
 * eras, because Claude's connector client still speaks the older one.
 *
 * The fixtures are `label-core`'s own, reached by path: they are test data, and
 * the package does not export them. Every document the judge's own test compares
 * is sent here too, so the server is held to the judge on all of them rather than
 * on a sample.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import {
  EU_CLP_HAZARD_STATEMENTS,
  EU_CLP_PRECAUTIONARY_STATEMENTS,
  SEVERITY_ORDER,
  judgeLabel,
  type JudgeRequest,
  type LabelStock,
  type Severity,
} from '@packwright/label-core'
import { LabelCheckRequest } from '@packwright/label-core/schema'
import * as bwip from 'bwip-js/generic'
import supertest from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONFORMANT_FIXTURE,
  GS1_RETAIL_FIXTURES,
} from '../../../../packages/label-core/src/rules/fixtures/gs1Retail'
import {
  GHS_CONFORMANT,
  GHS_FIXTURES,
} from '../../../../packages/label-core/src/rules/fixtures/ghs'
import { PERMISSION_PATHS } from '../../../../packages/label-core/src/rules/fixtures/sweep'
import {
  US_FOOD_CONFORMANT,
  US_FOOD_FIXTURES,
  US_FOOD_SMALL_PANEL,
} from '../../../../packages/label-core/src/rules/fixtures/usFood'
import { createApp } from '../app'
import {
  MAX_TOOL_INPUT_ELEMENTS,
  NOT_A_STATEMENT_OF_COMPLIANCE,
  WHAT_IS_NOT_CHECKED_URL,
  checkLabelOutput,
  createPackwrightMcpServer,
} from './server'

type Era = 'legacy' | 'modern'

const open: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of open.splice(0)) await close()
})

/** A client connected to a fresh handler, in the era asked for. */
async function connect(era: Era = 'modern'): Promise<Client> {
  const handler = createMcpHandler(createPackwrightMcpServer)
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  })
  // The default handshake is the 2025 `initialize`; a pin is the 2026 one or nothing.
  const client = new Client(
    { name: 'packwright-test', version: '1.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  )
  await client.connect(transport)
  open.push(async () => {
    await client.close()
    await handler.close()
  })
  return client
}

const textOf = (result: { content?: unknown }): string =>
  (result.content as Array<{ type: string; text?: string }>)
    .map((block) => block.text ?? '')
    .join('')

const CONFORMANT_FOOD = {
  labelType: 'us-food',
  data: US_FOOD_CONFORMANT.data,
  stock: US_FOOD_CONFORMANT.stock,
}

describe.each(['legacy', 'modern'] as const)('in the %s protocol era', (era) => {
  it('offers the four tools, each titled, read-only and closed-world', async () => {
    const { tools } = await (await connect(era)).listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      ['check_gtin', 'check_label', 'ghs_statement_text', 'list_rules'].sort(),
    )
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy()
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: true,
        openWorldHint: false,
      })
      expect(tool.outputSchema, tool.name).toBeDefined()
    }
  })

  it('advertises every input as one object, which Anthropic’s API accepts', async () => {
    // A union at the top of an input schema is written `oneOf`, and Anthropic's
    // API refuses it: Claude Code drops the tool with "its input schema uses
    // top-level oneOf, which the Anthropic API does not accept". `check_label`
    // was dropped that way on 2026-10-10, found only by connecting Claude Code —
    // the SDK and Inspector's --strict both passed it.
    const { tools } = await (await connect(era)).listTools()
    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe('object')
      for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
        expect(tool.inputSchema, `${tool.name} ${keyword}`).not.toHaveProperty(keyword)
      }
    }
    const checkLabel = tools.find((tool) => tool.name === 'check_label')!
    expect(Object.keys(checkLabel.inputSchema.properties ?? {}).sort()).toEqual([
      'data',
      'labelType',
      'stock',
    ])
  })

  it('answers check_label with the judge’s verdict, in both forms', async () => {
    const result = await (
      await connect(era)
    ).callTool({
      name: 'check_label',
      arguments: CONFORMANT_FOOD,
    })
    const expected = checkLabelOutput(
      'us-food',
      judgeLabel({
        labelType: 'us-food',
        data: US_FOOD_CONFORMANT.data,
        stock: US_FOOD_CONFORMANT.stock,
      }),
    )
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toEqual(expected)
    // A client that reads only text must be told everything one reading the
    // structure is, the notice included.
    expect(JSON.parse(textOf(result))).toEqual(expected)
  })
})

/** Every document `judge.test.ts` compares, as the JSON a client would send. */
const documents: Array<{ name: string; labelType: string; data: unknown; stock: LabelStock }> = [
  ...[...GS1_RETAIL_FIXTURES, { name: 'conformant', ...CONFORMANT_FIXTURE }].map((fixture) => ({
    name: `gs1: ${fixture.name}`,
    labelType: 'gs1-retail',
    data: fixture.data,
    stock: fixture.stock,
  })),
  ...[...GHS_FIXTURES, { name: 'conformant', ...GHS_CONFORMANT }].map((fixture) => ({
    name: `ghs: ${fixture.name}`,
    labelType: 'ghs-chemical',
    data: fixture.data,
    stock: fixture.stock,
  })),
  ...[
    ...US_FOOD_FIXTURES,
    { name: 'conformant', ...US_FOOD_CONFORMANT },
    { name: 'small panel', ...US_FOOD_SMALL_PANEL },
    ...PERMISSION_PATHS.map(({ label, data, stock }) => ({
      name: label,
      data,
      stock: stock ?? US_FOOD_CONFORMANT.stock,
    })),
  ].map((fixture) => ({
    name: `us-food: ${fixture.name}`,
    labelType: 'us-food',
    data: fixture.data,
    stock: fixture.stock,
  })),
]

/** The judge on a document exactly as the editor holds it — no schema, no canonicalising. */
const judgeAsTheEditorDoes = (document: (typeof documents)[number]) =>
  judgeLabel({
    labelType: document.labelType,
    data: document.data,
    stock: document.stock,
    ...(document.labelType === 'gs1-retail' ? { barcode: bwip } : {}),
  } as JudgeRequest)

describe('check_label on every document the judge is tested against', () => {
  it('has the whole sweep, every label type among it', () => {
    expect(documents.length).toBeGreaterThan(80)
    expect(new Set(documents.map((document) => document.labelType)).size).toBe(3)
  })

  it.each(documents.map((document) => [document.name, document] as const))(
    '%s',
    async (_name, document) => {
      // Through JSON, as a client sends it: a value JSON cannot carry is refused
      // by the schema, as the export routes refuse it.
      const wire = JSON.parse(JSON.stringify(document)) as typeof document
      const request = { labelType: wire.labelType, data: wire.data, stock: wire.stock }
      const result = await (await connect()).callTool({ name: 'check_label', arguments: request })

      const parsed = LabelCheckRequest.safeParse(request)
      if (!parsed.success) {
        // Refused at the door, in the schema's own words, every one of them.
        expect(result.isError).toBe(true)
        for (const issue of parsed.error.issues) {
          expect(textOf(result)).toContain(`${issue.path.join('.')}: ${issue.message}`)
        }
        return
      }
      // Judged as the editor judges it: what the server says about a label is
      // what the website says about the same label.
      expect(result.isError).toBeFalsy()
      expect(result.structuredContent).toEqual(
        checkLabelOutput(parsed.data.labelType, judgeAsTheEditorDoes(document)),
      )
      // Said apart from the comparison above, which runs `checkLabelOutput` on
      // both sides: the findings come most severe first, as the findings rail
      // shows them, and never climb back up the scale.
      const ranks = (
        result.structuredContent as { findings: Array<{ severity: Severity }> }
      ).findings.map((finding) => SEVERITY_ORDER.indexOf(finding.severity))
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    },
  )

  it('fits Claude Code’s tool-result cap with room to spare, on the largest answer', async () => {
    // 25,000 tokens, the tighter of Claude's two caps (claude.ai's is about
    // 150,000 characters). Counted at three characters a token, below the four
    // English prose averages, because JSON is denser in tokens than prose.
    let largest = 0
    for (const document of documents) {
      const request = JSON.parse(
        JSON.stringify({
          labelType: document.labelType,
          data: document.data,
          stock: document.stock,
        }),
      ) as unknown
      if (!LabelCheckRequest.safeParse(request).success) continue
      const result = await (
        await connect()
      ).callTool({ name: 'check_label', arguments: request as Record<string, unknown> })
      largest = Math.max(largest, JSON.stringify(result).length)
    }
    expect(largest).toBeGreaterThan(0)
    expect(largest / 3).toBeLessThan(25_000)
  })
})

describe('check_label, refusing', () => {
  it('refuses a document the export routes refuse, with the same issue', async () => {
    // The export route's own answer, then the server's, for the same label.
    const data = { gtin: '036000291453'.slice(0, 11) }
    const exported = await supertest(createApp({ enableLogging: false }))
      .post('/api/labels/upc-a/export')
      .send(data)
    const checked = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: { labelType: 'gs1-retail', data },
    })
    expect(exported.status).toBe(400)
    expect(checked.isError).toBe(true)
    for (const { path, message } of exported.body.detail as Array<{
      path: string
      message: string
    }>) {
      expect(textOf(checked)).toContain(`data.${path}: ${message}`)
    }
  })

  it('refuses a label type it does not know', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: { labelType: 'eu-food', data: {} },
    })
    expect(result.isError).toBe(true)
  })

  it('refuses a stock inside data rather than judging on the default one', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: {
        labelType: 'gs1-retail',
        data: { gtin: '036000291452', stock: { widthMm: 50, heightMm: 40, marginMm: 2 } },
      },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('`stock` goes beside `data`')
  })

  it('answers a label the engine declines to draw with the refusal and the notice', async () => {
    // A margin that leaves no panel describes no drawing at all.
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: {
        labelType: 'ghs-chemical',
        data: GHS_CONFORMANT.data,
        stock: { widthMm: 10, heightMm: 10, marginMm: 6 },
      },
    })
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toMatchObject({
      outcome: 'refused',
      labelType: 'ghs-chemical',
      notice: NOT_A_STATEMENT_OF_COMPLIANCE,
      whatIsNotChecked: WHAT_IS_NOT_CHECKED_URL,
    })
    expect((result.structuredContent as { reason: string }).reason).not.toBe('')
  })

  it('refuses arguments with more elements than any label has, before the schema runs', async () => {
    const ingredients = Array.from({ length: MAX_TOOL_INPUT_ELEMENTS }, () => ({ name: 'Oats' }))
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: { ...CONFORMANT_FOOD, data: { ...US_FOOD_CONFORMANT.data, ingredients } },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain(`maximum of ${MAX_TOOL_INPUT_ELEMENTS} elements`)
  })
})

describe('check_label, judging', () => {
  it('says that no failures is not compliance, on a label with none', async () => {
    const result = await (
      await connect()
    ).callTool({ name: 'check_label', arguments: CONFORMANT_FOOD })
    expect(result.structuredContent).toMatchObject({
      outcome: 'judged',
      notice: NOT_A_STATEMENT_OF_COMPLIANCE,
      whatIsNotChecked: WHAT_IS_NOT_CHECKED_URL,
    })
  })

  it('carries a finding’s code, severity and citation as data, most severe first', async () => {
    const fixture = GS1_RETAIL_FIXTURES.find((candidate) => candidate.expected.severity !== 'pass')!
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: { labelType: 'gs1-retail', data: fixture.data, stock: fixture.stock },
    })
    const { findings } = result.structuredContent as {
      findings: Array<{ code: string; severity: string; citation: { reference: string } }>
    }
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: fixture.expected.code,
        severity: fixture.expected.severity,
        citation: expect.objectContaining({ reference: fixture.expected.citation }),
      }),
    )
    // Grouped as the findings rail groups them: no pass before a failure.
    const firstPass = findings.findIndex((finding) => finding.severity === 'pass')
    const lastFailure = findings.findLastIndex((finding) => finding.severity !== 'pass')
    expect(firstPass === -1 || lastFailure < firstPass).toBe(true)
  })
})

describe('list_rules', () => {
  it('lists every rule with its citations and codes, or one label type’s', async () => {
    const client = await connect()
    const all = (await client.callTool({ name: 'list_rules', arguments: {} }))
      .structuredContent as {
      rules: Array<{
        labelType: string
        citations: unknown[]
        codes: Array<{ severities: unknown[] }>
      }>
    }
    const food = (
      await client.callTool({ name: 'list_rules', arguments: { labelType: 'us-food' } })
    ).structuredContent as { rules: Array<{ labelType: string }> }
    expect(new Set(all.rules.map((rule) => rule.labelType)).size).toBe(3)
    for (const rule of all.rules) {
      expect(rule.citations.length).toBeGreaterThan(0)
      expect(rule.codes.length).toBeGreaterThan(0)
    }
    expect(food.rules.length).toBeGreaterThan(0)
    expect(food.rules.every((rule) => rule.labelType === 'us-food')).toBe(true)
    expect(food.rules.length).toBe(all.rules.filter((rule) => rule.labelType === 'us-food').length)
  })
})

describe('ghs_statement_text', () => {
  const lookUp = async (regime: string, code: string) =>
    (await (await connect()).callTool({ name: 'ghs_statement_text', arguments: { regime, code } }))
      .structuredContent

  it('gives the table’s text exactly, whatever case or spacing the code arrives in', async () => {
    expect(await lookUp('eu-clp', ' h225 ')).toEqual({
      found: true,
      regime: 'eu-clp',
      code: 'H225',
      kind: 'hazard',
      text: EU_CLP_HAZARD_STATEMENTS.H225,
    })
    expect(await lookUp('eu-clp', 'P210')).toMatchObject({
      kind: 'precautionary',
      text: EU_CLP_PRECAUTIONARY_STATEMENTS.P210,
    })
  })

  it('finds a combination the table lists, written the way a person writes it', async () => {
    const combination = Object.keys(EU_CLP_PRECAUTIONARY_STATEMENTS).find((code) =>
      code.includes('+'),
    )!
    expect(await lookUp('eu-clp', combination.replaceAll(' ', '').toLowerCase())).toMatchObject({
      found: true,
      code: combination,
      text: EU_CLP_PRECAUTIONARY_STATEMENTS[combination],
    })
  })

  it('says it has no text rather than offering some', async () => {
    expect(await lookUp('eu-clp', 'H999')).toMatchObject({ found: false, code: 'H999' })
    expect(await lookUp('eu-clp', 'EUH066')).toMatchObject({ found: false })
  })

  it('says a regime with no tables is a gap in this build, not a fact about the code', async () => {
    const answer = (await lookUp('us-osha', 'H225')) as { found: boolean; reason: string }
    expect(answer.found).toBe(false)
    expect(answer.reason).toContain('no verified us-osha statement text for any code')
  })
})

describe('check_gtin', () => {
  const check = async (gtin: string) =>
    (await connect()).callTool({ name: 'check_gtin', arguments: { gtin } })

  it('confirms a right check digit and names the format', async () => {
    expect((await check('036000291452')).structuredContent).toEqual({
      gtin: '036000291452',
      format: 'GTIN-12',
      valid: true,
      statedCheckDigit: 2,
      expectedCheckDigit: 2,
    })
    // Worked by hand: 629104150021, weighted 3,1,3… from the right, sums to 57,
    // so the check digit is 60 − 57 = 3.
    expect((await check('6291041500213')).structuredContent).toMatchObject({
      format: 'GTIN-13',
      valid: true,
    })
  })

  it('gives the right digit for a wrong one', async () => {
    expect((await check('036000291453')).structuredContent).toMatchObject({
      valid: false,
      statedCheckDigit: 3,
      expectedCheckDigit: 2,
    })
  })

  it('refuses anything that is not a GTIN length, rather than calling it valid', async () => {
    // `isValidCheckDigit` would answer for any run of two or more digits.
    for (const gtin of ['12', '1234567', '03600029145', '036000291452123', 'ABCDEFGHIJKL']) {
      const result = await check(gtin)
      expect(result.isError, gtin).toBe(true)
      // Refused by the input schema, in its words — not by some later failure.
      expect(textOf(result), gtin).toContain('A GTIN is 8, 12, 13 or 14 digits')
    }
  })
})
