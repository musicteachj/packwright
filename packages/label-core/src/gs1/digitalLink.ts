/**
 * GS1 Digital Link URIs.
 *
 * A Digital Link turns an identifier into a resolvable web address, so one 2D
 * symbol serves both a point-of-sale scanner and a shopper's phone. This is the
 * mechanism behind GS1's Sunrise 2027 push toward 2D barcodes at retail.
 *
 *   https://example.com/01/09506000134352/10/ABC123?17=261231
 *
 * Structure is hierarchical and the order is not free: a primary key opens the
 * path, key qualifiers follow it in a defined sequence, and everything else is
 * an attribute in the query string.
 */

import { getAiSpec, listAiSpecs, validateAiValue } from './applicationIdentifiers'
import { GS1_KEY_LENGTHS, isValidCheckDigit, normaliseToGtin14 } from './checkDigit'
import type { Gs1Element } from './elementString'

/**
 * The GTIN lengths that may legitimately appear on a pack. Drawn from the
 * shared key-length table rather than restated, so the two cannot drift — and
 * narrowed to GTINs, since SSCC's 18 is not a valid GTIN length.
 */
const GTIN_LENGTHS = new Set<number>([
  GS1_KEY_LENGTHS['GTIN-8'],
  GS1_KEY_LENGTHS['GTIN-12'],
  GS1_KEY_LENGTHS['GTIN-13'],
  GS1_KEY_LENGTHS['GTIN-14'],
])

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
   * Emits GS1's convenience alphas (`/gtin/`, `/lot/`, `/ser/`) in place of the
   * numeric AIs.
   *
   * **Produces a non-conformant URI.** Removed outright in Digital Link URI
   * Syntax 1.3.0. From §8.2, "Changes since version 1.2.1", read from the
   * standard at release 1.7.0 on 2026-09-17: "Convenience alphas, deprecated in
   * version 1.2.0, and explained in section 4.1, have now been removed so that,
   * for example, 'gtin' cannot be used instead of '01' in the path." Retained
   * only for round-tripping URIs generated before the removal, and off by
   * default.
   *
   * **The standard gives two answers for when they were deprecated** and this
   * note keeps both rather than choosing: §8.2 above says "version 1.2.0",
   * while §4.1 says "marked as deprecated in version 1.2 of the standard". The
   * rule in `rules/gs1/digitalLink.ts` cites §4.1, so its message follows §4.1.
   * Nothing turns on it — the removal release, which is what makes a URI
   * non-conformant, is 1.3.0 in both.
   *
   * @deprecated Removed from the standard in Digital Link URI Syntax 1.3.0.
   */
  useConvenienceAlphas?: boolean
}

/*
 * A GS1 value in a Digital Link, by URI Syntax 1.7.0 §4.2, "Character sets", read from
 * https://ref.gs1.org/standards/digital-link/uri-syntax/ on 2026-10-16. `XCHAR = DIGIT /
 * UPPERALPHA / LOWERALPHA / XSYMBOL`, and XSYMBOL's members are written encoded,
 * `LeftAngleBracket = "%3C"`, `LeftBracket = "%28"` and so on, for every symbol but
 * "-", "." and "_" and the double quote, `DoubleQuote = '"'`. §4.6 builds the lot and
 * serial from XCHAR. RFC 3986, read from rfc-editor.org the same day, allows a double
 * quote in a URI only encoded (it is in neither `unreserved`, §2.3, nor `reserved`,
 * §2.2), so no form of one satisfies both, and the rule stands down on it.
 */

/**
 * A value as §4.2 writes it. `encodeURIComponent` leaves `! ' ( ) *` as they are, and
 * §4.2 writes each one encoded, so a lot of `A(1)` built `/10/A(1)` and passed (found
 * 2026-10-16, fixing the medium review of dev).
 */
