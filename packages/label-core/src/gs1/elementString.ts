/**
 * GS1 element strings — the AI + value sequences encoded into GS1-128,
 * GS1 DataMatrix, GS1 QR and DataBar Expanded symbols.
 *
 * Two representations, and conflating them is the classic mistake:
 *
 *   human-readable  (01)09506000134352(10)ABC123
 *   encoded         0109506000134352 10ABC123
 *
 * The brackets are an HRI convention for people. They are **never encoded into
 * the symbol** — a scanner reading literal parentheses is reading a symbol that
 * was built wrong.
 */

import {
  FNC1_SEPARATOR,
  getAiSpec,
  hasPredefinedLength,
  validateAiValue,
} from './applicationIdentifiers'

export interface Gs1Element {
  ai: string
  value: string
}

export class Gs1ElementStringError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Gs1ElementStringError'
  }
}

/** Renders the bracketed human-readable interpretation printed beneath a symbol. */
export function formatHumanReadable(elements: readonly Gs1Element[]): string {
  return elements.map(({ ai, value }) => `(${ai})${value}`).join('')
}

/**
 * Produces the data string actually encoded into the symbol.
 *
 * Variable-length fields are terminated by FNC1, *except* when the element is
 * last — a trailing separator wastes symbol capacity and some decoders surface
 * it as a stray character. Predefined-length fields are never separated, since
 * their length is carried by the specification itself.
 */
export function encodeElementString(elements: readonly Gs1Element[]): string {
  if (elements.length === 0) {
    throw new Gs1ElementStringError('An element string needs at least one element')
  }

  return elements
    .map((element, index) => {
      const reason = validateAiValue(element.ai, element.value)
      if (reason) throw new Gs1ElementStringError(reason)

      const isLast = index === elements.length - 1
      const needsSeparator = !hasPredefinedLength(element.ai) && !isLast
      return `${element.ai}${element.value}${needsSeparator ? FNC1_SEPARATOR : ''}`
    })
    .join('')
}

/**
 * Parses the bracketed human-readable form back into elements.
 *
 * Deliberately only accepts the bracketed form. Parsing a raw encoded stream
 * requires the full predefined-length table to know where an unseparated field
 * ends, and getting that subtly wrong yields plausible-looking garbage — so
 * that path stays closed until the table is complete.
 */
export function parseHumanReadable(input: string): Gs1Element[] {
  const elements: Gs1Element[] = []
  const pattern = /\((\d{2,4})\)([^(]*)/g

  let match: RegExpExecArray | null
  let consumed = 0

  while ((match = pattern.exec(input)) !== null) {
    const ai = match[1]
    const value = match[2]
    if (ai === undefined || value === undefined) continue

    // The pattern is unanchored, so a match may begin past the end of the last
    // one. Checking only for trailing data lets anything before the first AI
    // through silently: 'junk(01)09506000134352' consumes to the end of the
    // input and parses as a clean, single-element list.
    if (match.index !== consumed) {
      throw new Gs1ElementStringError(
        `Unexpected data before AI (${ai}): "${input.slice(consumed, match.index)}"`,
      )
    }

    if (!getAiSpec(ai)) {
      throw new Gs1ElementStringError(`Unknown Application Identifier (${ai})`)
    }
    const reason = validateAiValue(ai, value)
    if (reason) throw new Gs1ElementStringError(reason)

    elements.push({ ai, value })
    consumed = match.index + match[0].length
  }

  if (elements.length === 0) {
    throw new Gs1ElementStringError(`No Application Identifiers found in "${input}"`)
  }
  if (consumed !== input.length) {
    throw new Gs1ElementStringError(
      `Trailing data after the final element: "${input.slice(consumed)}"`,
    )
  }

  return elements
}
