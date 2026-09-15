/**
 * The replies `extract.ts` is tested against.
 *
 * **`recorded.json` is recorded, and nothing else here pretends to be.** It is
 * the raw `Message` from one real call against `sampleLabel.png`, written by
 * `recordFixture.cli.ts`. A hand-written version of it would be this
 * repository's own idea of what the API returns, checked against this
 * repository's own idea of what the API returns — the circularity
 * `ghs/statements.ts` records having already paid for once.
 *
 * The rest are **protocol** fixtures, and hand-writing those is a different
 * thing: their shape comes from the API specification rather than from our
 * implementation, and each is built by changing exactly one thing about the
 * recorded reply, so what a test is exercising is the difference.
 *
 * **Re-recording moves the confidences.** Two recordings of the same label
 * returned identical values and confidences differing in the second decimal.
 * Tests therefore read a confidence out of this fixture rather than writing one
 * down, so re-recording changes the expected figure and the assertion at the
 * same time — the alternative is a test that fails on noise, which is a test
 * people learn to re-record around.
 */

import type Anthropic from '@anthropic-ai/sdk'
import recordedJson from './recorded.json' with { type: 'json' }

export const recorded = recordedJson as unknown as Anthropic.Message

const variant = (changes: Partial<Anthropic.Message>): Anthropic.Message => ({
  ...recorded,
  ...changes,
})

const textBlock = (text: string): Anthropic.ContentBlock =>
  ({ type: 'text', text, citations: null }) as unknown as Anthropic.ContentBlock

const thinkingBlock = (): Anthropic.ContentBlock =>
  ({ type: 'thinking', thinking: '', signature: '' }) as unknown as Anthropic.ContentBlock

/**
 * The same reply with a thinking block in front of the text.
 *
 * Not a hypothetical. The recording run returned `[text]` with zero thinking
 * tokens; a call with identical parameters against a different image returned
 * `[thinking, text]`. Adaptive thinking decides per request, so both layouts are
 * ordinary and a reader that indexes `content[0]` works until it does not.
 */
export const thinkingFirst = variant({ content: [thinkingBlock(), ...recorded.content] })

/** Declined. HTTP 200, no content, and a category to report. */
export const refused = variant({
  content: [],
  stop_reason: 'refusal',
  stop_details: {
    type: 'refusal',
    category: 'cyber',
    explanation: null,
  } as Anthropic.Message['stop_details'],
})

/** Declined with nothing said about why — `stop_details` is nullable. */
export const refusedWithoutDetails = variant({
  content: [],
  stop_reason: 'refusal',
  stop_details: null,
})

/** A refusal that still carried a text block, which is why the guard comes first. */
export const refusedWithContent = variant({
  stop_reason: 'refusal',
  stop_details: null,
})

/** Prose where JSON was asked for. */
export const notJson = variant({
  content: [textBlock('I am unable to read this label with confidence.')],
})

/**
 * One field the schema rejects, beside one it accepts.
 *
 * Shaped this way because the interesting question is not whether a violation
 * is noticed — it is what it costs. The confidence of 4 is unreadable; the
 * supplier beside it is not, and the call has been paid for either way.
 */
export const wrongShape = variant({
  content: [
    textBlock(
      JSON.stringify({
        productIdentifier: { value: 'Acetone', confidence: 4 },
        supplier: {
          value: { name: 'Northgate Solvents Ltd', address: 'Lincoln LN6 7DQ' },
          confidence: 0.9,
        },
      }),
    ),
  ],
})

/** JSON, but not an object — nothing to salvage a field out of. */
export const notAnObject = variant({ content: [textBlock('["Acetone"]')] })

/** The signal words as a label prints them, which is in capitals. */
export const shoutedSignalWords = variant({
  content: [
    textBlock(JSON.stringify({ signalWords: { value: ['DANGER', 'WARNING'], confidence: 0.98 } })),
  ],
})

/** A signal word that is neither of the two, whatever its case. */
export const wrongSignalWord = variant({
  content: [
    textBlock(
      JSON.stringify({
        signalWords: { value: ['Caution'], confidence: 0.6 },
        productIdentifier: { value: 'Acetone', confidence: 0.99 },
      }),
    ),
  ],
})

/** Nothing to read at all. */
export const noTextBlock = variant({ content: [thinkingBlock()] })

/** A reading carrying codes this build has no verified text for. */
export const unknownCodes = variant({
  content: [
    textBlock(
      JSON.stringify({
        productIdentifier: { value: 'Acetone', confidence: 0.99 },
        hazardStatementCodes: { value: ['H225', 'H999'], confidence: 0.9 },
      }),
    ),
  ],
})

/**
 * A code that names an inherited property rather than a statement.
 *
 * `ghs/statements.ts` records that `table['constructor']` returning a function
 * once sailed past a `!== undefined` guard and crashed the layout engine on
 * `text.split` — from a well-formed request. The codes here arrive from a model
 * as free strings, which is the most likely place for it to happen again.
 */
export const prototypeCode = variant({
  content: [
    textBlock(
      JSON.stringify({ hazardStatementCodes: { value: ['constructor'], confidence: 0.5 } }),
    ),
  ],
})

/**
 * Cut off before it finished.
 *
 * Reachable because adaptive thinking draws on the same `max_tokens` as the
 * answer. The content is deliberately valid-looking-but-truncated JSON, which is
 * what makes this worth its own outcome: without a `stop_reason` check it
 * reaches `JSON.parse`, fails, and is reported as an unreadable photograph.
 */
export const truncated = variant({
  content: [textBlock('{"productIdentifier":{"value":"Ace')],
  stop_reason: 'max_tokens',
})

/** The same unrecognised code twice, which is one unrecognised code. */
export const repeatedUnknownCode = variant({
  content: [
    textBlock(
      JSON.stringify({
        hazardStatementCodes: { value: ['H999', 'H999', 'H225'], confidence: 0.8 },
      }),
    ),
  ],
})

/** The prototype-pollution shape on the precautionary lookup, which is a second lookup. */
export const prototypeCodePrecautionary = variant({
  content: [
    textBlock(
      JSON.stringify({ precautionaryStatementCodes: { value: ['toString'], confidence: 0.5 } }),
    ),
  ],
})

/**
 * A combination code printed without the spaces the table is keyed by.
 *
 * `EU_CLP_PRECAUTIONARY_STATEMENTS` keys `'P337 + P313'`; labels print it both
 * ways, and the prompt asks for verbatim transcription. The sample label happens
 * to print the spaced form, which is precisely why the recorded fixture could
 * never have shown this.
 */
export const unspacedCombinationCode = variant({
  content: [
    textBlock(
      JSON.stringify({
        precautionaryStatementCodes: { value: ['P337+P313', 'p210'], confidence: 0.9 },
      }),
    ),
  ],
})

/** A reply that says the photograph showed nothing. The honest empty answer. */
export const readNothing = variant({ content: [textBlock('{}')] })
