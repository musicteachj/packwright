/**
 * Claude vision reads a label photograph; nothing here judges one.
 *
 * The producer sits behind a one-method port so that no test touches the
 * network. `SendMessage` is the seam: everything above it — the prompt, the
 * refusal guard, the re-validation, the classification, the mapping into the
 * `ExtractionResult` contract — runs against a recorded response in the suite
 * and against the API only when somebody runs the recorder by hand.
 *
 * Three orderings below are requirements rather than style, and each is written
 * where it happens:
 *
 * 1. `stop_reason` is read before `content` is touched at all.
 * 2. The text block is found by type, never by position.
 * 3. The reply is re-validated with `GhsExtraction` before anything is read out
 *    of it, because `output_config.format` constrains less than it appears to.
 */

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import {
  GHS_SIGNAL_WORDS,
  hazardStatementText,
  knownHazardStatementCodes,
  knownPrecautionaryStatementCodes,
  precautionaryStatementText,
  type ExtractionResult,
  type ExtractionWarning,
  type GhsLabelData,
  type GhsRegime,
} from '@packwright/label-core'
import { toSupplier } from '../labels/schemas'
import { EXTRACTED_FIELDS, GhsExtraction } from './extractionSchema'

export const EXTRACTION_MODEL = 'claude-opus-5'

/** The four formats Claude accepts. GIF and WebP are here because it does. */
export const PHOTO_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export type PhotoMediaType = (typeof PHOTO_MEDIA_TYPES)[number]

export interface LabelPhoto {
  mediaType: PhotoMediaType
  /** Base64, as the API takes it. Not downsampled here; the client sizes it. */
  data: string
}

/** The port. One method, so a fake is three lines and a fixture. */
export type SendMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>

/**
 * A reading, and the model that produced it.
 *
 * The model is carried out of here rather than restated by the route from the
 * constant this server asked for. Those are different facts — `response.model`
 * is what answered — and a provenance field that reports the request rather
 * than the reply is a claim dressed as an observation, which is the one kind of
 * statement this application exists not to make.
 */
export interface LabelReading {
  extraction: ExtractionResult<GhsLabelData>
  model: string
}

export type ExtractLabel = (photo: LabelPhoto, regime: GhsRegime) => Promise<LabelReading>

/**
 * Claude declined the request.
 *
 * A decline arrives as HTTP 200 with `stop_reason: 'refusal'` and empty or
 * partial content, so it is not an error the SDK raises — it is an outcome this
 * code has to look for. Carried as its own class so the route maps an outcome
 * rather than matching on a message.
 */
export class ExtractionDeclined extends Error {
  constructor(readonly category: string | null) {
    super('The request to read this image was declined.')
    this.name = 'ExtractionDeclined'
  }
}

/**
 * The reply ran out of room before it finished.
 *
 * Its own class because the alternative reads as a lie. A truncated reply is
 * cut-off JSON, so without this it falls through to `JSON.parse` and comes back
 * as "the image could not be read as a label" — blaming a photograph for a
 * budget this server set. Adaptive thinking draws on the same `max_tokens` as
 * the answer, so it is reachable on a dense label even though the recorded
 * reading spent 267 output tokens of 16,000.
 */
export class ExtractionTruncated extends Error {
  constructor() {
    super('The reading was cut short before it finished.')
    this.name = 'ExtractionTruncated'
  }
}

/** The reply arrived and could not be read as an extraction. */
export class ExtractionUnreadable extends Error {
  constructor(
    message: string,
    readonly detail: readonly { path: string; message: string }[] = [],
  ) {
    super(message)
    this.name = 'ExtractionUnreadable'
  }
}

/**
 * What the model is asked to do, and — at greater length — what it is not.
 *
 * It names no regulation and asks for no opinion. Everything it forbids is
 * something a fluent model does willingly and which would make a rule
 * un-failable: a corrected code, a completed statement, or a guessed field all
 * arrive looking exactly like a correct reading.
 */
const SYSTEM_PROMPT = `You transcribe what is printed on a photograph of a chemical safety label.

You are a reader, not an assessor. Do not evaluate the label, do not say whether it complies with anything, and do not mention any regulation.

Rules, in order of importance:

1. Omit any field you cannot read. An absent field is the correct answer for something the photograph does not show, is too blurred to read, or does not carry. Never guess, complete, or infer a value.
2. Transcribe exactly what is printed, including anything that looks like an error. Do not correct spelling, expand abbreviations, or tidy punctuation.
3. Report hazard and precautionary statement codes only where the code itself is printed — for example "H225" or "P210". If the label prints statement wording without its code, omit the code. Do not derive a code from the wording.
4. Report both signal words if both appear. A label carrying "Danger" and "Warning" together is a thing that exists and must be reported as it is.
5. Give each field a confidence between 0 and 1 reflecting how clearly you could read it, not how plausible the value seems.`

