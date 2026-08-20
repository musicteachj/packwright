/**
 * GS1 Application Identifiers.
 *
 * An AI is a 2–4 character prefix declaring the meaning and format of the data
 * that follows it. GS1 defines over a hundred; this table carries the subset
 * this application actually encodes, which is the subset that appears on retail
 * and logistics labels.
 *
 * TODO(expand): sourced from GS1's published AI listings. Before adding rules
 * that depend on an AI not listed here, confirm its format against the General
 * Specifications rather than extending this table from memory.
 */

import { isValidCheckDigit } from './checkDigit'

export interface AiSpec {
  ai: string
  title: string
  charset: 'numeric' | 'alphanumeric'
  /** Fixed character count, or an inclusive range for variable-length fields. */
  length: number | { min: number; max: number }
  /**
   * True when the AI appears in GS1's predefined-length table. Those fields
   * carry their length in the specification itself, so no separator is needed
   * after them even mid-stream. Everything else is variable length and must be
   * terminated by FNC1 unless it is the final element in the symbol.
   */
  predefinedLength: boolean
  /**
   * True when the AI's value carries a GS1 mod-10 check digit in its final
   * position, and the value is therefore self-validating.
   *
   * Corresponds to the `csum` attribute in the GS1 Barcode Syntax Dictionary,
   * which carries it on exactly five of the AIs in this table: 00, 01, 02, 410
   * and 414 — every one of them an identification key.
   */
  checkDigit?: boolean
  /** Path segment used in a GS1 Digital Link URI, where GS1 defines one. */
  digitalLinkAlpha?: string
  /** True when this AI may open a Digital Link path as its primary key. */
  primaryKey?: boolean
  /** True when this AI qualifies a primary key rather than standing alone. */
  qualifier?: boolean
}

/**
 * The FNC1 separator as it appears in the encoded data stream: ASCII 29, GS.
 * The symbology encoder emits the actual FNC1 symbol character; in the data
 * string it is represented by this control character.
 *
 * Written as an escape on purpose. A literal GS byte here is invisible in every
 * editor, survives neither copy-paste nor most diff views, and a separator that
 * silently becomes an empty string yields symbols that encode without complaint
 * and decode as one run-on field.
 */
export const FNC1_SEPARATOR = '\u001D'

/**
 * GS1 AI encodable character set 82, from General Specifications 25.0 figure
 * 7.11-1 — a subset of ISO/IEC 646 IRV, not "any printable ASCII".
 *
 * Transcribed from the figure rather than derived: 13 punctuation marks, the
 * ten digits, six more punctuation marks, A–Z, low line, a–z. That totals 82
 * characters, which is where the name comes from.
 *
 * The 13 printable characters it *excludes* are the point of the rule: space,
 * `#`, `$`, `@`, `[`, `\`, `]`, `^`, backtick, `{`, `|`, `}` and `~`. A value
 * carrying one of those cannot be represented in a GS1 element string — and an
 * embedded separator in particular truncates the field at the decoder, which
 * the encoder has no way to notice.
 */
const CSET_82 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]*$/

