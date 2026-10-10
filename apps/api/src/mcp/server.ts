/**
 * Packwright as an MCP server: the four tools, and what each answers.
 *
 * Stage 18 of `docs/plans/2026-10-10-mcp.md`. A person asks their own assistant
 * about a label; the assistant calls these tools; Packwright draws the label, runs
 * the rules the website runs, and answers with every finding, its citation, and the
 * checks that did not run. **Nothing here calls a model and nothing is saved.** The
 * assistant explains the answer; it does not have to invent a citation, because
 * each one arrives as data from `label-core`'s rules.
 *
 * Every verdict comes from `judgeLabel`, the function the editor and the audit
 * screen call, so the three cannot disagree about a label. Every input is checked
 * against `@packwright/label-core/schema`, the schema the export routes use, so
 * the two refuse the same documents with the same issues. Statement text comes
 * from the reference tables and nowhere else.
 *
 * The four names are fixed: a client asks for the list each time it connects, so
 * renaming one breaks no connection, but it resets whatever refers to a tool by
 * name — a user's "always allow" in Claude, and the evaluation harness of stage 19.
 */

import {
  GHS_REGIMES,
  LABEL_TYPES,
  SEVERITY_ORDER,
  calculateCheckDigit,
  canonicalStatementCode,
  citationsOf,
  codesOf,
  hazardStatementText,
  isValidCheckDigit,
  judgeLabel,
  knownHazardStatementCodes,
  knownPrecautionaryStatementCodes,
  listRules,
  precautionaryStatementText,
  severitiesOf,
  type Citation,
  type Finding,
  type LabelJudgement,
} from '@packwright/label-core'
import {
  LabelCheckRequest,
  LabelCheckRequestOutline,
  toJudgeRequest,
} from '@packwright/label-core/schema'
import {
  McpServer,
  type CallToolResult,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server'
import * as bwip from 'bwip-js/generic'
import { z } from 'zod'

/**
 * Where a reader finds what this tool does not check.
 *
 * On `dev` because the document is not on `main` yet: `main` has not been
 * released to since it was written. Phase 8's release moves this to `main`.
 */
export const WHAT_IS_NOT_CHECKED_URL =
  'https://github.com/musicteachj/packwright/blob/dev/docs/WHAT-IS-NOT-CHECKED.md'

/**
 * Said with every judgement, whatever it found.
 *
 * The opening of `WHAT-IS-NOT-CHECKED.md`, in the server's words. An assistant
 * handed a report with no failures will be asked "so is my label compliant?", and
 * this is the sentence that has to be in front of it when it answers.
 */
export const NOT_A_STATEMENT_OF_COMPLIANCE =
  'A report with no failures is not a statement that this label is compliant. It says only that ' +
  'the checks this tool performs found nothing. Some requirements are not checked at all — see ' +
  '`whatIsNotChecked` — and the checks listed under `declined` did not run on this label.'

/**
 * Generous for any real label, and far below what would cost this server anything.
 *
 * The largest document in the rule fixtures has a few hundred members; the 256 kB
 * body limit `app.ts` applies to every route is the outer bound. This is the finer
 * one the SDK offers, refusing before the schema runs.
 */
export const MAX_TOOL_INPUT_ELEMENTS = 5_000

/**
 * `check_label`'s input: advertised as one object, checked as the shared union.
 *
 * The SDK reads a tool's JSON Schema from `~standard.jsonSchema` and validates
 * with `~standard.validate`, so the two are taken from different schemas. A model
 * reads `LabelCheckRequestOutline`, which Anthropic's API accepts; a request is
 * checked by `LabelCheckRequest`, so it is refused with exactly the issues the
 * export routes raise. See the outline's note for why the two must differ.
 */
const CheckLabelInput = {
  '~standard': {
    ...LabelCheckRequest['~standard'],
    jsonSchema: LabelCheckRequestOutline['~standard'].jsonSchema,
  },
} as StandardSchemaWithJSON<z.input<typeof LabelCheckRequest>, z.output<typeof LabelCheckRequest>>

/** The tool annotations every tool here carries: they read, and reach nothing outside. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

const CitationOutput = z.object({
  authority: z.enum(['GS1', 'FDA', 'OSHA', 'EU']),
  reference: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
})

const FindingOutput = z.object({
  severity: z.enum(SEVERITY_ORDER as unknown as [string, ...string[]]),
  code: z.string(),
  message: z.string(),
  citation: CitationOutput,
  measurement: z.object({ actual: z.string(), required: z.string() }).optional(),
  elementId: z.string().optional(),
  certifies: z.enum(['artwork', 'document']).optional(),
})

const CheckLabelOutput = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('judged'),
    labelType: z.enum(LABEL_TYPES),
    summary: z.object({
      blocking: z.boolean(),
      failures: z.number(),
      passes: z.number(),
      declined: z.number(),
      uncheckable: z.number(),
    }),
    findings: z.array(FindingOutput),
    declined: z.array(
      z.object({
        ruleId: z.string(),
        title: z.string(),
        citation: CitationOutput,
        reason: z.string(),
        wants: z.array(z.string()),
        limit: z.boolean().optional(),
      }),
    ),
    uncheckable: z.array(z.object({ elementId: z.string(), reasons: z.array(z.string()) })),
    notice: z.string(),
    whatIsNotChecked: z.string(),
  }),
  z.object({
    outcome: z.literal('refused'),
    labelType: z.enum(LABEL_TYPES),
    reason: z.string(),
    notice: z.string(),
    whatIsNotChecked: z.string(),
  }),
])

export type CheckLabelOutput = z.infer<typeof CheckLabelOutput>

const ListRulesOutput = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      labelType: z.enum(LABEL_TYPES),
      citations: z.array(CitationOutput),
      codes: z.array(
        z.object({
          code: z.string(),
          severities: z.array(z.enum(SEVERITY_ORDER as unknown as [string, ...string[]])),
        }),
      ),
    }),
  ),
})

const StatementTextOutput = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    regime: z.enum(GHS_REGIMES),
    code: z.string(),
    kind: z.enum(['hazard', 'precautionary']),
    text: z.string(),
  }),
  z.object({
    found: z.literal(false),
    regime: z.enum(GHS_REGIMES),
    code: z.string(),
    reason: z.string(),
  }),
])

const CheckGtinOutput = z.object({
  gtin: z.string(),
  format: z.enum(['GTIN-8', 'GTIN-12', 'GTIN-13', 'GTIN-14']),
  valid: z.boolean(),
  statedCheckDigit: z.number(),
  expectedCheckDigit: z.number(),
})

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * A structured answer, and the same as text.
 *
 * Both, because a client that reads only `content` must see everything a client
 * reading `structuredContent` sees. Compact JSON rather than prose, so the two
 * cannot say different things and the text costs as few tokens as it can.
 */
function answer(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  }
}

