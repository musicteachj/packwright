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

const SPECS: readonly AiSpec[] = [
  {
    ai: '00',
    title: 'SSCC',
    charset: 'numeric',
    length: 18,
    predefinedLength: true,
    digitalLinkAlpha: 'sscc',
    primaryKey: true,
  },
  {
    ai: '01',
    title: 'GTIN',
    charset: 'numeric',
    length: 14,
    predefinedLength: true,
    digitalLinkAlpha: 'gtin',
    primaryKey: true,
  },
  {
    ai: '02',
    title: 'GTIN of contained trade items',
    charset: 'numeric',
    length: 14,
    predefinedLength: true,
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
  { ai: '410', title: 'Ship to GLN', charset: 'numeric', length: 13, predefinedLength: false },
  {
    ai: '414',
    title: 'GLN of physical location',
    charset: 'numeric',
    length: 13,
    predefinedLength: false,
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
 * Validates a value against its AI's declared format.
 * Returns null when valid, or a human-readable reason when not.
 */
export function validateAiValue(ai: string, value: string): string | null {
  const spec = BY_AI.get(ai)
  if (!spec) return `Unknown Application Identifier (${ai})`

  if (spec.charset === 'numeric' && !/^[0-9]+$/.test(value)) {
    return `AI (${ai}) ${spec.title} accepts digits only`
  }

  if (typeof spec.length === 'number') {
    if (value.length !== spec.length) {
      return `AI (${ai}) ${spec.title} is fixed at ${spec.length} characters, received ${value.length}`
    }
    return null
  }

  const { min, max } = spec.length
  if (value.length < min || value.length > max) {
    return `AI (${ai}) ${spec.title} accepts ${min}–${max} characters, received ${value.length}`
  }
  return null
}