const SPECS: readonly AiSpec[] = [
  {
    ai: '00',
    title: 'SSCC',
    charset: 'numeric',
    length: 18,
    predefinedLength: true,
    checkDigit: true,
    digitalLinkAlpha: 'sscc',
    primaryKey: true,
  },
  {
    ai: '01',
    title: 'GTIN',
    charset: 'numeric',
    length: 14,
    predefinedLength: true,
    checkDigit: true,
    digitalLinkAlpha: 'gtin',
    primaryKey: true,
  },
  {
    ai: '02',
    title: 'GTIN of contained trade items',
    charset: 'numeric',
    length: 14,
    predefinedLength: true,
    checkDigit: true,
  },
  {
    ai: '10',
    title: 'Batch or lot number',
    charset: 'alphanumeric',
    length: { min: 1, max: 20 },
    predefinedLength: false,
    digitalLinkAlpha: 'lot',
    qualifier: true,
  },
  { ai: '11', title: 'Production date', charset: 'numeric', length: 6, predefinedLength: true },
  { ai: '13', title: 'Packaging date', charset: 'numeric', length: 6, predefinedLength: true },
  { ai: '15', title: 'Best before date', charset: 'numeric', length: 6, predefinedLength: true },
  { ai: '16', title: 'Sell by date', charset: 'numeric', length: 6, predefinedLength: true },
  { ai: '17', title: 'Expiration date', charset: 'numeric', length: 6, predefinedLength: true },
  { ai: '20', title: 'Variant number', charset: 'numeric', length: 2, predefinedLength: true },
  {
    ai: '21',
    title: 'Serial number',
    charset: 'alphanumeric',
    length: { min: 1, max: 20 },
    predefinedLength: false,
    digitalLinkAlpha: 'ser',
    qualifier: true,
  },
  {
    ai: '22',
    title: 'Consumer product variant',
    charset: 'alphanumeric',
    length: { min: 1, max: 20 },
    predefinedLength: false,
    digitalLinkAlpha: 'cpv',
    qualifier: true,
  },
  {
    ai: '30',
    title: 'Variable count of items',
    charset: 'numeric',
    length: { min: 1, max: 8 },
    predefinedLength: false,
  },
  {
    ai: '37',
    title: 'Count of trade items',
    charset: 'numeric',
    length: { min: 1, max: 8 },
    predefinedLength: false,
  },
  {
    ai: '240',
    title: 'Additional product identification',
    charset: 'alphanumeric',
    length: { min: 1, max: 30 },
    predefinedLength: false,
  },
  {
    ai: '400',
    title: 'Customer purchase order number',
    charset: 'alphanumeric',
    length: { min: 1, max: 30 },
    predefinedLength: false,
  },
  // The predefined-length table is keyed on the AI's first two digits, and the
  // `41` prefix is in it — so a GLN is never followed by a separator. Marking
  // these variable-length emits a stray FNC1 that a conformant decoder reads as
  // data corruption, since it has already consumed exactly 13 digits.
  {
    ai: '410',
    title: 'Ship to GLN',
    charset: 'numeric',
    length: 13,
    predefinedLength: true,
    checkDigit: true,
  },
  {
    ai: '414',
    title: 'GLN of physical location',
    charset: 'numeric',
    length: 13,
    predefinedLength: true,
    checkDigit: true,
  },
] as const

const BY_AI = new Map<string, AiSpec>(SPECS.map((spec) => [spec.ai, spec]))

export function getAiSpec(ai: string): AiSpec | undefined {
  return BY_AI.get(ai)
}

export function listAiSpecs(): readonly AiSpec[] {
  return SPECS
}

/** True when the AI's data field is fixed-length and needs no FNC1 terminator. */
export function hasPredefinedLength(ai: string): boolean {
  return BY_AI.get(ai)?.predefinedLength ?? false
}

/**
 * Validates a value against its AI's declared format, and — for the five AIs
 * that carry one — its check digit.
 *
 * Returns null when valid, or a human-readable reason when not.
 *
 * The check digit is content rather than format, which is why it did not
 * originally live here. Leaving it out meant `encodeElementString` would encode
 * an invalid GTIN into a symbol without complaint: the value is fourteen
 * numeric digits, so every format rule passed. That symbol prints, scans, and
 * decodes to an identifier that does not exist — and the check digit is the one
 * mechanism designed to catch exactly that, so declining to run it was the
 * wrong call.
 */
export function validateAiValue(ai: string, value: string): string | null {
  const spec = BY_AI.get(ai)
  if (!spec) return `Unknown Application Identifier (${ai})`

  // Both patterns allow the empty string on purpose, so that a missing value
  // falls through to the length check below and is reported as missing rather
  // than as a character-set violation. The rejection is the same either way;
  // the reason the user reads is not.
  if (spec.charset === 'numeric' && !/^[0-9]*$/.test(value)) {
    return `AI (${ai}) ${spec.title} accepts digits only`
  }

  if (spec.charset === 'alphanumeric' && !CSET_82.test(value)) {
    return `AI (${ai}) ${spec.title} accepts only GS1 character set 82`
  }

  if (typeof spec.length === 'number') {
    if (value.length !== spec.length) {
      return `AI (${ai}) ${spec.title} is fixed at ${spec.length} characters, received ${value.length}`
    }
  } else {
    const { min, max } = spec.length
    if (value.length < min || value.length > max) {
      return `AI (${ai}) ${spec.title} accepts ${min}–${max} characters, received ${value.length}`
    }
  }

  // Runs last, and only once charset and length have passed — so the value is
  // known to be all digits and long enough for isValidCheckDigit, which throws
  // rather than returns on malformed input.
  if (spec.checkDigit && !isValidCheckDigit(value)) {
    return `AI (${ai}) ${spec.title} "${value}" has an invalid check digit`
  }

  return null
}