function encodedValue(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (symbol) => `%${symbol.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/**
 * The XSYMBOL members §4.2 writes encoded, from its own list. A character outside XCHAR
 * altogether, `~` or a letter with an accent, is not one, and is said so (found by review).
 */
const ENCODED_XSYMBOLS = new Set([
  '!',
  '%',
  '&',
  '+',
  ',',
  '/',
  '*',
  '(',
  ')',
  "'",
  ';',
  ':',
  '<',
  '=',
  '>',
  '?',
])

/**
 * The first character of a value as printed that §4.2 does not allow unencoded, if any. A letter
 * or digit encoded needlessly, `%41` for `A`, is let through: RFC 3986 §2.3 says the two
 * forms "are equivalent: they identify the same resource".
 */
function unencodedSymbol(printed: string): string | undefined {
  return [...printed.replace(/%[0-9A-Fa-f]{2}/g, '')].find(
    (character) => !/^[A-Za-z0-9._"-]$/.test(character),
  )
}

function segmentFor(element: Gs1Element, useAlphas: boolean): string {
  const spec = getAiSpec(element.ai)
  if (!spec) throw new DigitalLinkError(`Unknown Application Identifier (${element.ai})`)
  const key = useAlphas && spec.digitalLinkAlpha ? spec.digitalLinkAlpha : element.ai
  return `${key}/${encodedValue(element.value)}`
}

/**
 * A resolver domain without its trailing slashes, as the builder prints it, short of the
 * "//" after the scheme: `https://` became `https:` and built `https:/01/…`, faulted under
 * §4 where the empty host the user gave is one §4.11 allows (found by review).
 */
export function withoutTrailingSlashes(domain: string): string {
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(domain)?.[0] ?? ''
  return scheme + domain.slice(scheme.length).replace(/\/+$/, '')
}

export function buildDigitalLinkUri(input: DigitalLinkInput): string {
  const { domain, primary, qualifiers = [], attributes = [], useConvenienceAlphas = false } = input

  const primarySpec = getAiSpec(primary.ai)
  if (!primarySpec?.primaryKey) {
    throw new DigitalLinkError(
      `AI (${primary.ai}) cannot open a Digital Link path — it is not a primary key`,
    )
  }

  // Length is checked against the key *as printed*, before any widening.
  // Left-padding a GTIN with zeros cannot change its check digit — the 3/1
  // weighting is anchored to the right, and a leading zero contributes nothing
  // at either weight — so a five-digit key normalises into a well-formed
  // GTIN-14 and the check-digit guard below has nothing left to catch.
  if (primary.ai === '01') {
    // Digits are checked here rather than left to `normaliseToGtin14`, which
    // raises Gs1FormatError — a type callers of this module have no reason to
    // catch. Every rejection from this function should be a DigitalLinkError.
    if (!/^[0-9]+$/.test(primary.value)) {
      throw new DigitalLinkError(`A GTIN is digits only, received "${primary.value}"`)
    }
    if (!GTIN_LENGTHS.has(primary.value.length)) {
      throw new DigitalLinkError(
        `A GTIN is 8, 12, 13 or 14 digits, received ${primary.value.length} ("${primary.value}")`,
      )
    }
  } else {
    const reason = validateAiValue(primary.ai, primary.value)
    if (reason) throw new DigitalLinkError(reason)
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
  const seen = new Set<string>()
  for (const qualifier of qualifiers) {
    if (!order.includes(qualifier.ai)) {
      throw new DigitalLinkError(
        `AI (${qualifier.ai}) is not a key qualifier for ${primarySpec.title}. ` +
          'Non-qualifying data belongs in the query string as an attribute.',
      )
    }
    // A repeated qualifier sorts into an arbitrary order and yields a path like
    // /10/A/10/B, which names two different things at once.
    if (seen.has(qualifier.ai)) {
      throw new DigitalLinkError(`AI (${qualifier.ai}) appears more than once in the path`)
    }
    seen.add(qualifier.ai)

    const reason = validateAiValue(qualifier.ai, qualifier.value)
    if (reason) throw new DigitalLinkError(reason)
  }

  // Attributes were validated nowhere at all, so an empty or malformed value
  // reached the query string even though the same value is rejected outright on
  // the element-string path.
  for (const attribute of attributes) {
    const reason = validateAiValue(attribute.ai, attribute.value)
    if (reason) throw new DigitalLinkError(reason)
  }

  const ordered = [...qualifiers].sort((a, b) => order.indexOf(a.ai) - order.indexOf(b.ai))

  const origin = withoutTrailingSlashes(domain)
  const path = [
    segmentFor({ ai: primary.ai, value: primaryValue }, useConvenienceAlphas),
    ...ordered.map((q) => segmentFor(q, useConvenienceAlphas)),
  ].join('/')

  // Attributes stay numeric in the query string — the convenience alphas are a
  // path-segment convention only.
  const query = attributes.map(({ ai, value }) => `${ai}=${encodedValue(value)}`).join('&')

  return `${origin}/${path}${query ? `?${query}` : ''}`
}

/**
 * A Digital Link as printed, taken apart: the stem it is served under, the primary
 * key, its qualifiers, the GS1 attributes in its query, and what this build could not
 * place.
 */
export interface ParsedDigitalLink {
  /** Scheme, host and any custom path segments before the primary key. */
  stem: string
  /** Absent where the path names a primary key this build does not hold. */
  primary?: Gs1Element
  qualifiers: Gs1Element[]
  attributes: Gs1Element[]
  /** The convenience alphas used in place of AIs, e.g. `['gtin']`. */
  convenienceAlphas: string[]
  /**
   * What this build cannot judge, each said in a phrase: a key or qualifier its tables
   * do not hold, an AI in the query it does not know, or one there it cannot place.
   * Kept apart from the errors it throws because the standard may well permit them:
   * `upui-path = gtin-comp tpx-comp` puts AI (235) after a GTIN, and this build's
   * qualifier table has only (22), (10) and (21). Calling a permitted link
   * non-conformant is a false finding under a citation nobody can argue with. An empty
   * host is listed here for the same reason: `reg-name` allows it.
   */
  unplaced: string[]
}

/** AI by its convenience alpha, from the same table `segmentFor` emits them from. */
const AI_BY_ALPHA = new Map<string, string>(
  listAiSpecs()
    .filter((spec) => spec.digitalLinkAlpha !== undefined)
    .map((spec) => [spec.digitalLinkAlpha!, spec.ai]),
)

/**
 * The primary keys GS1 Digital Link URI Syntax 1.7.0 defines a path for, from its
 * `gs1path` production and the `-code` rules beside it, read 2026-10-16: GTIN (01),
 * ITIP (8006), GMN (8013), CPID (8010), GLN (414), pay-to GLN (415), party GLN (417),
 * GSRN of a provider (8017) and of a recipient (8018), GCN (255), SSCC (00), GDTI
 * (253), GINC (401), GSIN (402), GRAI (8003) and GIAI (8004). A path opening with one
 * this build's table does not hold is a link it cannot judge; a path with none of
 * them is not a Digital Link.
 */
const DL_PRIMARY_KEY_CODES = new Set([
  '01',
  '8006',
  '8013',
  '8010',
  '414',
  '415',
  '417',
  '8017',
  '8018',
  '255',
  '00',
  '253',
  '401',
  '402',
  '8003',
  '8004',
])

/** A key as printed, numeric or a convenience alpha, as an AI this build holds. */
function keyFor(segment: string): { ai: string; alpha?: string } | undefined {
  if (/^[0-9]+$/.test(segment)) return getAiSpec(segment) ? { ai: segment } : undefined
  const ai = AI_BY_ALPHA.get(segment)
  return ai === undefined ? undefined : { ai, alpha: segment }
}

/** Whether a segment names a primary key, held here or only defined by the standard. */
function namesPrimaryKey(segment: string): boolean {
  const key = keyFor(segment)
  return (
    (key !== undefined && getAiSpec(key.ai)?.primaryKey === true) ||
    DL_PRIMARY_KEY_CODES.has(segment)
  )
}

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    throw new DigitalLinkError(`"${segment}" is not validly percent-encoded`)
  }
}

