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
  DEFAULT_GHS_STOCK,
  DEFAULT_US_FOOD_STOCK,
  EU_CLP_PRECAUTIONARY_STATEMENTS,
  SEVERITY_ORDER,
  buildDigitalLinkUri,
  judgeLabel,
  type JudgeRequest,
  type LabelStock,
  type Severity,
  type UpcALabelData,
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
  MAX_ISSUES_REPORTED,
  MAX_TOOL_INPUT_ELEMENTS,
  NOT_A_STATEMENT_OF_COMPLIANCE,
  NOT_JUDGED,
  WHAT_IS_NOT_CHECKED_URL,
  SIZE_NOT_GIVEN,
  assumedMarginNotice,
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

  it('says its tool list never changes', async () => {
    // Said `true`, every client that asked could hold a subscription open forever.
    const client = await connect(era)
    expect(client.getServerCapabilities()?.tools).toEqual({ listChanged: false })
  })

  it('advertises every input as one object, which Anthropic’s API accepts', async () => {
    // A union at the top of an input schema is written `oneOf`, and Anthropic's
    // API refuses it: Claude Code drops the tool with "its input schema uses
    // top-level oneOf, which the Anthropic API does not accept". `check_label`
    // was dropped that way on 2026-10-10, found only by connecting Claude Code —
    // the SDK and Inspector's --strict both passed it.
    const { tools } = await (await connect(era)).listTools()
    for (const tool of tools) {
      // An output schema may be a union, and two are; their root is still typed
      // as an object, which is what a client reading the older specification
      // looks for, and Claude Code accepted both.
      expect(tool.outputSchema?.type, `${tool.name} output`).toBe('object')
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

  it('tells the model never to invent a label size, and to check before asking', async () => {
    // Haiku 4.5 sent an invented size in 3 of 21 answers of the 2026-10-12 re-check,
    // with check_label's description already saying to leave it out. The order
    // matters as much as the prohibition: stage 20's "ask rather than guess" left
    // 43 of 72 answers asking and checking nothing.
    const instructions = (await connect(era)).getInstructions() ?? ''
    expect(instructions).toContain('Never send check_label a label size the user did not give')
    expect(instructions).toContain('cannot tell an invented size from a stated one')
    const checkFirst = instructions.indexOf('call check_label without `stock`')
    const thenAsk = instructions.indexOf('only then ask for the size')
    expect(checkFirst).toBeGreaterThan(-1)
    expect(thenAsk).toBeGreaterThan(checkFirst)
  })

  it('says which part of CLP Annex IV a precautionary statement’s wording comes from', async () => {
    // Part 2, as Article 22(4) directs, P503 from Part 1, and the permission for
    // variations with both its conditions. It states no verdict: two drafts did,
    // and a wording verdict belongs in rules/, which has none.
    const { tools } = await (await connect(era)).listTools()
    const description = tools.find((tool) => tool.name === 'ghs_statement_text')!.description!
    expect(description).toContain('the English wording of Annex IV Part 2')
    expect(description).toContain('Article 22(4)')
    expect(description).toContain('P503, which Part 2 does not list, is given from Part 1')
    expect(description).toContain('assist in communicating safety information')
    expect(description).toContain('the safety advice is not diluted or compromised')
    expect(description).toContain('Packwright does not judge a printed statement’s wording')
    expect(description).not.toMatch(/not\b[^.]*wrongly worded|is compliant|acceptable/)
    expect(description).not.toContain('\u2014') // no em dash
  })

  it('answers P103 and P280 with Part 2’s text, which the description says it gives', async () => {
    // The description's claim, held to the data: Part 1 reads "Read carefully and
    // follow all instructions." and adds "hearing protection/…" to P280
    // (docs/CLP-P-STATEMENT-TEXTS.md).
    const client = await connect(era)
    for (const [code, part2] of [
      ['P103', 'Read label before use.'],
      ['P280', 'Wear protective gloves/protective clothing/eye protection/face protection.'],
    ] as const) {
      const result = await client.callTool({
        name: 'ghs_statement_text',
        arguments: { regime: 'eu-clp', code },
      })
      expect(result.structuredContent, code).toMatchObject({ found: true, text: part2 })
      expect(EU_CLP_PRECAUTIONARY_STATEMENTS[code], code).toBe(part2)
    }
    expect(EU_CLP_PRECAUTIONARY_STATEMENTS['P503']).toBeDefined()
  })

  it('advertises what the fields mean, and that the request takes no other keys', async () => {
    // The descriptions the 2026-10-10 evaluation showed were missing — every model's
    // first Digital Link sent a bare host name — and the strict top level, which a
    // client sees as `additionalProperties: false`.
    const { tools } = await (await connect(era)).listTools()
    const schema = tools.find((tool) => tool.name === 'check_label')!.inputSchema as {
      additionalProperties?: unknown
      properties: Record<string, { additionalProperties?: unknown; properties?: object }>
    }
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.stock!.additionalProperties).toBe(false)
    const advertised = JSON.stringify(schema)
    // The Digital Link as printed, with nothing to infer (2026-10-16): models inferred
    // the convenience alphas from the printed URI wrongly in 5 of 12 answers.
    expect(advertised).toContain('The Digital Link exactly as the label prints it')
    expect(advertised).not.toContain('useConvenienceAlphas')
    // A factor, not a percentage: "100%" would have read as `magnification: 100`.
    expect(advertised).toContain('not a percentage')
    expect(advertised).toContain('not the size of the label')
    expect(advertised).toContain('Leave it out entirely if the label has no')
    expect(advertised).toContain(`${DEFAULT_US_FOOD_STOCK.marginMm} mm for us-food`)
    // 21 CFR 101.9(b)(12)(i)(B)'s second limb (2026-10-27): without it a raw commodity
    // making a claim is reported for a second column the regulation excuses.
    expect(advertised).toContain('or about which a claim is made')
    // One side is drawn for every pictogram, so the smallest is asked for (2026-10-27).
    expect(advertised).toContain('The side of the smallest pictogram’s square')
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
      // As a label printed elsewhere, which is what check_label judges.
      judgeLabel({
        labelType: 'us-food',
        data: US_FOOD_CONFORMANT.data,
        stock: US_FOOD_CONFORMANT.stock,
        subject: 'described',
      }),
      { sizeGiven: true, ...US_FOOD_CONFORMANT.stock, marginAssumed: false },
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
// The editor's judge, told what `check_label` tells it: that the label was printed
// elsewhere. See `LabelSubject`.
const judgeAsCheckLabelShould = (document: (typeof documents)[number]) =>
  judgeLabel({
    labelType: document.labelType,
    data: document.data,
    stock: document.stock,
    subject: 'described',
    ...(document.labelType === 'gs1-retail' ? { barcode: bwip } : {}),
  } as JudgeRequest)

/**
 * A sweep document as `check_label` takes it: a Digital Link configured from a domain
 * becomes the URI that label would print, since `check_label` takes the link as printed
 * (2026-10-16). Without this every such document was refused at the door and dropped out
 * of the comparison below without anyone noticing (found by review). Where the builder
 * refuses the fields, the URI is put together as the label would print it anyway, so
 * the rule meets the same fault in the string.
 */
const asCheckLabelTakesIt = (document: (typeof documents)[number]): (typeof documents)[number] => {
  if (document.labelType !== 'gs1-retail') return document
  const { digitalLink, ...data } = document.data as UpcALabelData
  if (digitalLink === undefined) return document
  const { domain, lot, serial, expiry, useConvenienceAlphas } = digitalLink
  const gtin = (data as { gtin: string }).gtin
  let uri: string
  try {
    uri = buildDigitalLinkUri({
      domain,
      primary: { ai: '01', value: gtin },
      qualifiers: [
        ...(lot === undefined ? [] : [{ ai: '10', value: lot }]),
        ...(serial === undefined ? [] : [{ ai: '21', value: serial }]),
      ],
      attributes: expiry === undefined ? [] : [{ ai: '17', value: expiry }],
      ...(useConvenienceAlphas === undefined ? {} : { useConvenienceAlphas }),
    })
  } catch {
    const key = (alpha: string, ai: string) => (useConvenienceAlphas ? alpha : ai)
    uri =
      `${domain.replace(/\/+$/, '')}/${key('gtin', '01')}/${gtin.padStart(14, '0')}` +
      (lot === undefined ? '' : `/${key('lot', '10')}/${lot}`) +
      (serial === undefined ? '' : `/${key('ser', '21')}/${serial}`) +
      (expiry === undefined ? '' : `?17=${expiry}`)
  }
  return { ...document, data: { ...data, digitalLinkAsPrinted: uri } }
}

describe('check_label on every document the judge is tested against', () => {
  it('has the whole sweep, every label type among it', () => {
    expect(documents.length).toBeGreaterThan(80)
    expect(new Set(documents.map((document) => document.labelType)).size).toBe(3)
  })

  it.each(documents.map((document) => [document.name, document] as const))(
    '%s',
    async (_name, swept) => {
      const document = asCheckLabelTakesIt(swept)
      // Through JSON, as a client sends it: a value JSON cannot carry is refused
      // by the schema, as the export routes refuse it.
      const wire = JSON.parse(JSON.stringify(document)) as typeof document
      // A Digital Link as printed is sent as a client sends it, in `digitalLink.uri`.
      const { digitalLinkAsPrinted, ...data } = wire.data as { digitalLinkAsPrinted?: string }
      const request = {
        labelType: wire.labelType,
        data:
          digitalLinkAsPrinted === undefined
            ? wire.data
            : { ...data, digitalLink: { uri: digitalLinkAsPrinted } },
        stock: wire.stock,
      }
      const result = await (await connect()).callTool({ name: 'check_label', arguments: request })

      const parsed = LabelCheckRequest.safeParse(request)
      if (!parsed.success) {
        // Refused at the door, in the schema's own words, every one of them.
        expect(result.isError).toBe(true)
        // Never for a size or a length: a fixture is a real label, and a bound in
        // `INPUT_BOUNDS` that refused one would turn it from judged to refused here
        // without failing anything else.
        for (const issue of parsed.error.issues) {
          expect(issue.code, issue.path.join('.')).not.toMatch(/^too_(big|small)$/)
        }
        for (const issue of parsed.error.issues) {
          expect(textOf(result)).toContain(`${issue.path.join('.')}: ${issue.message}`)
        }
        return
      }
      // Judged as the editor judges it: what the server says about a label is
      // what the website says about the same label, printed elsewhere.
      expect(result.isError).toBeFalsy()
      expect(result.structuredContent).toEqual(
        checkLabelOutput(parsed.data.labelType, judgeAsCheckLabelShould(document), {
          sizeGiven: true,
          ...document.stock,
          marginAssumed: false,
        }),
      )
      // A configured link and the URI it prints are the same label, so the Digital Link
      // rule must say the same of both: the comparison above runs the printed path on
      // both sides, and without this the editor's path went unchecked against it.
      if (document !== swept) {
        const linkCodes = (judged: ReturnType<typeof judgeAsCheckLabelShould>) =>
          ('findings' in judged ? judged.findings : [])
            .filter((finding) => finding.code.startsWith('GS1_DIGITAL_LINK_'))
            .map((finding) => `${finding.code} ${finding.severity}`)
        expect(linkCodes(judgeAsCheckLabelShould(document))).toEqual(
          linkCodes(judgeAsCheckLabelShould(swept)),
        )
      }
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

  it('judges a label whose size it was not told, and asks for the size where it matters', async () => {
    // Required from stage 20 until 2026-10-12, when the re-check found 43 of 72 answers
    // asking for a size and checking nothing. Now everything the size does not decide is
    // judged, the size checks wait for it, and no size is assumed — the evaluation of
    // 2026-10-10 found a borrowed 74 × 105 mm passing a label too small for its package.
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: {
        labelType: 'ghs-chemical',
        data: { ...GHS_CONFORMANT.data, signalWords: ['Danger', 'Warning'] },
      },
    })
    expect(result.isError).toBeFalsy()
    const answer = result.structuredContent as {
      stockUsed: { sizeGiven: boolean; notice?: string }
      findings: Array<{ code: string }>
      declined: Array<{ ruleId: string; wants: string[] }>
      uncheckable: Array<{ reasons: string[] }>
    }
    expect(answer.stockUsed).toEqual({ sizeGiven: false, notice: SIZE_NOT_GIVEN })
    // And says that fit went unchecked, which `declined` cannot: there is no edge to
    // run off, so no check of fit ran to decline. Found by review.
    expect(SIZE_NOT_GIVEN).toContain('fits on the label was not checked')
    const codes = answer.findings.map((finding) => finding.code)
    // Judged without a size: the two signal words.
    expect(codes).toContain('GHS_SIGNAL_WORD_CONFLICT')
    // Not judged, either way: the label's own size.
    expect(codes).not.toContain('GHS_LABEL_SIZE_MET')
    expect(codes).not.toContain('GHS_LABEL_BELOW_MINIMUM_SIZE')
    expect(answer.declined).toContainEqual(
      expect.objectContaining({ ruleId: 'ghs/label-dimensions', wants: ['stock'] }),
    )
    // And nothing said about fit on a size nobody gave.
    const reasons = answer.uncheckable.flatMap((one) => one.reasons)
    expect(reasons.filter((reason) => /past the (bottom|right)|does not fit/.test(reason))).toEqual(
      [],
    )
  })

  it('reports a wrong check digit without being told the size', async () => {
    // Case 06 of the re-check: every answer asked for a size and the check digit went
    // unreported in that turn.
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: { labelType: 'gs1-retail', data: { gtin: '036000291453' } },
    })
    const { findings } = result.structuredContent as { findings: Array<{ code: string }> }
    expect(findings.map((finding) => finding.code)).toContain('GS1_GTIN_CHECK_DIGIT_INVALID')
  })

  it('says it assumed the margin when it was given only the size', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: {
        labelType: 'ghs-chemical',
        data: GHS_CONFORMANT.data,
        stock: { widthMm: 50, heightMm: 70 },
      },
    })
    expect((result.structuredContent as { stockUsed: unknown }).stockUsed).toEqual({
      sizeGiven: true,
      widthMm: 50,
      heightMm: 70,
      marginMm: DEFAULT_GHS_STOCK.marginMm,
      marginAssumed: true,
    })
    // And it judged the size it was given: 50 × 70 mm is below the CLP minimum
    // for a 5 L package, which a borrowed 74 × 105 mm used to pass.
    const { findings } = result.structuredContent as { findings: Array<{ code: string }> }
    expect(findings.map((finding) => finding.code)).toContain('GHS_LABEL_BELOW_MINIMUM_SIZE')
  })

  it('judges a label printed elsewhere, not Packwright’s drawing of it', async () => {
    // The two false findings of the 2026-10-10 evaluation, on case 03's shape: every
    // pictogram reported as having no symbol, and text set at the engine's own type
    // sizes reported "not printed". Neither is a fact about the user's label.
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: {
        labelType: 'ghs-chemical',
        data: {
          ...GHS_CONFORMANT.data,
          precautionaryStatementCodes: ['P210', 'P233', 'P240', 'P403+P235'],
        },
        stock: { widthMm: 50, heightMm: 70, marginMm: 4 },
      },
    })
    const answer = result.structuredContent as {
      findings: Array<{ code: string }>
      declined: Array<{ ruleId: string; limit?: true }>
      uncheckable: Array<{ reasons: string[] }>
    }
    expect(result.isError).toBeFalsy()
    expect(answer.findings.map((finding) => finding.code)).not.toContain(
      'GHS_PICTOGRAM_SYMBOL_MISSING',
    )
    expect(answer.declined).toContainEqual(
      expect.objectContaining({ ruleId: 'ghs/pictogram-integrity', limit: true }),
    )
    const reasons = answer.uncheckable.flatMap((one) => one.reasons)
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.filter((reason) => reason.includes('not printed'))).toEqual([])
  })

  it('passes nothing on a barcode’s magnification, bar height or digits it was not told', async () => {
    // A request carrying only a GTIN used to come back with the magnification, bar
    // height, digits and quiet zones all passed — measured on Packwright's defaults.
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: {
        labelType: 'gs1-retail',
        data: { gtin: '036000291452' },
        stock: { widthMm: 60, heightMm: 40 },
      },
    })
    const answer = result.structuredContent as {
      findings: Array<{ code: string; severity: string }>
      declined: Array<{ ruleId: string; wants: string[]; limit?: true }>
    }
    expect(answer.findings.filter((one) => one.severity === 'pass').map((one) => one.code)).toEqual(
      ['GS1_GTIN_CHECK_DIGIT_VALID'],
    )
    expect(answer.declined).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'gs1/magnification', wants: ['magnification'] }),
        expect.objectContaining({ ruleId: 'gs1/human-readable', wants: ['omitHri'] }),
        expect.objectContaining({ ruleId: 'gs1/quiet-zone', limit: true }),
      ]),
    )
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

  it('answers a label the engine declines to draw with the refusal, and says it was not judged', async () => {
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
      // Not the judged notice, which speaks of failures and declined checks a
      // refusal does not have.
      notice: NOT_JUDGED,
      whatIsNotChecked: WHAT_IS_NOT_CHECKED_URL,
    })
    expect((result.structuredContent as { reason: string }).reason).not.toBe('')
    // The margin was the caller's, so nothing says it was assumed.
    expect((result.structuredContent as { reason: string }).reason).not.toContain(
      'No margin was given',
    )
  })

  it('says so when the margin it refused was one it assumed', async () => {
    // The us-food default of 6 mm leaves no panel on a 12 mm wide label, and the
    // engine's sentence names a margin the user never gave. Found by
    // `/code-review high` on #84.
    const data = {
      statementOfIdentity: 'Oats',
      netQuantity: { inchPound: '1 oz' },
      container: { shape: 'rectangular', widthMm: 12, heightMm: 40 },
    }
    const client = await connect()
    const assumed = await client.callTool({
      name: 'check_label',
      arguments: { labelType: 'us-food', data, stock: { widthMm: 12, heightMm: 40 } },
    })
    expect(assumed.structuredContent).toMatchObject({ outcome: 'refused' })
    expect((assumed.structuredContent as { reason: string }).reason).toContain(
      assumedMarginNotice(DEFAULT_US_FOOD_STOCK.marginMm),
    )

    // Given its real margin, the same label is drawn and judged.
    const stated = await client.callTool({
      name: 'check_label',
      arguments: { labelType: 'us-food', data, stock: { widthMm: 12, heightMm: 40, marginMm: 1 } },
    })
    expect(stated.structuredContent).toMatchObject({ outcome: 'judged' })
  })

  it('blames an assumed margin only for a refusal the margin caused', () => {
    // No refusal but the margin's is reachable through the schema today, which
    // refuses every other drawing the engines decline; held here directly, so a
    // refusal added later is not told to look for a margin.
    const refusal = { outcome: 'refused', reason: 'Some other reason.' } as const
    const roomy = {
      sizeGiven: true as const,
      widthMm: 60,
      heightMm: 40,
      marginMm: 3,
      marginAssumed: true,
    }
    expect(checkLabelOutput('gs1-retail', refusal, roomy)).toMatchObject({
      reason: 'Some other reason.',
    })
  })

  it('refuses a key it does not know at the top of the request, or in the stock, by name', async () => {
    // Stripped, `stok` left a request with no stock, refused for the wrong reason; and a
    // `marginMM` dropped would have been judged at the default margin, silently.
    const client = await connect()
    const misspelt = await client.callTool({
      name: 'check_label',
      arguments: {
        labelType: 'ghs-chemical',
        data: GHS_CONFORMANT.data,
        stock: { widthMm: 74, heightMm: 105 },
        stok: { widthMm: 74, heightMm: 105 },
      },
    })
    expect(misspelt.isError).toBe(true)
    expect(textOf(misspelt)).toContain('stok')

    const inStock = await client.callTool({
      name: 'check_label',
      arguments: {
        labelType: 'ghs-chemical',
        data: GHS_CONFORMANT.data,
        stock: { widthMm: 74, heightMm: 105, marginMM: 2 },
      },
    })
    expect(inStock.isError).toBe(true)
    expect(textOf(inStock)).toContain('marginMM')
  })

  /** A GHS label carrying `count` precautionary codes no table has. */
  const unknownCodes = (count: number) => ({
    labelType: 'ghs-chemical',
    data: {
      ...GHS_CONFORMANT.data,
      precautionaryStatementCodes: Array.from({ length: count }, (_, i) => `P${9000 + i}`),
    },
  })
  const issuesIn = (args: unknown) => LabelCheckRequest.safeParse(args).error?.issues.length ?? 0

  it('names the first twenty issues of a long refusal, and counts the rest', async () => {
    // 4,900 unknown precautionary codes answered 754 kB, one issue for each
    // (security review of 2026-10-18).
    const args = unknownCodes(4_900)
    const issues = issuesIn(args)
    expect(issues).toBeGreaterThan(MAX_ISSUES_REPORTED + 1)
    const result = await (await connect()).callTool({ name: 'check_label', arguments: args })
    expect(result.isError).toBe(true)
    const text = textOf(result)
    expect(text.match(/data\.precautionaryStatementCodes/g)).toHaveLength(MAX_ISSUES_REPORTED)
    expect(text).toContain(
      `and ${(issues - MAX_ISSUES_REPORTED).toLocaleString('en-US')} more issues, not listed`,
    )
    expect(text.length).toBeLessThan(5_000)
  })

  it('counts one issue left over as one issue', async () => {
    // One more code than the cap, so one issue past the twenty listed.
    const args = unknownCodes(MAX_ISSUES_REPORTED + 1)
    expect(issuesIn(args)).toBe(MAX_ISSUES_REPORTED + 1)
    const result = await (await connect()).callTool({ name: 'check_label', arguments: args })
    expect(textOf(result)).toContain('and 1 more issue, not listed')
  })

  it('names every issue of a short refusal', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'check_label',
      arguments: {
        labelType: 'ghs-chemical',
        data: { ...GHS_CONFORMANT.data, pictograms: ['X1', 'X2', 'X3'] },
      },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result).match(/data\.pictograms\.\d/g)).toHaveLength(3)
    expect(textOf(result)).not.toContain('more issues')
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

