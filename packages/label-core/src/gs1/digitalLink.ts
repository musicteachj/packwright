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

import { CSET_82_CLASS, getAiSpec, listAiSpecs, validateAiValue } from './applicationIdentifiers'
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

/*
 * What may follow each primary key's value: the `gs1path` productions of URI Syntax 1.7.0
 * §4.9, "Path element order", with each component's code from its `-code` rule, read
 * from https://ref.gs1.org/standards/digital-link/uri-syntax/ on 2026-10-17. One list per
 * production, in order; a code ending "?" is optional, as the production's brackets mark
 * it. `upui-path = gtin-comp tpx-comp` is the second GTIN list, `fid-path`, `eoid-path`
 * and `mid-path` the (7040) lists. Every key's own path is the empty list or begins one.
 */
const PATHS: Record<string, readonly (readonly string[])[]> = {
  '01': [['22?', '10?', '21?'], ['235']], // gtin-path, upui-path
  '8006': [['22?', '10?', '21?']], // itip-path
  '8013': [[]], // gmn-path
  '8010': [['8011?']], // cpid-path
  '414': [['254?'], ['7040']], // gln-path, fid-path
  '415': [['8020']], // payTo-path
  '417': [[], ['7040']], // partyGln-path, eoid-path
  '8017': [['8019?']], // gsrnp-path
  '8018': [['8019?']], // gsrn-path
  '255': [[]], // gcn-path
  '00': [[]], // sscc-path
  '253': [[]], // gdti-path
  '401': [[]], // ginc-path
  '402': [[]], // gsin-path
  '8003': [[]], // grai-path
  '8004': [[], ['7040']], // giai-path, mid-path
}

/**
 * Qualifier sequence per primary key. Order is normative — the same qualifiers
 * in a different order produce a different, non-canonical URI. Taken from the GTIN's
 * `gtin-path` in `PATHS`, so the builder, the parser's loop and its readings share one
 * table (two drifted apart in review on #97).
 *
 * TODO(expand): only GTIN's sequence is encoded. Add others from the Digital
 * Link URI Syntax standard as the app starts generating those keys.
 */