/*
 * The custom stem a Digital Link is served under, by the productions of URI Syntax
 * 1.7.0 §4.11, "Constructing the GS1 Digital Link URI", read from
 * https://ref.gs1.org/standards/digital-link/uri-syntax/ on 2026-10-16:
 *
 *   customURIstem = scheme "://" hostname *optionalPathSegment
 *   hostname = host [ ":" port]                   port = *DIGIT
 *   host = IP-literal / IPv4address / reg-name
 *   reg-name = *( unreserved / pct-encoded / sub-delims )
 *   IP-literal = "[" ( IPv6address / IPvFuture ) "]"
 *   optionalPathSegment = "/" segment             segment = *pchar
 *   pchar = unreserved / pct-encoded / sub-delims / ":" / "@"
 *
 * A host of letters, digits and hyphens alone faulted `id_example.com` and
 * `[2001:db8::1]` under §4, which permits both, and refused an empty stem segment that
 * `segment = *pchar` allows (found by review). IPv4address is not tested apart: every
 * one is also a reg-name.
 */
const UNRESERVED_AND_SUB_DELIMS = "A-Za-z0-9\\-._~!$&'()*+,;="
const REG_NAME = new RegExp(`^(?:[${UNRESERVED_AND_SUB_DELIMS}]|%[0-9A-Fa-f]{2})*$`)
const SEGMENT = new RegExp(`^(?:[${UNRESERVED_AND_SUB_DELIMS}:@]|%[0-9A-Fa-f]{2})*$`)
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/
const IPV_FUTURE = new RegExp(`^v[0-9A-Fa-f]+\\.[${UNRESERVED_AND_SUB_DELIMS}:]+$`, 'i')