const USER_PROMPT = `Transcribe the GHS label elements visible in this photograph. Report only these fields: ${EXTRACTED_FIELDS.join(', ')}. Omit any you cannot read.`

const isTextBlock = (block: Anthropic.ContentBlock): block is Anthropic.TextBlock =>
  block.type === 'text'

/**
 * Codes this build cannot supply text for, as warnings a user can act on.
 *
 * Two shapes, because they mean different things. An empty table is a fact
 * about this build — every `us-osha` code lands here, and saying so once beats
 * saying it eleven times in language that reads like eleven defects on the
 * user's label. An unrecognised code against a populated table is a fact about
 * the reading.
 *
 * Both lookups go through `own()`, which guards against inherited properties —
 * `table['constructor']` returns a function and once crashed the layout engine
 * on `text.split`. That matters here more than anywhere else in the codebase,
 * because these codes arrive as free strings from a model rather than from a
 * form with an enum behind it. An earlier version of this note claimed only the
 * hazard lookup was used, which was never true of the code beneath it.
 */
/**
 * The spelling the statement tables are keyed by.
 *
 * `EU_CLP_PRECAUTIONARY_STATEMENTS` keys combinations as `'P337 + P313'`, with
 * a space either side of the plus. Labels print them both ways, and the prompt
 * asks for verbatim transcription — so a label reading `P337+P313` was warned
 * as unrecognised and lost a statement this build has verified text for. Our own
 * sample label prints the spaced form, which is exactly why the fixture never
 * showed it.
 *
 * Whitespace and letter case, and nothing else. This is the same judgement as
 * the signal words: `P337+P313` and `P337 + P313` are one code set in different
 * type, where a paraphrased statement would be different regulatory text. A code
 * that does not resolve after this is kept exactly as it was read.
 */
function canonicaliseCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ')
}

function classifyCodes(
  codes: readonly string[],
  regime: GhsRegime,
  kind: 'hazard' | 'precautionary',
): ExtractionWarning[] {
  const path = kind === 'hazard' ? 'hazardStatementCodes' : 'precautionaryStatementCodes'
  const known = kind === 'hazard' ? knownHazardStatementCodes : knownPrecautionaryStatementCodes
  const textFor = kind === 'hazard' ? hazardStatementText : precautionaryStatementText

  if (codes.length === 0) return []

  if (known(regime).length === 0) {
    return [
      {
        code: 'GHS_STATEMENT_TABLE_EMPTY',
        message: `This build carries no verified ${regime} statement text, so none of the ${codes.length} code(s) read from this label can be carried into one here — the saved-label and export routes admit only codes with verified text. That is a gap in this application, not a defect on the label.`,
        path,
      },
    ]
  }

  // Distinct codes only. A label that prints H319 twice is a label with one
  // unrecognised code on it, and saying so twice makes the reading look worse
  // than it is.
  return [...new Set(codes)]
    .filter((code) => textFor(regime, canonicaliseCode(code)) === undefined)
    .map((code) => ({
      code: 'GHS_STATEMENT_CODE_UNRECOGNISED',
      message: `“${code}” was read from the label and has no verified ${regime} text in this build, so it cannot be carried into a label here. Confirming it would have the saved-label and export routes refuse the whole label, because their schema admits only codes this build knows.`,
      path,
    }))
}

/**
 * Title-cases a signal word a label printed in capitals.
 *
 * `GHS_SIGNAL_WORDS` is `['Danger', 'Warning']` because that is how CLP Article
 * 20 spells them, and real labels print them as DANGER and WARNING — including
 * the sample one. The prompt tells the model to transcribe exactly what is
 * printed, so the two instructions pull against each other on this one field,
 * and losing it would be losing the most interesting thing on a label carrying
 * both.
 *
 * This is **not** the normalisation the rest of this file refuses to do. A
 * paraphrased H-statement is different regulatory text; "DANGER" and "Danger"
 * are the same codified word set in different type, and the case a label is
 * printed in is a typographic choice no rule here judges. Anything that is not
 * one of the two words is left exactly as it arrived, for `validate` to reject.
 */
