import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { GhsRequest } from '../labels/schemas'
import {
  EXTRACTION_MODEL,
  ExtractionDeclined,
  ExtractionTruncated,
  ExtractionUnreadable,
  extractGhsLabel,
  SLOWEST_TOKENS_PER_SECOND,
  VISION_MAX_RETRIES,
  VISION_MAX_TOKENS,
  VISION_TIMEOUT_MS,
  visionClient,
  type SendMessage,
} from './extract'
import {
  answeredByAnotherModel,
  noTextBlock,
  notAnObject,
  notJson,
  prototypeCode,
  prototypeCodePrecautionary,
  repeatedUnknownCode,
  shoutedSignalWords,
  truncated,
  unspacedCombinationCode,
  wrongSignalWord,
  readNothing,
  recorded,
  refused,
  refusedWithContent,
  refusedWithoutDetails,
  thinkingFirst,
  unknownCodes,
  wrongShape,
} from './fixtures/responses'

const PHOTO = { mediaType: 'image/png', data: 'AAAA' } as const

const replying = (message: Anthropic.Message): SendMessage => vi.fn().mockResolvedValue(message)

/** The reading alone. `readingOf` is for the tests that care about the envelope. */
const extract = async (message: Anthropic.Message, regime: 'eu-clp' | 'us-osha' = 'eu-clp') =>
  (await extractGhsLabel(replying(message), PHOTO, regime)).extraction

const readingOf = (message: Anthropic.Message) =>
  extractGhsLabel(replying(message), PHOTO, 'eu-clp')

/** What was thrown, without the assertion passing when nothing was. */
async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('the call resolved, so there was nothing to inspect')
}

describe('the client the request goes out on', () => {
  it('is bounded, because somebody is holding a phone through this', async () => {
    // The SDK's defaults are ten minutes and two retries, which is up to half an
    // hour of a browser waiting to be told the service could not be reached.
    // Constructed by a factory rather than inline in `server.ts` so that this
    // can be asserted at all — `server.ts` opens a database and listens on a
    // port, so nothing imports it.
    const client = visionClient('sk-ant-not-a-real-key')
    expect(client.timeout).toBe(VISION_TIMEOUT_MS)
    expect(client.maxRetries).toBe(VISION_MAX_RETRIES)
    expect(VISION_TIMEOUT_MS).toBeLessThan(10 * 60_000)
    expect(VISION_MAX_RETRIES).toBeLessThan(2)
  })

  it('cannot want more tokens than the timeout allows it to receive', () => {
    // These two were first chosen separately — 16,000 tokens and sixty seconds
    // — and could not both be true. A budget that cannot be reached before the
    // timeout makes `ExtractionTruncated` a guard for something that never
    // happens, and turns a long reading into two billed attempts reported as an
    // unreachable service. Asserted rather than left in a comment, because the
    // next person to change either number will change only one.
    const secondsToSpend = VISION_MAX_TOKENS / SLOWEST_TOKENS_PER_SECOND
    expect(secondsToSpend).toBeLessThan(VISION_TIMEOUT_MS / 1000)
  })
})

describe('the request', () => {
  it('sends the image before the text, at the model the design names', async () => {
    const send = replying(recorded)
    await extractGhsLabel(send, PHOTO, 'eu-clp')

    const [params] = (send as unknown as { mock: { calls: [Anthropic.MessageCreateParams][] } })
      .mock.calls[0]!
    expect(params.model).toBe(EXTRACTION_MODEL)

    const content = params.messages[0]!.content as { type: string }[]
    // The ordering the vision documentation recommends for this shape of
    // request, and the one thing about the request that is not obvious from
    // reading it back.
    expect(content.map((block) => block.type)).toEqual(['image', 'text'])
  })

  it('asks for the reply as a JSON schema rather than hoping for JSON', async () => {
    const send = replying(recorded)
    await extractGhsLabel(send, PHOTO, 'eu-clp')
    const [params] = (send as unknown as { mock: { calls: [Anthropic.MessageCreateParams][] } })
      .mock.calls[0]!
    expect(params.output_config?.format?.type).toBe('json_schema')
  })
})