/** IPv6address, by its nine alternatives: eight 16-bit groups, or fewer around one "::". */
function isIpv6(address: string): boolean {
  const halves = address.split('::')
  if (halves.length > 2) return false
  const groups = halves.map((half) => (half === '' ? [] : half.split(':')))
  const all = groups.flat()
  // ls32: the last 32 bits may be written as an IPv4 address, and only last.
  const last = all[all.length - 1]
  const endsInIpv4 =
    last !== undefined && IPV4.test(last) && (halves.length === 1 || groups[1]!.length > 0)
  const h16s = endsInIpv4 ? all.slice(0, -1) : all
  if (!h16s.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) return false
  const width = h16s.length + (endsInIpv4 ? 2 : 0)
  return halves.length === 2 ? width <= 7 : width === 8
}

/** What `hostname = host [ ":" port]` refuses in an authority, if anything. */
function hostnameFault(hostname: string): string | undefined {
  if (hostname.includes('@')) {
    return `"${hostname}" has user information before its host name, which a Digital Link does not take`
  }
  let host = hostname
  let port = ''
  if (hostname.startsWith('[')) {
    const close = hostname.indexOf(']')
    const literal = close === -1 ? '' : hostname.slice(1, close)
    if (close === -1 || !(isIpv6(literal) || IPV_FUTURE.test(literal))) {
      return `"${close === -1 ? hostname : hostname.slice(0, close + 1)}" is not an IP address`
    }
    const after = hostname.slice(close + 1)
    if (after !== '' && !after.startsWith(':')) return `"${hostname}" is not a host name`
    port = after.slice(1)
  } else {
    const colon = hostname.indexOf(':')
    if (colon !== -1) {
      host = hostname.slice(0, colon)
      port = hostname.slice(colon + 1)
    }
    if (!REG_NAME.test(host)) return `"${host}" is not a host name`
  }
  return /^[0-9]*$/.test(port) ? undefined : `"${port}" is not a port number`
}

/**
 * Judges a custom stem, `https://id.example.com/products` say, by the §4.11 productions
 * above: the fault where the grammar refuses it, or else its host. The host may be empty,
 * because `reg-name` allows it, and an empty host cannot resolve: what to say about
 * that is the caller's business.
 */