const citationOf = (citation: Citation): z.infer<typeof CitationOutput> => ({
  authority: citation.authority,
  reference: citation.reference,
  ...(citation.title === undefined ? {} : { title: citation.title }),
  ...(citation.url === undefined ? {} : { url: citation.url }),
})

const findingOf = (finding: Finding): z.infer<typeof FindingOutput> => ({
  severity: finding.severity,
  code: finding.code,
  message: finding.message,
  citation: citationOf(finding.citation),
  ...(finding.measurement === undefined ? {} : { measurement: { ...finding.measurement } }),
  ...(finding.elementId === undefined ? {} : { elementId: finding.elementId }),
  ...(finding.certifies === undefined ? {} : { certifies: finding.certifies }),
})

/**
 * The judge's answer as this tool gives it.
 *
 * The findings in the order the website's findings rail shows them — grouped by
 * severity, most severe first and passes last — and the layout left out: it is
 * the drawing, thousands of primitives, and every finding already names the
 * element it is about.
 */
export function checkLabelOutput(
  labelType: (typeof LABEL_TYPES)[number],
  judgement: LabelJudgement,
): CheckLabelOutput {
  if (judgement.outcome === 'refused') {
    return {
      outcome: 'refused',
      labelType,
      reason: judgement.reason,
      notice: NOT_A_STATEMENT_OF_COMPLIANCE,
      whatIsNotChecked: WHAT_IS_NOT_CHECKED_URL,
    }
  }
  return {
    outcome: 'judged',
    labelType,
    summary: {
      blocking: judgement.blocking,
      failures: judgement.failures.length,
      passes: judgement.passes.length,
      declined: judgement.declined.length,
      uncheckable: judgement.uncheckable.length,
    },
    findings: judgement.groups.flatMap(([, findings]) => findings.map(findingOf)),
    declined: judgement.declined.map((check) => ({
      ruleId: check.ruleId,
      title: check.title,
      citation: citationOf(check.citation),
      reason: check.reason,
      wants: [...check.wants],
      ...(check.limit === undefined ? {} : { limit: check.limit }),
    })),
    uncheckable: judgement.uncheckable.map((element) => ({
      elementId: element.elementId,
      reasons: element.reasons.map((reason) => reason.text),
    })),
    notice: NOT_A_STATEMENT_OF_COMPLIANCE,
    whatIsNotChecked: WHAT_IS_NOT_CHECKED_URL,
  }
}

/**
 * The verified text for a statement code, or a plain statement that there is none.
 *
 * **Never generated.** Read from the reference tables `label-core` carries, which
 * record where each was transcribed from. A code with no entry is answered "no
 * verified text", never with something that looks like one.
 */