describe('a declined request', () => {
  it('is an outcome, not a crash', async () => {
    const error = await thrownBy(extract(refused))
    // The failure this guards against is a `TypeError` from indexing empty
    // content, which would reach the 500 handler and report an internal error
    // for something that is not one. Asserting the class alone would pass
    // against code that threw the right error for the wrong reason, so the
    // negative is asserted too.
    expect(error).toBeInstanceOf(ExtractionDeclined)
    expect(error).not.toBeInstanceOf(TypeError)
    expect((error as ExtractionDeclined).category).toBe('cyber')
  })

  it('survives a refusal that says nothing about why', async () => {
    // `stop_details` is null for every stop reason but this one, and nullable
    // even for this one.
    const error = await thrownBy(extract(refusedWithoutDetails))
    expect(error).toBeInstanceOf(ExtractionDeclined)
    expect((error as ExtractionDeclined).category).toBeNull()
  })

  it('is checked before the content is read, not after', async () => {
    // A refusal carrying a perfectly parseable body. Reading content first and
    // checking `stop_reason` afterwards would return an extraction here — a
    // declined request answered with data.
    const error = await thrownBy(extract(refusedWithContent))
    expect(error).toBeInstanceOf(ExtractionDeclined)
  })
})

describe('a reply that ran out of room', () => {
  it('is reported as cut short rather than as an unreadable photograph', async () => {
    // Truncated JSON parses as badly as prose does, so without a `stop_reason`
    // check this arrives as "the image could not be read as a label" — a
    // sentence blaming the photograph for a budget this server set.
    const error = await thrownBy(extract(truncated))
    expect(error).toBeInstanceOf(ExtractionTruncated)
    expect(error).not.toBeInstanceOf(ExtractionUnreadable)
  })
})

describe('a reply that cannot be read', () => {
  it('reports prose where JSON was asked for', async () => {
    expect(await thrownBy(extract(notJson))).toBeInstanceOf(ExtractionUnreadable)
  })

  it('reports a reply with no text block in it', async () => {
    expect(await thrownBy(extract(noTextBlock))).toBeInstanceOf(ExtractionUnreadable)
  })

  it('reports a body there is nothing to salvage a field out of', async () => {
    // A JSON array. No field name to prune, so nothing can be kept and the
    // whole reply is reported — the branch that stops the salvage below from
    // swallowing a genuinely broken reply.
    expect(await thrownBy(extract(notAnObject))).toBeInstanceOf(ExtractionUnreadable)
  })
})

describe('a reply with one unreadable field in it', () => {
  it('discards the field, not the reading', async () => {
    // The first version rejected the whole body on any violation. That is the
    // wrong trade for the same reason an unrecognised statement code does not
    // reject one: the call has been paid for, this endpoint exists to show what
    // was read, and one bad confidence would cost every field that parsed.
    const result = await extract(wrongShape)
    expect(result.fields.supplier?.value?.name).toBe('Northgate Solvents Ltd')
    expect(result.fields.productIdentifier).toBeUndefined()
  })

  it('says which field it dropped, rather than dropping it quietly', async () => {
    const result = await extract(wrongShape)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.code).toBe('EXTRACTION_FIELD_DISCARDED')
    expect(result.warnings[0]?.path).toBe('productIdentifier')
  })
})

describe('the signal words, as a label actually prints them', () => {
  it('reads DANGER and WARNING as the words CLP spells', async () => {
    // `GHS_SIGNAL_WORDS` is title case because Article 20 spells them that way;
    // labels print them in capitals, the sample one included. The prompt says
    // transcribe exactly what is printed, so the two pull against each other on
    // this field alone — and without this the most interesting thing on a label
    // carrying both would be the thing that got discarded.
    const result = await extract(shoutedSignalWords)
    expect(result.fields.signalWords?.value).toEqual(['Danger', 'Warning'])
    expect(result.warnings).toEqual([])
  })

  it('does not rescue a word that is not one of the two', async () => {
    // Case is typography. "Caution" is a different word, and inventing a
    // mapping for it would be this application deciding what a label said.
    const result = await extract(wrongSignalWord)
    expect(result.fields.signalWords).toBeUndefined()
    expect(result.fields.productIdentifier?.value).toBe('Acetone')
    expect(result.warnings[0]?.path).toBe('signalWords')
  })
})