const QUALIFIER_ORDER: Record<string, readonly string[]> = {
  '01': PATHS['01']![0]!.map((step) => step.replace('?', '')),
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
 * The XSYMBOL members §4.2 writes encoded, each with its encoding, transcribed from its
 * list on 2026-10-17: `Exclamation = "%21"`, `Percent = "%25"`, `Ampersand = "%26"`,
 * `Plus = "%2B"`, `Comma = "%2C"`, `ForwardSlash = "%2F"`, `Asterisk = "%2A"`,
 * `LeftBracket = "%28"`, `RightBracket = "%29"`, `Apostrophe = "%27"`, `Semicolon =
 * "%3B"`, `Colon = "%3A"`, `LeftAngleBracket = "%3C"`, `RightAngleBracket = "%3E"`,
 * `Equals = "%3D"` and `QuestionMark = "%3F"`. XSYMBOL's other members, "-", "." and "_"
 * and the double quote, are written as they are. The one source for the builder and the
 * parser both: a set derived from `encodeURIComponent` held only by coincidence of its
 * unreserved set (found by review on #97).
 */
const XSYMBOL_ENCODED: Readonly<Record<string, string>> = {
  '!': '%21',
  '%': '%25',
  '&': '%26',
  '+': '%2B',
  ',': '%2C',
  '/': '%2F',
  '*': '%2A',
  '(': '%28',
  ')': '%29',
  "'": '%27',
  ';': '%3B',
  ':': '%3A',
  '<': '%3C',
  '>': '%3E',
  '=': '%3D',
  '?': '%3F',
}

/**
 * A value as §4.2 writes it: letters, digits, "-", "." and "_" as they are, the symbols
 * in `XSYMBOL_ENCODED` as it gives them, and anything else, the double quote included,
 * as RFC 3986 percent-encodes it. `encodeURIComponent` alone left `! ' ( ) *` as they
 * are, so a lot of `A(1)` built `/10/A(1)` and passed (found 2026-10-16).
 */
function encodedValue(value: string): string {
  return [...value]
    .map(
      (character) =>
        XSYMBOL_ENCODED[character] ??
        (/^[A-Za-z0-9._-]$/.test(character) ? character : encodeURIComponent(character)),
    )
    .join('')
}

/**
 * The first letter, digit, "-", "." or "_" in a value as printed that is percent-encoded,
 * if any. §4.2 writes each as it is, and James chose on 2026-10-17 to follow the grammar
 * rather than RFC 3986 §2.3's equivalence of the two forms, which also says such
 * encodings "should not be created by URI producers".
 */
function overEncoded(printed: string): string | undefined {
  return printed
    .match(/%[0-9A-Fa-f]{2}/g)
    ?.find((triplet) =>
      /^[A-Za-z0-9._-]$/.test(String.fromCharCode(parseInt(triplet.slice(1), 16))),
    )
}

/**
 * The first character of a value as printed that §4.2 does not allow unencoded, if any. A letter
 * or digit encoded needlessly is `overEncoded`'s business.
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
  /**
   * The keys of query parameters that are not GS1's, judged as RFC 3986 text and no
   * further, so a pass can say so: §4.10.1's own grammar for them is not judged.
   */
  extensions: string[]
}

/** AI by its convenience alpha, from the same table `segmentFor` emits them from. */
const AI_BY_ALPHA = new Map<string, string>(
  listAiSpecs()
    .filter((spec) => spec.digitalLinkAlpha !== undefined)
    .map((spec) => [spec.digitalLinkAlpha!, spec.ai]),
)

/**
 * The primary keys GS1 Digital Link URI Syntax 1.7.0 defines a path for, the keys of
 * `PATHS`: GTIN (01), ITIP (8006), GMN (8013), CPID (8010), GLN (414), pay-to GLN (415),
 * party GLN (417), GSRN of a provider (8017) and of a recipient (8018), GCN (255), SSCC
 * (00), GDTI (253), GINC (401), GSIN (402), GRAI (8003) and GIAI (8004). Derived, not
 * restated: three hand-kept copies of the list were one missed edit from disagreeing
 * (found by review on #97). A path opening with one this build's table does not hold is
 * a link it cannot judge; a path with none of them is not a Digital Link.
 */
const DL_PRIMARY_KEY_CODES = new Set(Object.keys(PATHS))

/*
 * Each primary key's value, decoded, by the formats of URI Syntax 1.7.0 §4.5, "Primary
 * identification key formats", with each key's code from its `-code` rule, read from
 * https://ref.gs1.org/standards/digital-link/uri-syntax/ on 2026-10-17. XCHAR is §4.2's
 * 82-character set and YCHAR its 39-character one (DIGIT, UPPERALPHA, "-", "#" and "/").
 * Format only: the check digits the General Specifications add are not looked at here.
 * The GTIN is left out, since a short one printed is a key to judge, not a stem segment.
 *
 * Used to tell a key from a stem segment that happens to share its code, for every key
 * alike: any value once counted after a key this build's table does not hold, so the
 * verdict on a link turned on which keys the table held (found by review on #97).
 */
const X = `[${CSET_82_CLASS}]`
const Y = '[0-9A-Z\\-#/]'
const KEY_VALUE_FORMAT: Record<string, RegExp> = {
  '8006': /^[0-9]{18}$/, // itip-value = 14DIGIT 2DIGIT 2DIGIT
  '8013': new RegExp(`^${X}{1,25}$`), // gmn-value = 1*25 XCHAR
  '8010': new RegExp(`^${Y}{1,30}$`), // cpid-value = 1*30 YCHAR
  '414': /^[0-9]{13}$/, // gln-value = 13DIGIT
  '415': /^[0-9]{13}$/, // payTo-value = 13DIGIT
  '417': /^[0-9]{13}$/, // partyGln-value = 13DIGIT
  '8017': /^[0-9]{18}$/, // gsrnp-value = 18DIGIT
  '8018': /^[0-9]{18}$/, // gsrn-value = 18DIGIT
  '255': /^[0-9]{13,25}$/, // gcn-value = 13DIGIT [1*12DIGIT]
  '00': /^[0-9]{18}$/, // sscc-value = 18DIGIT
  '253': new RegExp(`^[0-9]{13}${X}{0,17}$`), // gdti-value = 13DIGIT [1*17XCHAR]
  '401': new RegExp(`^${X}{1,30}$`), // ginc-value = 1*30XCHAR
  '402': /^[0-9]{17}$/, // gsin-value = 17DIGIT
  '8003': new RegExp(`^[0-9]{13}${X}{0,16}$`), // grai-value = 13DIGIT [1*16XCHAR]
  '8004': new RegExp(`^${X}{1,30}$`), // giai-value = 1*30 XCHAR
}

/** Whether the component codes after a key's value make one of its paths. */
function followsPath(key: string, codes: readonly string[]): boolean {
  return (PATHS[key] ?? []).some((path) => {
    let at = 0
    for (const step of path) {
      const optional = step.endsWith('?')
      if (codes[at] === (optional ? step.slice(0, -1) : step)) at += 1
      else if (!optional) return false
    }
    return at === codes.length
  })
}

/** Whether any of a key's paths takes a component with this code. */
function followsPathAnywhere(key: string, code: string): boolean {
  return (PATHS[key] ?? []).some((path) => path.some((step) => step.replace('?', '') === code))
}

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

/** Decoded where it can be; as printed where it is not UTF-8, which `pct-encoded` allows. */
function leniently(printed: string): string {
  try {
    return decodeURIComponent(printed)
  } catch {
    return printed
  }
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
/**
 * RFC 3986 §3.4 and §3.5, read from rfc-editor.org on 2026-10-17, give the query and the
 * fragment one body: `query = *( pchar / "/" / "?" )`, `fragment = *( pchar / "/" / "?" )`.
 */
const QUERY_OR_FRAGMENT = new RegExp(`^(?:[${UNRESERVED_AND_SUB_DELIMS}:@/?]|%[0-9A-Fa-f]{2})*$`)
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
 *   scheme "://" hostname *optionalPathSegment`), so the primary key is where the one
 *   reading of the path the grammar allows begins, not the first segment;
 * - `gtin-path = gtin-comp [cpv-comp] [lot-comp] [ser-comp]`, in that order: a path
 *   such as `/01/09520123456788/21/12345XYZ/10/ABC123` "in which the sequential
 *   ordering of the key qualifier components is not preserved" is not permitted;
 * - the standard's own examples of permitted paths include one ending in a slash.
 *
 * **It throws only for what that grammar plainly refuses**: an address that is not
 * http or https; a stem `judgeCustomUriStem` faults; no GS1 key at all, or a key with
 * no value after it; where several segments name a key and no reading of the path from
 * any of them is a `gs1path` production, each reading's fault, in one message; where
 * one does, a key's value outside its §4.5 format, for a key this build does not hold
 * (a held key's value is the builder's to refuse), or a path no production allows,
 * from a component that may follow the key in none to GTIN qualifiers out of order or
 * repeated; an empty segment from the key on; any GS1 value, placed or not, with a
 * symbol §4.2 writes encoded left unencoded, or a letter or digit it writes as it is
 * encoded; a query parameter that is empty, has no key or has no "=", against §4.11
 * and §4.10.1; one not judged as a GS1 attribute that RFC 3986 §3.4 does not allow; a
 * query key that decodes to digits, which §4.10.1 forbids an extension; and a fragment
 * RFC 3986 §3.5 does not allow. Codes, in the path and the query, are otherwise
 * matched as printed. What this build cannot judge it lists in `unplaced` instead: a
 * key its table does not hold, a UPUI's (235), a query AI it does not know, a double
 * quote in a GS1 value, a well-formed fragment, and an empty host, which the grammar
 * allows and no resolver can serve. The keys of parameters that are not GS1's it lists
 * in `extensions`. It records convenience alphas rather than refusing them, because
 * what to say about them is the rule's business (§4.1), and it does not widen or check
 * a GTIN it reads from a single key: a short GTIN and a wrong check digit are judged
 * by the caller, which knows what the label's barcode carries.
 */
export function parseDigitalLinkUri(printed: string): ParsedDigitalLink {
  const uri = printed.trim()
  const match = /^(https?):\/\/([^/?#\s]*)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i.exec(uri)
  if (!match) {
    throw new DigitalLinkError(
      `"${uri}" is not an http or https web address with nothing but the address in it`,
    )
  }
  const [, scheme, host = '', path = '', query = '', fragment] = match
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
  const segments = raw.map(leniently)
  // A value as printed, judged by §4.2 before it is decoded: decoding first passed
  // `/10/A<B`, where §4.2 writes `/10/A%3CB` (found 2026-10-16). What it cannot judge,
  // it says into `unplaced`.
  const valueOf = (ai: string, printedValue: string, unplaced: string[]): string => {
    const needless = overEncoded(printedValue)
    if (needless !== undefined) {
      throw new DigitalLinkError(
        `the value of AI (${ai}), "${printedValue}", has "${needless}" encoded, which ` +
          'Digital Link URI Syntax 1.7.0 §4.2 writes as it is',
      )
    }
    const symbol = unencodedSymbol(printedValue)
    if (symbol !== undefined) {
      throw new DigitalLinkError(
        `the value of AI (${ai}), "${printedValue}", has "${symbol}" unencoded, ` +
          (XSYMBOL_ENCODED[symbol] !== undefined
            ? `which Digital Link URI Syntax 1.7.0 §4.2 writes "${XSYMBOL_ENCODED[symbol]}"`
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

  // The primary key. Each segment naming one, with a value after it, opens a reading of
  // the path: the segments before it are the stem, and the rest must be one of the
  // `gs1path` productions (`PATHS`). A reading lives where the value fits its key's §4.5
  // format and the rest fits the key's path. At most one can: no key's code is among the
  // codes a path lets follow a key, so a later key always breaks every earlier reading.
  // Codes are matched as printed, not decoded: §4's grammar writes "01", and "%30%31" is
  // a stem segment, not a key (found by review on #97).
  const candidates = raw.flatMap((segment, i) => {
    if (i + 1 >= raw.length || !namesPrimaryKey(segment)) return []
    const key = keyFor(segment)
    return key !== undefined && getAiSpec(key.ai)?.primaryKey
      ? [{ i, key, held: true }]
      : [{ i, key: { ai: segment }, held: false }]
  })
  type Candidate = (typeof candidates)[number]
  if (candidates.length === 0) {
    const last = raw[raw.length - 1]
    if (last !== undefined && namesPrimaryKey(last)) {
      throw new DigitalLinkError(
        `"${last}" ends the path with no value after it, and no GS1 primary key with a value comes before it`,
      )
    }
    const encoded = raw.find(
      (segment, i) => segment !== segments[i] && namesPrimaryKey(segments[i]!),
    )
    throw new DigitalLinkError(
      'no GS1 primary key, such as /01/ and a GTIN, appears in the path' +
        (encoded === undefined
          ? ''
          : `: "${encoded}" decodes to one, and Digital Link URI Syntax 1.7.0 §4 writes a key's code as it is`),
    )
  }
  const valueFits = (candidate: Candidate): boolean => {
    const value = segments[candidate.i + 1]!
    if (candidate.key.ai === '01') return /^[0-9]+$/.test(value) && GTIN_LENGTHS.has(value.length)
    return KEY_VALUE_FORMAT[candidate.key.ai]?.test(value) ?? false
  }
  const pathFits = (candidate: Candidate): boolean => {
    const rest = raw.slice(candidate.i + 2)
    if (rest.length % 2 === 1 || raw.slice(candidate.i).some((segment) => segment === '')) {
      return false
    }
    const codes = rest.filter((_, k) => k % 2 === 0).map((code) => keyFor(code)?.ai ?? code)
    return followsPath(candidate.key.ai, codes)
  }

  /** Why a key's value is not one of its format, in one wording for every caller. */
  const valueFault = (candidate: Candidate): string => {
    const value = raw[candidate.i + 1]!
    return candidate.key.ai === '01'
      ? `"${value}" is not a GTIN of 8, 12, 13 or 14 digits`
      : `"${value}" after (${candidate.key.ai}) is not a value Digital Link URI Syntax ` +
          '1.7.0 §4.5 allows for that key'
  }

  /** The path read from one key: what it places, or the first thing it refuses. */
  const readFrom = (chosen: Candidate) => {
    const unplaced: string[] = []
    const convenienceAlphas: string[] = []
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
    let rest: string[] = []
    if (!chosen.held) {
      // A key the standard defines and this build's table does not hold, such as a GLN:
      // nothing after it can be judged either, but a value or a path the grammar refuses
      // is. Its value is judged by §4.2 like any other.
      valueOf(chosen.key.ai, raw[start + 1]!, unplaced)
      if (!valueFits(chosen)) throw new DigitalLinkError(valueFault(chosen))
      if (!pathFits(chosen)) {
        throw new DigitalLinkError(
          `what follows (${chosen.key.ai}) ${raw[start + 1]} is no GS1 Digital Link path for it`,
        )
      }
      // The values of its components too: §4.2 governs every GS1 value, placed or not
      // (found by review on #97, which met a raw "<" after (254) stood down as a limit).
      for (let k = start + 3; k < raw.length; k += 2) valueOf(raw[k - 1]!, raw[k]!, unplaced)
      unplaced.push(`(${chosen.key.ai}) as its primary key, which this build does not hold`)
    } else {
      if (chosen.key.alpha !== undefined) convenienceAlphas.push(chosen.key.alpha)
      primary = { ai: chosen.key.ai, value: valueOf(chosen.key.ai, raw[start + 1]!, unplaced) }
      rest = raw.slice(start + 2)
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
          const title = getAiSpec(primary.ai)?.title ?? primary.ai
          // A component some path lets follow this key, as (235) follows a GTIN in a UPUI
          // path, is one this build cannot judge; any other, no path allows.
          if (!followsPathAnywhere(primary.ai, key?.ai ?? rest[i]!)) {
            const meant = keyFor(segments[start + 2 + i]!)
            throw new DigitalLinkError(
              `(${rest[i]}) cannot follow the ${title} in any GS1 Digital Link path` +
                (meant === undefined || rest[i] === segments[start + 2 + i]
                  ? ''
                  : `: it decodes to (${meant.ai}), and Digital Link URI Syntax 1.7.0 §4 writes a code as it is`),
            )
          }
          valueOf(rest[i]!, raw[start + 3 + i]!, unplaced)
          unplaced.push(`(${rest[i]}) after the ${title}`)
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
        qualifiers.push({ ai: key.ai, value: valueOf(key.ai, raw[start + 3 + i]!, unplaced) })
      }
      // Each component may follow the key in some path and the whole still be none: a
      // UPUI path is the GTIN and (235) alone, so `/235/X/10/L` is no path (found by review).
      if (!pathFits(chosen)) {
        throw new DigitalLinkError(
          `what follows the ${getAiSpec(primary.ai)?.title ?? primary.ai} is no GS1 Digital Link path for it`,
        )
      }
    }
    return { stem, primary, qualifiers, convenienceAlphas, unplaced }
  }

  /**
   * What is wrong with one reading that does not live: its key's value first, then the
   * first thing its path refuses. `readFrom` throws for every path that does not fit, so
   * a held key with a sound value cannot reach the end here.
   */
  const faultOf = (candidate: Candidate): string => {
    if (!valueFits(candidate)) return valueFault(candidate)
    try {
      readFrom(candidate)
    } catch (error) {
      if (!(error instanceof DigitalLinkError)) throw error
      return error.message
    }
    throw new Error(`a reading from (${candidate.key.ai}) neither lives nor fails`)
  }

  // Where one reading lives, the path is read from it. Where none does and there was one
  // key, it is read from that key, so the builder names a malformed value as the fault it
  // is ("/01/00O36000291452", a letter O for a zero, is a bad GTIN). Where none does and
  // there were several, each reading's fault is said: four rounds of review on #97 found
  // every rule for which reading the printer meant blaming some segment wrongly, the
  // last for "/00/<SSCC>/01/0950600O134352", so nothing here guesses any more.
  const live = candidates.find((candidate) => valueFits(candidate) && pathFits(candidate))
  if (live === undefined && candidates.length > 1) {
    throw new DigitalLinkError(
      'no reading of the path is a GS1 Digital Link path: ' +
        candidates
          .map(
            (candidate) =>
              `read from "${raw[candidate.i]}/${raw[candidate.i + 1]}", ${faultOf(candidate)}`,
          )
          .join('; '),
    )
  }
  // The path first, so its faults are named before the query's or the fragment's.
  const { stem, primary, qualifiers, convenienceAlphas, unplaced } = readFrom(
    live ?? candidates[0]!,
  )

  // A well-formed fragment is in no production of §4's grammar, which governs, while §3,
  // which is informative, describes one as an optional part of any Web URI; and none
  // reaches a resolver. Faulting it would be a finding the standard does not plainly
  // support, and passing it passed (found by `/code-review high` on #97): stood down.
  // One RFC 3986 refuses makes the string no URI under any reading, and is refused:
  // `fragment = *( pchar / "/" / "?" )` (§3.5, read from rfc-editor.org on 2026-10-17).
  // `#<a%ZZ#b>` breaks it three times (found by review on #97).
  if (fragment !== undefined && !QUERY_OR_FRAGMENT.test(fragment.slice(1))) {
    throw new DigitalLinkError(
      `the fragment "${fragment}" is not one RFC 3986 §3.5 allows, so the link is no web address`,
    )
  }
  if (fragment !== undefined) {
    unplaced.push(
      `a fragment, "${fragment}", which the grammar of Digital Link URI Syntax 1.7.0 §4 ` +
        'has no place for, and its informative §3 describes as part of a Web URI',
    )
  }

  // GS1 attributes from the query. A numeric key is an AI whether or not the table
  // holds it; any other key is somebody else's business.
  const attributes: Gs1Element[] = []
  const extensions: string[] = []
  const inPath = new Set([primary?.ai, ...qualifiers.map((q) => q.ai)])
  // "Within the URI query string, key=value pairs may be concatenated using & or ; as
  // a delimiter" (URI Syntax 1.7.0, read 2026-10-16), so both split.
  for (const pair of query === '' ? [] : query.slice(1).split(/[&;]/)) {
    // `queryStringComp = "?" queryStringParam *( queryStringDelim queryStringParam )`
    // (§4.11, read 2026-10-17): a parameter after the "?" and after every delimiter. An
    // empty query and a stray "&" passed (found by `/code-review high` on #97).
    if (pair === '') {
      throw new DigitalLinkError(
        'the query has an empty parameter, where Digital Link URI Syntax 1.7.0 §4.11 ' +
          'has one after the "?" and after every "&" or ";"',
      )
    }
    const at = pair.indexOf('=')
    // Every `queryStringParam` §4.11 lists, an AI's or an extension's, is a key, "=" and a
    // value: `extensionParameter = extensionKey "=" extensionValue` (§4.10.1). `?foo`
    // passed, as somebody else's parameter (found by `/code-review high` on #97).
    if (at === -1) {
      throw new DigitalLinkError(
        `the query parameter "${pair}" has no "=", which every parameter Digital Link URI ` +
          'Syntax 1.7.0 §4.11 lists has',
      )
    }
    if (pair.startsWith('=')) {
      throw new DigitalLinkError(
        `the query parameter "${pair}" has no key, which every parameter Digital Link URI ` +
          'Syntax 1.7.0 §4.11 lists opens with',
      )
    }
    // Matched as printed, as a path's codes are: §4 writes an AI's code as it is.
    const name = pair.slice(0, at)
    // But a key that decodes to digits is no extension key either: "Any key=value pairs
    // used for extension data SHALL NOT use all-numeric keys to avoid conflict with
    // existing and future keys used for GS1 Application Identifiers" (URI Syntax 1.7.0
    // §4.10.1, read 2026-10-17). `?%31%37=999999` passed as somebody else's parameter,
    // while a resolver normalizing it reads an expiry (found by review on #97).
    const decodedName = leniently(name)
    if (decodedName !== name && /^[0-9]+$/.test(decodedName)) {
      throw new DigitalLinkError(
        `the query key "${name}" decodes to "${decodedName}", and Digital Link URI Syntax ` +
          '1.7.0 §4.10.1 says extension keys "SHALL NOT use all-numeric keys", while §4 ' +
          "writes an AI's code as it is",
      )
    }
    // A parameter whose value is not judged as a GS1 attribute's is judged as URI text:
    // `query = *( pchar / "/" / "?" )` (RFC 3986 §3.4, read 2026-10-17). One that is not
    // GS1's was skipped unread, so `?x=<script>` passed as conformant (found by
    // `/code-review high` on #97). A GS1 attribute's value goes to `valueOf` instead, which
    // stands down on the double quote §4.2 writes unencoded rather than refusing it.
    const asUriText = (): void => {
      if (!QUERY_OR_FRAGMENT.test(pair)) {
        throw new DigitalLinkError(
          `the query parameter "${pair}" is not one RFC 3986 §3.4 allows, so the link is no web address`,
        )
      }
    }
    if (/^[0-9]+$/.test(name) && getAiSpec(name) === undefined) {
      asUriText()
      unplaced.push(`AI (${name}) in its query, which this build does not hold`)
      continue
    }
    const key = keyFor(name)
    if (key === undefined) {
      asUriText()
      extensions.push(name)
      continue
    }
    const spec = getAiSpec(key.ai)!
    if (spec.primaryKey || spec.qualifier || inPath.has(key.ai)) {
      asUriText()
      unplaced.push(`AI (${key.ai}) in its query, where it is a key or qualifier`)
      continue
    }
    if (attributes.some((a) => a.ai === key.ai)) {
      asUriText()
      unplaced.push(`AI (${key.ai}) more than once in its query`)
      continue
    }
    if (key.alpha !== undefined) convenienceAlphas.push(key.alpha)
    attributes.push({
      ai: key.ai,
      value: valueOf(key.ai, pair.slice(at + 1), unplaced),
    })
  }

  return {
    // From the segments as printed, not decoded: the stem is an address, not data.
    stem,
    ...(primary === undefined ? {} : { primary }),
    qualifiers,
    attributes,
    convenienceAlphas,
    unplaced,
    extensions,
  }
}