export function statementText(
  regime: (typeof GHS_REGIMES)[number],
  code: string,
): z.infer<typeof StatementTextOutput> {
  const canonical = canonicalStatementCode(code)
  const hazard = hazardStatementText(regime, canonical)
  if (hazard !== undefined) {
    return { found: true, regime, code: canonical, kind: 'hazard', text: hazard }
  }
  const precautionary = precautionaryStatementText(regime, canonical)
  if (precautionary !== undefined) {
    return { found: true, regime, code: canonical, kind: 'precautionary', text: precautionary }
  }
  // Said apart from an unknown code, as the label schema says it: under a regime
  // with no tables at all, every code lands here, and "no text for H225" would
  // read as a fact about H225 rather than a gap in this build.
  const tableIsEmpty =
    knownHazardStatementCodes(regime).length === 0 &&
    knownPrecautionaryStatementCodes(regime).length === 0
  return {
    found: false,
    regime,
    code: canonical,
    reason: tableIsEmpty
      ? `This build carries no verified ${regime} statement text for any code. That is a gap in ` +
        'this application, not a fact about the code.'
      : `This build has no verified ${regime} text for “${canonical}”. It may be a code this ` +
        'build does not carry, a combination it does not list, or not a code at all; no text is ' +
        'given rather than one that might be wrong.',
  }
}

const GTIN_FORMATS = {
  8: 'GTIN-8',
  12: 'GTIN-12',
  13: 'GTIN-13',
  14: 'GTIN-14',
} as const

/**
 * Whether a GTIN's check digit is right, and the right one.
 *
 * The functions underneath take any run of two or more digits; the input schema
 * is what holds this to the four GTIN lengths, so a two-digit string is refused
 * rather than called a valid GTIN.
 */
export function checkGtin(gtin: string): z.infer<typeof CheckGtinOutput> {
  return {
    gtin,
    format: GTIN_FORMATS[gtin.length as keyof typeof GTIN_FORMATS],
    valid: isValidCheckDigit(gtin),
    statedCheckDigit: Number(gtin.slice(-1)),
    expectedCheckDigit: calculateCheckDigit(gtin.slice(0, -1)),
  }
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

const INSTRUCTIONS =
  'Packwright checks packaging labels — GS1 retail barcodes (UPC-A), GHS chemical hazard labels ' +
  '(EU CLP; US OSHA in part) and US FDA food labels — against the rules it implements, by drawing ' +
  'the label and measuring what was drawn. Every finding carries the citation of the provision it ' +
  'enforces; quote those rather than recalling citations. A report with no failures is not a ' +
  'statement of compliance: always tell the user which checks did not run and what is not checked.'

/** The server, built fresh for every request, as `createMcpHandler` requires. */
export function createPackwrightMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'packwright', version: '0.1.0' },
    { instructions: INSTRUCTIONS, maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS },
  )

  server.registerTool(
    'check_label',
    {
      title: 'Check a label',
      description:
        'Draws a label from its details and checks it against every rule Packwright implements for ' +
        'its type. Returns each finding with its severity, message, measurement and citation; the ' +
        'checks that did not run and what each needs; what could not be drawn or judged; and a ' +
        'notice that no failures is not a statement of compliance. `labelType` selects the shape ' +
        'of `data`; `stock` is the label size in millimetres and defaults per label type.',
      inputSchema: CheckLabelInput,
      outputSchema: CheckLabelOutput,
      annotations: READ_ONLY,
    },
    async (request) =>
      answer(checkLabelOutput(request.labelType, judgeLabel(toJudgeRequest(request, bwip)))),
  )

  server.registerTool(
    'list_rules',
    {
      title: 'List the rules',
      description:
        'Every rule Packwright implements, optionally for one label type: its id, what it ' +
        'requires, the provisions it cites, and the finding codes it can report with their severities.',
      inputSchema: z.object({ labelType: z.enum(LABEL_TYPES).optional() }),
      outputSchema: ListRulesOutput,
      annotations: READ_ONLY,
    },
    async ({ labelType }) =>
      answer({
        rules: listRules(labelType).map((rule) => ({
          id: rule.id,
          title: rule.title,
          labelType: rule.appliesTo,
          citations: citationsOf(rule).map(citationOf),
          codes: codesOf(rule).map((code) => ({ code, severities: [...severitiesOf(rule, code)] })),
        })),
      }),
  )

  server.registerTool(
    'ghs_statement_text',
    {
      title: 'Look up a GHS statement',
      description:
        'The exact text of a GHS hazard (H) or precautionary (P) statement code under a regime, ' +
        'from the verified reference tables — or an explicit answer that this build has no ' +
        'verified text for it. Text is never generated.',
      inputSchema: z.object({
        regime: z.enum(GHS_REGIMES),
        code: z.string().trim().min(1),
      }),
      outputSchema: StatementTextOutput,
      annotations: READ_ONLY,
    },
    async ({ regime, code }) => answer(statementText(regime, code)),
  )

  server.registerTool(
    'check_gtin',
    {
      title: 'Check a GTIN check digit',
      description:
        'Whether the last digit of a GTIN-8, -12, -13 or -14 is the correct check digit, and the ' +
        'correct one if not. It checks the arithmetic only: not whether the number is allocated, ' +
        'licensed or in use.',
      inputSchema: z.object({
        gtin: z
          .string()
          .regex(
            /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/,
            'A GTIN is 8, 12, 13 or 14 digits, check digit included',
          ),
      }),
      outputSchema: CheckGtinOutput,
      annotations: READ_ONLY,
    },
    async ({ gtin }) => answer(checkGtin(gtin)),
  )

  return server
}