describe('reading the recorded reply', () => {
  it('finds the text block by type, not by position', async () => {
    // Both layouts are ordinary: the recording run returned `[text]` with zero
    // thinking tokens, and a call with identical parameters against another
    // image returned `[thinking, text]`. A positional read passes against one
    // and fails against the other.
    const fromText = await extract(recorded)
    const fromThinkingFirst = await extract(thinkingFirst)
    expect(fromThinkingFirst).toEqual(fromText)
  })

  it('reports the model that answered, not the one this server asked for', async () => {
    // Asserted against a reply from a *different* model on purpose. The obvious
    // version compares `reading.model` to `recorded.model` — and `recorded.model`
    // is `claude-opus-5`, which is also `EXTRACTION_MODEL`, so it passes
    // whichever of the two the code reports. It was written that way first and
    // survived the mutation that replaced the observation with the claim.
    const reading = await readingOf(answeredByAnotherModel)
    expect(reading.model).toBe('claude-opus-5-not-what-we-asked-for')
    expect(reading.model).not.toBe(EXTRACTION_MODEL)
  })

  it('carries the confidences the model gave, not ones of our own', async () => {
    const result = await extract(recorded)
    expect(result.fields.productIdentifier?.value).toBe('Acetone')

    // Read out of the fixture rather than written here as a number. Two
    // recordings of the same label came back with the same values and different
    // confidences — 0.99 and 0.98 on the signal words — so a literal here would
    // fail on the next re-record for no reason anyone could act on. Parsed
    // independently of the mapping under test, so what this asserts is that the
    // model's figure reaches the result unaltered, which is the property that
    // matters: a default substituted here would be this application inventing a
    // confidence.
    const asRecorded = JSON.parse(
      (recorded.content.find((block) => block.type === 'text') as { text: string }).text,
    ) as { productIdentifier: { confidence: number } }
    expect(result.fields.productIdentifier?.confidence).toBe(
      asRecorded.productIdentifier.confidence,
    )
    // `?.` on `value` rather than only on the field: `ExtractionResult`'s mapped
    // type is `ExtractedField<T[K]>`, and for an optional key of `GhsLabelData`
    // that `T[K]` still includes `undefined` — so the contract currently admits
    // a field that is present with no value. Recorded in `docs/BACKLOG.md`.
    expect(result.fields.supplier?.value?.name).toBe('Northgate Solvents Ltd')
    expect(result.fields.supplier?.value?.telephone).toBe('+44 1522 880 114')
  })

  it('reports both signal words, which is the whole reason that field is plural', async () => {
    // The sample label carries DANGER and WARNING together, which CLP Article
    // 20(3) forbids. A single-valued field could only report it by discarding
    // half the evidence, and `ghs/signal-word-precedence` would have nothing to
    // catch.
    const result = await extract(recorded)
    expect(result.fields.signalWords?.value).toEqual(['Danger', 'Warning'])
  })

  it('reads the pictograms off the artwork', async () => {
    expect((await extract(recorded)).fields.pictograms?.value).toEqual(['GHS02', 'GHS07'])
  })

  it('leaves a clean reading unwarned', async () => {
    // Every code on the sample label resolves against the eu-clp tables,
    // combination codes included. A warning here would mean the classifier
    // fires on codes it should recognise.
    expect((await extract(recorded)).warnings).toEqual([])
  })

  it('reports nothing for a photograph that showed nothing', async () => {
    const result = await extract(readNothing)
    expect(result.fields).toEqual({})
    expect(result.warnings).toEqual([])
  })
})

