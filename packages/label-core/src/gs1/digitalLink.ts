/**
 * GS1 Digital Link URIs.
 *
 * A Digital Link turns an identifier into a resolvable web address, so one 2D
 * symbol serves both a point-of-sale scanner and a shopper's phone. This is the
 * mechanism behind GS1's Sunrise 2027 push toward 2D barcodes at retail.
 *
 *   https://example.com/gtin/09506000134352/lot/ABC123?17=261231
 *
 * Structure is hierarchical and the order is not free: a primary key opens the
 * path, key qualifiers follow it in a defined sequence, and everything else is
 * an attribute in the query string.
 */

import { getAiSpec } from './applicationIdentifiers'
import { isValidCheckDigit, normaliseToGtin14 } from './checkDigit'
import type { Gs1Element } from './elementString'

export class DigitalLinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DigitalLinkError'
  }
}

/**
 * Qualifier sequence per primary key. Order is normative — the same qualifiers
 * in a different order produce a different, non-canonical URI.
 *
 * TODO(expand): only GTIN's sequence is encoded. Add others from the Digital
 * Link URI Syntax standard as the app starts generating those keys.
 */
const QUALIFIER_ORDER: Record<string, readonly string[]> = {
  '01': ['22', '10', '21'],
}

export interface DigitalLinkInput {
  /** Resolver origin, e.g. 'https://id.example.com'. Trailing slash optional. */
  domain: string
  primary: Gs1Element
  /** Key qualifiers such as lot (10) or serial (21). Reordered automatically. */
  qualifiers?: readonly Gs1Element[]
  /** Non-qualifying data such as expiry (17). Always lands in the query string. */
  attributes?: readonly Gs1Element[]
  /**
   * When true, uses GS1's convenience alphas (`/gtin/`, `/lot/`, `/ser/`)
   * instead of raw numeric AIs. More readable; both forms are valid.
   */
  useConvenienceAlphas?: boolean
}

function segmentFor(element: Gs1Element, useAlphas: boolean): string {
  const spec = getAiSpec(element.ai)
  if (!spec) throw new DigitalLinkError(`Unknown Application Identifier (${element.ai})`)
  const key = useAlphas && spec.digitalLinkAlpha ? spec.digitalLinkAlpha : element.ai
  return `${key}/${encodeURIComponent(element.value)}`
}

export function buildDigitalLinkUri(input: DigitalLinkInput): string {
  const { domain, primary, qualifiers = [], attributes = [], useConvenienceAlphas = true } = input

  const primarySpec = getAiSpec(primary.ai)
  if (!primarySpec?.primaryKey) {
    throw new DigitalLinkError(
      `AI (${primary.ai}) cannot open a Digital Link path — it is not a primary key`,
    )
  }

  // A GTIN is always expressed in its 14-digit form in a Digital Link, so the
  // same product yields one canonical URI regardless of which GTIN length is
  // printed on the pack.
  const primaryValue = primary.ai === '01' ? normaliseToGtin14(primary.value) : primary.value
  if (!isValidCheckDigit(primaryValue)) {
    throw new DigitalLinkError(`Check digit is invalid for ${primarySpec.title} "${primaryValue}"`)
  }

  const order = QUALIFIER_ORDER[primary.ai] ?? []

  // Validated in its own pass, deliberately not inside the comparator below:
  // Array.prototype.sort never invokes the comparator for a zero- or
  // one-element array, so validating there lets a single bad qualifier through
  // silently and rejects it only once a second one shows up.
  for (const qualifier of qualifiers) {
    if (!order.includes(qualifier.ai)) {
      throw new DigitalLinkError(
        `AI (${qualifier.ai}) is not a key qualifier for ${primarySpec.title}. ` +
          'Non-qualifying data belongs in the query string as an attribute.',
      )
    }
  }

  const ordered = [...qualifiers].sort((a, b) => order.indexOf(a.ai) - order.indexOf(b.ai))

  const origin = domain.replace(/\/+$/, '')
  const path = [
    segmentFor({ ai: primary.ai, value: primaryValue }, useConvenienceAlphas),
    ...ordered.map((q) => segmentFor(q, useConvenienceAlphas)),
  ].join('/')

  // Attributes stay numeric in the query string — the convenience alphas are a
  // path-segment convention only.
  const query = attributes.map(({ ai, value }) => `${ai}=${encodeURIComponent(value)}`).join('&')

  return `${origin}/${path}${query ? `?${query}` : ''}`
}