describe('subscriptions', () => {
  it('acknowledges a listen with nothing to deliver, and closes it at once', async () => {
    // One client held all 1,024 of the SDK's slots when the server advertised
    // `listChanged: true` (security review of 2026-10-18, finding 5).
    const subscription = await (await connect('modern')).listen({ toolsListChanged: true })
    expect(subscription.honoredFilter).toEqual({})
    // The guard only turns a held stream into a failure rather than a hang.
    let guard: ReturnType<typeof setTimeout> | undefined
    const held = new Promise<'held'>((resolve) => {
      guard = setTimeout(() => resolve('held'), 2_000)
    })
    const closed = await Promise.race([subscription.closed, held])
    clearTimeout(guard)
    expect(closed).toBe('graceful')
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

  it('refuses a code longer than any code is', async () => {
    const result = await (
      await connect()
    ).callTool({
      name: 'ghs_statement_text',
      arguments: { regime: 'eu-clp', code: `H${' '.repeat(200)}225` },
    })
    expect(result.isError).toBe(true)
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
    // 9638507 weighted the same way sums to 86, so 90 − 86 = 4.
    expect((await check('96385074')).structuredContent).toMatchObject({
      format: 'GTIN-8',
      valid: true,
    })
    // 1001234567890 sums to 88, so 90 − 88 = 2.
    expect((await check('10012345678902')).structuredContent).toMatchObject({
      format: 'GTIN-14',
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