describe('classifying statement codes', () => {
  it('warns about a code it has no text for, and keeps the rest of the reading', async () => {
    const result = await extract(unknownCodes)
    // The reading survives. Losing five fields because one code was misread
    // would be the wrong trade for a screen whose purpose is to show what was
    // read.
    expect(result.fields.hazardStatementCodes?.value).toEqual(['H225', 'H999'])
    expect(result.fields.productIdentifier?.value).toBe('Acetone')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.code).toBe('GHS_STATEMENT_CODE_UNRECOGNISED')
    expect(result.warnings[0]?.message).toContain('H999')
    expect(result.warnings[0]?.path).toBe('hazardStatementCodes')
  })

  it('says it once for a code printed twice, and stores it once too', async () => {
    const result = await extract(repeatedUnknownCode)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.message).toContain('H999')
    // The warning deduped and what was stored did not, so a confirmed label
    // would have carried H999 twice and drawn it twice. This test asserted the
    // warning count and never the value, which is how that survived.
    expect(result.fields.hazardStatementCodes?.value).toEqual(['H999', 'H225'])
  })

  it('does not crash on a code naming an inherited property', async () => {
    const result = await extract(prototypeCode)
    expect(result.warnings[0]?.code).toBe('GHS_STATEMENT_CODE_UNRECOGNISED')
    expect(result.fields.hazardStatementCodes?.value).toEqual(['constructor'])
  })

  it('reads a combination code the label spaced differently from the table', async () => {
    // `P337+P313` is `P337 + P313` in different type, and the table is keyed by
    // the spaced form. Stored in the form that resolves, not the form printed,
    // because the layout engine looks these up by exact key — a confirmed
    // `P337+P313` would draw nothing and record an omission, blaming the label
    // for our whitespace.
    const result = await extract(unspacedCombinationCode)
    expect(result.fields.precautionaryStatementCodes?.value).toEqual(['P337 + P313', 'P210'])
    expect(result.warnings).toEqual([])
  })

  it('is telling the truth about what confirming an unknown code would do', async () => {
    // The warning used to promise the code would be "recorded as omitted" on a
    // drawn label. It would not: `GhsRequest` admits only codes this build has
    // text for, so confirming one refuses the whole label with a 400. Asserting
    // the schema rather than the wording, so that loosening the schema later
    // fails here and sends someone back to the sentence.
    const result = await extract(unknownCodes)
    const codes = result.fields.hazardStatementCodes?.value ?? []
    expect(codes).toContain('H999')

    const asLabel = GhsRequest.safeParse({
      regime: 'eu-clp',
      productIdentifier: 'Acetone',
      capacityL: 1,
      hazardStatementCodes: codes,
    })
    expect(asLabel.success).toBe(false)
    expect(result.warnings[0]?.message).toContain('refuse the whole label')
  })

  it('guards the precautionary lookup too, not only the hazard one', async () => {
    // Two lookups, two tables. The hazard path was covered and this one was
    // not, while the module note claimed only one lookup existed — so the note
    // was wrong and the coverage matched the note rather than the code.
    const result = await extract(prototypeCodePrecautionary)
    expect(result.warnings[0]?.path).toBe('precautionaryStatementCodes')
    expect(result.fields.precautionaryStatementCodes?.value).toEqual(['toString'])
  })

  it('says once that a regime has no table, rather than once per code', async () => {
    // Every us-osha code lands here, because Appendix C.4 has never been
    // transcribed in verifiable form. Eleven identical warnings would read as
    // eleven defects on the user's label; one warning says what is true, which
    // is that the gap is in this application.
    const result = await extract(recorded, 'us-osha')
    const hazard = result.warnings.filter((w) => w.path === 'hazardStatementCodes')
    expect(hazard).toHaveLength(1)
    expect(hazard[0]?.code).toBe('GHS_STATEMENT_TABLE_EMPTY')
    expect(hazard[0]?.message).toContain('not a defect on the label')
    // And the same, separately, for the precautionary codes.
    expect(result.warnings.filter((w) => w.path === 'precautionaryStatementCodes')).toHaveLength(1)
  })
})