export function judgeCustomUriStem(stem: string): { fault: string } | { host: string } {
  const match = /^(https?):\/\/([^/?#]*)([^?#]*)([?#][\s\S]*)?$/i.exec(stem)
  if (!match) return { fault: 'it is not an http or https web address' }
  const [, , hostname = '', path = '', after] = match
  if (after !== undefined) {
    return {
      fault: `it ends in "${after}", a query or fragment, which would swallow the GS1 path after it`,
    }
  }
  const fault = hostnameFault(hostname)
  if (fault !== undefined) return { fault }
  const segment = path
    .split('/')
    .slice(1)
    .find((one) => !SEGMENT.test(one))
  if (segment !== undefined) {
    return { fault: `the path segment "${segment}" holds a character a URI must percent-encode` }
  }
  return { host: hostname.replace(/:[0-9]*$/, '') }
}

/**
 * Takes apart a Digital Link URI as printed on a label, so a rule can judge the
 * string itself rather than one rebuilt from fields somebody inferred from it.
 *
 * Follows GS1 Digital Link URI Syntax 1.7.0, read from
 * https://ref.gs1.org/standards/digital-link/uri-syntax/ on 2026-10-16:
 *
 * - "zero or more path segments are permitted to appear after the hostname or
 *   domain name and before the start of the gs1uriPattern" (`customURIstem =
 *   scheme "://" hostname *optionalPathSegment`), so the primary key is the first
 *   segment naming one whose value can be one, not the first segment;
 * - `gtin-path = gtin-comp [cpv-comp] [lot-comp] [ser-comp]`, in that order: a path
 *   such as `/01/09520123456788/21/12345XYZ/10/ABC123` "in which the sequential
 *   ordering of the key qualifier components is not preserved" is not permitted;
 * - the standard's own examples of permitted paths include one ending in a slash.
 *
 * **It throws only for what that grammar plainly refuses**: an address that is not
 * http or https, a stem `judgeCustomUriStem` faults, an empty segment from the primary
 * key on, a key with no value after it, GTIN qualifiers out of order, or no GS1 key at
 * all. What this build cannot place it lists in `unplaced` instead, and so is an empty
 * host, which the grammar allows and no resolver can serve. It records convenience alphas rather than refusing
 * them, because what to say about them is the rule's business (§4.1), and it does not
 * widen or check the GTIN: a short GTIN and a wrong check digit are judged by the
 * caller, which knows what the label's barcode carries.
 */
export function parseDigitalLinkUri(printed: string): ParsedDigitalLink {
  const uri = printed.trim()
  const match = /^(https?):\/\/([^/?#\s]*)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i.exec(uri)
  if (!match) {
    throw new DigitalLinkError(
      `"${uri}" is not an http or https web address with nothing but the address in it`,
    )
  }
  const [, scheme, host = '', path = '', query = ''] = match
  // The host first, so a bad one is named before a missing key; the stem is judged
  // whole once the key is found.
  const hostFault = hostnameFault(host)
  if (hostFault !== undefined) throw new DigitalLinkError(hostFault)

  const raw = path === '' ? [] : path.slice(1).split('/')
  // One trailing slash is permitted, as in the standard's own examples.
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()
  // Decoded to find the key, but a segment that is not UTF-8 is kept as printed rather
  // than refused: `pct-encoded` allows any octet in a stem, "caf%E9" included, and a
  // value is decoded strictly where it is placed (found by review).
  const segments = raw.map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
  const unplaced: string[] = []
  const convenienceAlphas: string[] = []

  // The primary key: of the segments naming one, with a value after them, the first
  // held key whose value could be that key's, so a stem segment spelled "gtin", "sscc"
  // or "414" before something else is not taken for it (found by review). Failing that,
  // the first key the standard defines and this build does not hold, unless its value
  // names a key itself, as "/414/01/12345" does. Failing that, the first held numeric
  // key, so the builder reports the malformed value as the fault it is:
  // "/01/00O36000291452", a letter O for a zero, is a bad GTIN, not a missing key, and
  // "/gtin/catalog/01/12345" is a short GTIN, not a convenience alpha.
  const candidates = segments.flatMap((segment, i) => {
    if (i + 1 >= segments.length) return []
    const key = keyFor(segment)
    if (key !== undefined && getAiSpec(key.ai)?.primaryKey) return [{ i, key, held: true }]
    if (DL_PRIMARY_KEY_CODES.has(segment)) return [{ i, key: { ai: segment }, held: false }]
    return []
  })
  if (candidates.length === 0) {
    const last = segments[segments.length - 1]
    if (last !== undefined && namesPrimaryKey(last)) {
      throw new DigitalLinkError(
        `"${last}" ends the path with no value after it, and no GS1 primary key with a value comes before it`,
      )
    }
    throw new DigitalLinkError('no GS1 primary key, such as /01/ and a GTIN, appears in the path')
  }
  const plausible = (candidate: (typeof candidates)[number]): boolean => {
    const value = segments[candidate.i + 1]!
    if (!candidate.held) return !namesPrimaryKey(value)
    return candidate.key.ai === '01'
      ? /^[0-9]+$/.test(value) && GTIN_LENGTHS.has(value.length)
      : validateAiValue(candidate.key.ai, value) === null
  }
  const chosen =
    candidates.find((candidate) => candidate.held && plausible(candidate)) ??
    candidates.find((candidate) => !candidate.held && plausible(candidate)) ??
    candidates.find((candidate) => candidate.held && candidate.key.alpha === undefined) ??
    candidates[0]!
  const start = chosen.i

  // `segment = *pchar` lets a stem segment be empty; from the key on, every component
  // has a value.
  if (raw.slice(start).some((segment) => segment === '')) {
    throw new DigitalLinkError('the path has an empty segment ("//") from its GS1 key on')
  }
  const stem = `${scheme}://${host}${raw
    .slice(0, start)
    .map((s) => `/${s}`)
    .join('')}`
  const judgedStem = judgeCustomUriStem(stem)
  if ('fault' in judgedStem) throw new DigitalLinkError(judgedStem.fault)
  if (judgedStem.host === '') unplaced.push('no host name, which no resolver can serve')

  let primary: Gs1Element | undefined
  // A value as printed, judged by §4.2 before it is decoded: decoding first passed
  // `/10/A<B`, where §4.2 writes `/10/A%3CB` (found 2026-10-16).
  const valueOf = (ai: string, printedValue: string): string => {
    const symbol = unencodedSymbol(printedValue)
    if (symbol !== undefined) {
      throw new DigitalLinkError(
        `the value of AI (${ai}), "${printedValue}", has "${symbol}" unencoded, ` +
          (ENCODED_XSYMBOLS.has(symbol)
            ? `which Digital Link URI Syntax 1.7.0 §4.2 writes "${encodedValue(symbol)}"`
            : 'which is not among the characters Digital Link URI Syntax 1.7.0 §4.2 allows'),
      )
    }
    if (/"|%22/i.test(printedValue)) {
      unplaced.push(
        `a double quote in the value of AI (${ai}), which Digital Link URI Syntax 1.7.0 ` +
          '§4.2 writes unencoded and RFC 3986 allows only encoded',
      )
    }
    return decoded(printedValue)
  }

  let rest: string[] = []
  if (!chosen.held) {
    // A key the standard defines and this build's table does not hold, such as a GLN:
    // nothing after it can be placed either.
    unplaced.push(`(${chosen.key.ai}) as its primary key, which this build does not hold`)
  } else {
    if (chosen.key.alpha !== undefined) convenienceAlphas.push(chosen.key.alpha)
    primary = { ai: chosen.key.ai, value: valueOf(chosen.key.ai, raw[start + 1]!) }
    rest = segments.slice(start + 2)
  }

  const qualifiers: Gs1Element[] = []
  if (primary !== undefined) {
    if (rest.length % 2 === 1) {
      throw new DigitalLinkError(`"${rest[rest.length - 1]}" has no value after it in the path`)
    }
    const order = QUALIFIER_ORDER[primary.ai] ?? []
    let last = -1
    for (let i = 0; i < rest.length; i += 2) {
      const key = keyFor(rest[i]!)
      const position = key === undefined ? -1 : order.indexOf(key.ai)
      if (key === undefined || position === -1) {
        unplaced.push(`(${rest[i]}) after the ${getAiSpec(primary.ai)?.title ?? primary.ai}`)
        continue
      }
      if (qualifiers.some((q) => q.ai === key.ai)) {
        throw new DigitalLinkError(`AI (${key.ai}) appears more than once in the path`)
      }
      if (position <= last) {
        throw new DigitalLinkError(
          'the key qualifiers are not in their defined order, ' +
            order.map((ai) => `(${ai})`).join(' then '),
        )
      }
      last = position
      if (key.alpha !== undefined) convenienceAlphas.push(key.alpha)
      qualifiers.push({ ai: key.ai, value: valueOf(key.ai, raw[start + 3 + i]!) })
    }
  }

  // GS1 attributes from the query. A numeric key is an AI whether or not the table
  // holds it; any other key is somebody else's business.
  const attributes: Gs1Element[] = []
  const inPath = new Set([primary?.ai, ...qualifiers.map((q) => q.ai)])
  // "Within the URI query string, key=value pairs may be concatenated using & or ; as
  // a delimiter" (URI Syntax 1.7.0, read 2026-10-16), so both split.
  for (const pair of query.slice(1).split(/[&;]/)) {
    if (pair === '') continue
    const at = pair.indexOf('=')
    const name = decoded(at === -1 ? pair : pair.slice(0, at))
    if (/^[0-9]+$/.test(name) && getAiSpec(name) === undefined) {
      unplaced.push(`AI (${name}) in its query, which this build does not hold`)
      continue
    }
    const key = keyFor(name)
    if (key === undefined) continue
    const spec = getAiSpec(key.ai)!
    if (spec.primaryKey || spec.qualifier || inPath.has(key.ai)) {
      unplaced.push(`AI (${key.ai}) in its query, where it is a key or qualifier`)
      continue
    }
    if (attributes.some((a) => a.ai === key.ai)) {
      unplaced.push(`AI (${key.ai}) more than once in its query`)
      continue
    }
    if (key.alpha !== undefined) convenienceAlphas.push(key.alpha)
    attributes.push({ ai: key.ai, value: at === -1 ? '' : valueOf(key.ai, pair.slice(at + 1)) })
  }

  return {
    // From the segments as printed, not decoded: the stem is an address, not data.
    stem,
    ...(primary === undefined ? {} : { primary }),
    qualifiers,
    attributes,
    convenienceAlphas,
    unplaced,
  }
}