function canonicaliseSignalWords(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body
  const read = body as Record<string, unknown>
  const field = read.signalWords
  if (typeof field !== 'object' || field === null) return body
  const value = (field as Record<string, unknown>).value
  if (!Array.isArray(value)) return body

  return {
    ...read,
    signalWords: {
      ...(field as Record<string, unknown>),
      value: value.map((word) =>
        typeof word === 'string'
          ? (GHS_SIGNAL_WORDS.find((known) => known.toLowerCase() === word.toLowerCase()) ?? word)
          : word,
      ),
    },
  }
}

/**
 * Validates the reply, dropping a field it cannot read rather than the reading.
 *
 * The first version rejected the whole body on any violation, which is the
 * wrong trade for the same reason an unrecognised statement code does not
 * reject one: this endpoint exists to show a user what was read, the call has
 * already been paid for, and one bad `confidence` would have cost the product
 * identifier, the supplier and every code that parsed perfectly well.
 *
 * Done by re-parsing without the offending fields rather than by parsing each
 * field separately, so the schema stays a single declaration and the result
 * stays typed. A violation with no field name — the body not being an object at
 * all — prunes nothing, fails the second parse, and is reported.
 */
function validate(body: unknown, warnings: ExtractionWarning[]): GhsExtraction {
  const parsed = GhsExtraction.safeParse(body)
  if (parsed.success) return parsed.data

  const unreadable = (issues: readonly { path: PropertyKey[]; message: string }[]) =>
    new ExtractionUnreadable(
      'The reply did not match the shape it was asked for.',
      issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )

  const dropped = new Set(
    parsed.error.issues
      .map((issue) => issue.path[0])
      .filter((name): name is string => typeof name === 'string'),
  )
  if (dropped.size === 0 || typeof body !== 'object' || body === null) {
    throw unreadable(parsed.error.issues)
  }

  const kept = { ...(body as Record<string, unknown>) }
  for (const name of dropped) delete kept[name]

  const second = GhsExtraction.safeParse(kept)
  if (!second.success) throw unreadable(second.error.issues)

  for (const name of dropped) {
    warnings.push({
      code: 'EXTRACTION_FIELD_DISCARDED',
      message: `The reading of “${name}” did not match the shape it was asked for and was discarded. Everything else on this label was read.`,
      path: name,
    })
  }
  return second.data
}

/**
 * The codes as the tables spell them, where that resolves to a statement.
 *
 * Stored rather than the printed form, because the layout engine looks these up
 * by exact key: a confirmed `P337+P313` would draw nothing and record an
 * omission, which is the printed label being blamed for our whitespace. A code
 * that resolves either way is unchanged; one that resolves neither way is kept
 * exactly as read, so the user sees what was on the label and the warning beside
 * it says this build has no text for it.
 */
function resolvable(
  codes: readonly string[],
  regime: GhsRegime,
  kind: 'hazard' | 'precautionary',
): readonly string[] {
  const textFor = kind === 'hazard' ? hazardStatementText : precautionaryStatementText
  // Distinct, and in the order they were read. The warnings already said a
  // code printed twice was one code; what was stored still said two, so a
  // confirmed label would have carried the duplicate and drawn it twice. Done
  // after canonicalising, so `P337+P313` and `P337 + P313` collapse together
  // rather than surviving as two spellings of one statement.
  return [
    ...new Set(
      codes.map((code) => {
        if (textFor(regime, code) !== undefined) return code
        const canonical = canonicaliseCode(code)
        return textFor(regime, canonical) === undefined ? code : canonical
      }),
    ),
  ]
}

export async function extractGhsLabel(
  send: SendMessage,
  photo: LabelPhoto,
  regime: GhsRegime,
): Promise<LabelReading> {
  const response = await send({
    model: EXTRACTION_MODEL,
    max_tokens: VISION_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(GhsExtraction) },
    messages: [
      {
        role: 'user',
        // The image before the text, which is the ordering the vision
        // documentation recommends for exactly this shape of request.
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: photo.mediaType, data: photo.data },
          },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  })

  // Before `content`. A declined request is HTTP 200 with empty or partial
  // content, and `stop_details` is null on every other stop reason.
  if (response.stop_reason === 'refusal') {
    throw new ExtractionDeclined(response.stop_details?.category ?? null)
  }

  if (response.stop_reason === 'max_tokens') {
    throw new ExtractionTruncated()
  }

  // By type, not by position — and the reason is worse than "a refusal returns
  // no text". Two live calls with identical parameters came back with different
  // block layouts: `[thinking, text]` against one image, `[text]` against
  // another, because adaptive thinking decides per request. A positional read
  // is therefore intermittently wrong on the success path, which is the kind
  // that survives a green suite.
  const text = response.content.find(isTextBlock)
  if (text === undefined) {
    throw new ExtractionUnreadable('The reply carried no text to read.')
  }

  let body: unknown
  try {
    body = JSON.parse(text.text)
  } catch {
    throw new ExtractionUnreadable('The reply was not the JSON it was asked for.')
  }

  const warnings: ExtractionWarning[] = []
  const read = validate(canonicaliseSignalWords(body), warnings)
  const fields: ExtractionResult<GhsLabelData>['fields'] = {}

  if (read.productIdentifier !== undefined) fields.productIdentifier = read.productIdentifier
  if (read.signalWords !== undefined) fields.signalWords = read.signalWords
  if (read.pictograms !== undefined) fields.pictograms = read.pictograms
  if (read.outerPackageStatement !== undefined) {
    fields.outerPackageStatement = read.outerPackageStatement
  }
  if (read.supplier !== undefined) {
    // The same key-by-key reconciliation the export routes do, reused rather
    // than rewritten: Zod's `string | undefined` is not `label-core`'s
    // genuinely-absent optional under `exactOptionalPropertyTypes`.
    fields.supplier = {
      value: toSupplier(read.supplier.value),
      confidence: read.supplier.confidence,
    }
  }
  if (read.hazardStatementCodes !== undefined) {
    fields.hazardStatementCodes = {
      ...read.hazardStatementCodes,
      value: resolvable(read.hazardStatementCodes.value, regime, 'hazard'),
    }
    warnings.push(...classifyCodes(read.hazardStatementCodes.value, regime, 'hazard'))
  }
  if (read.precautionaryStatementCodes !== undefined) {
    fields.precautionaryStatementCodes = {
      ...read.precautionaryStatementCodes,
      value: resolvable(read.precautionaryStatementCodes.value, regime, 'precautionary'),
    }
    warnings.push(...classifyCodes(read.precautionaryStatementCodes.value, regime, 'precautionary'))
  }

  return { extraction: { fields, warnings }, model: response.model }
}

/**
 * How long one reading may take, and how often it may be retried.
 *
 * The SDK's defaults are built for a script: ten minutes and two retries, which
 * is up to half an hour of a browser waiting before it is told the service
 * could not be reached. This is a request somebody is holding a phone through.
 * The recorded call takes about five seconds, so two minutes is generous and one
 * retry still covers a dropped connection.
 *
 * Here rather than in `server.ts` so that a test can assert it. `server.ts`
 * opens a database and listens on a port, which is why nothing in this
 * workspace imports it.
 */
export const VISION_TIMEOUT_MS = 120_000
export const VISION_MAX_RETRIES = 1

/**
 * The output budget, sized so that reaching it is possible before the timeout.
 *
 * These two numbers are one decision and were first written as two: 16,000
 * tokens against a sixty-second timeout, which cannot both be true at any rate
 * this model has produced — the recorded call managed 267 tokens in about five
 * seconds, so roughly fifty a second. The budget was unreachable, which made
 * `ExtractionTruncated` a guard for something the timeout always got to first
 * and turned a genuinely long reading into two billed attempts reported as "the
 * service could not be reached".
 *
 * Both numbers moved: the timeout to two minutes, the budget to four thousand.
 * A reading is a small JSON object — the recorded one is 267 tokens, and
 * adaptive thinking draws on the same budget — so four thousand is generous for
 * a dense label and deliverable inside two minutes with room to spare.
 * `extract.test.ts` asserts that they still agree, rather than leaving it to
 * whoever edits one of them next.
 */
export const VISION_MAX_TOKENS = 4_000

/** The slowest generation rate observed, rounded down hard. Used only to check the two above agree. */
export const SLOWEST_TOKENS_PER_SECOND = 40

export function visionClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    timeout: VISION_TIMEOUT_MS,
    maxRetries: VISION_MAX_RETRIES,
  })
}

/** The production port: the SDK, bound to one client. */
export const sendThrough =
  (client: Anthropic): SendMessage =>
  (params) =>
    client.messages.create(params)
