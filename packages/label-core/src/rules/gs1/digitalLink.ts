/**
 * A Digital Link configured on the label must be expressible as a conformant URI.
 *
 * The rule does not reimplement the syntax — it hands the configured data to
 * `buildDigitalLinkUri` and reports whatever that rejects. A second
 * implementation of the same rules would drift from the first, and the drift
 * would show up as a label that validates here and fails at a resolver.
 *
 * Source: GS1 Digital Link Standard: URI Syntax, Release 1.7.0 (Ratified Aug
 * 2026), read from https://ref.gs1.org/standards/digital-link/uri-syntax/ on
 * 2026-09-17.
 *
 * Two clauses, so two codes, and both now name the release and the section.
 * They cited neither until 2026-09-17, which left a finding pointing at a
 * standard that has had seven releases and says different things in several of
 * them.
 *
 * **§4 is the conformance section**, which §2 states outright: "The core of this
 * standard is expressed using ABNF grammar [RFC 5234] in section 4 such that
 * conformance can be determined with certainty." Every `GS1_DIGITAL_LINK_INVALID`
 * this rule reports is a structural non-conformance, so §4 is the reference they
 * share. The resolver-domain check rests on the productions of §4.11, `customURIstem
 * = scheme "://" hostname *optionalPathSegment` and those it is built from (re-read
 * 2026-10-16). Splitting that into a citation of its own is a judgment still open: the
 * bad-domain fixture added that day asserts §4, as every other finding here does.
 *
 * **The convenience alphas move to §4.1 of the current release**, rather than
 * citing 1.3.0 because that is where they were removed. §4.1 of 1.7.0 both names
 * the removal and dates it: "Convenience alphas were marked as deprecated in
 * version 1.2 of the standard and have been removed completely as of version
 * 1.3.0." A clause in the standard in force, stating the history, beats a
 * citation to a superseded release. Its title is written for the half of §4.1
 * this rule checks; the other half, the 14-digit GTIN form, is `buildDigitalLinkUri`'s
 * business and `normaliseToGtin14` already satisfies it.
 *
 * The message follows §4.1's "version 1.2" rather than the "version 1.2.0" the
 * change log at §8.2 gives, because §4.1 is what is cited. The standard says
 * both; `gs1/digitalLink.ts` records the discrepancy. The removal release is
 * 1.3.0 either way, and that is the one that makes a URI non-conformant.
 */

import { isValidCheckDigit, normaliseToGtin14 } from '../../gs1/checkDigit'
import {
  DigitalLinkError,
  buildDigitalLinkUri,
  judgeCustomUriStem,
  parseDigitalLinkUri,
  withoutTrailingSlashes,
} from '../../gs1/digitalLink'
import type { Gs1Element } from '../../gs1/elementString'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnDocument } from '../finding'
import type { Decline, Gs1RetailContext, Gs1RetailRule } from '../types'

export const GS1_DIGITAL_LINK_INVALID = 'GS1_DIGITAL_LINK_INVALID'
export const GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS = 'GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS'
export const GS1_DIGITAL_LINK_VALID = 'GS1_DIGITAL_LINK_VALID'

const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 Digital Link URI Syntax 1.7.0 §4',
  title: 'The ABNF grammar a conformant GS1 Digital Link URI is built from',
}

const ALPHAS_CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 Digital Link URI Syntax 1.7.0 §4.1',
  // Not §4.1's own heading, which is "Removal of convenience alphas **and GTIN values
  // expressed using fewer than 14 digits**". This rule checks the first half and not the
  // second, and a title is what the `/rules` catalogue and the findings rail show — so
  // taking the heading whole would advertise a check nothing performs. The review of
  // PR #40 recorded that shape in `dualColumnParagraphs.ts`; this is the same one.
  title: 'Convenience alphas removed from the URI path',
}

/**
 * **A Digital Link as printed** (`digitalLinkAsPrinted`, from a check request) is
 * judged as written, not rebuilt from fields somebody inferred from it. The re-checks
 * of 2026-10-16 found Haiku 4.5 reading `https://id.example.com/gtin/…` off a label and
 * sending `useConvenienceAlphas` false or not at all in 5 of 12 answers; the rule then
 * built a `/01/` link, passed it, and the label's own `/gtin/` was never seen.
 *
 * What it can say about the string, with the same two citations as the configured
 * path: a URI the grammar plainly refuses (`parseDigitalLinkUri` throws), or whose
 * values `buildDigitalLinkUri` refuses, is not conformant (§4); one using convenience
 * alphas gets §4.1's advisory. What stops a pass without a finding is a limit of this
 * tool rather than a fault it can cite:
 *
 * - **a GTIN other than the barcode's,** or a primary key that is not a GTIN. Nothing
 *   verified says a label's Digital Link must carry its barcode's GTIN (James's
 *   decision of 2026-10-16: no pass, and say so, until the GS1 text is read);
 * - **a GTIN of fewer than 14 digits.** §4.1 says one "SHALL be prefixed with leading
 *   zeroes" to 14 (read 2026-10-16), but this rule's §4.1 citation is titled for the
 *   convenience alphas alone, and widening it is a change of the finding's meaning;
 * - **anything the parser could not place** (`ParsedDigitalLink.unplaced`), which the
 *   standard may permit: (235) after a GTIN is a UPUI path.
 *
 * **A limit is said under `declined` only where there is no finding.** `Rule.declines`
 * must be silent whenever `check` returned anything, and the registry drops a decline
 * beside a finding, so a link with both convenience alphas and another GTIN lost the
 * second in the first draft (found by review). Beside a finding, the limit's sentence
 * is added to the finding's message instead, so it is still said.
 */
type PrintedVerdict = { findings: Finding[]; limit?: string }

function judgedAsPrinted(printed: string, gtin: string): PrintedVerdict {
  const uri = printed.trim()
  const invalid = (reason: string): Finding =>
    finding(digitalLinkRule, {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      message: `The Digital Link as printed is not conformant: ${reason}.`,
      measurement: { actual: uri, required: 'a conformant Digital Link URI' },
    })

  let parsed
  try {
    parsed = parseDigitalLinkUri(printed)
  } catch (error) {
    if (!(error instanceof DigitalLinkError)) throw error
    return { findings: [invalid(error.message)] }
  }

  const findings: Finding[] = []
  if (parsed.convenienceAlphas.length > 0) {
    findings.push(
      finding(digitalLinkRule, {
        code: GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
        severity: 'advisory',
        message:
          `The Digital Link as printed uses the convenience alphas ` +
          `${parsed.convenienceAlphas.map((alpha) => `\`${alpha}\``).join(', ')} in place of ` +
          'numeric Application Identifiers, as in `/gtin/` for `/01/`. They were deprecated in ' +
          'Digital Link URI Syntax 1.2 and removed in 1.3.0, so the URI is non-conformant to the ' +
          'current standard.',
        measurement: { actual: uri, required: '/01/…' },
        citation: ALPHAS_CITATION,
      }),
    )
  }

  const unjudged: string[] = []
  const { primary } = parsed
  if (primary === undefined) {
    unjudged.push(...parsed.unplaced)
  } else {
    // The values themselves, by the builder that refuses them on the configured path.
    let built = true
    try {
      buildDigitalLinkUri({
        domain: parsed.stem,
        primary,
        qualifiers: parsed.qualifiers,
        attributes: parsed.attributes,
      })
    } catch (error) {
      if (!(error instanceof DigitalLinkError)) throw error
      findings.push(invalid(error.message))
      built = false
    }
    // Compared only once the value is a GTIN: widening a 15-digit one threw out of the
    // rule, and `check_label` with it (found by review).
    if (!built) {
      // The finding above is the verdict on the key.
    } else if (primary.ai !== '01') {
      unjudged.push(`a key other than a GTIN, (${primary.ai}) ${primary.value}`)
    } else if (normaliseToGtin14(primary.value) !== normaliseToGtin14(gtin)) {
      unjudged.push(`the GTIN ${primary.value}, not the barcode's ${gtin}`)
    } else if (primary.value.length !== 14) {
      unjudged.push(
        `its GTIN in ${primary.value.length} digits, where Digital Link URI Syntax 1.7.0 ` +
          '§4.1 expects 14, padded with leading zeroes',
      )
    }
    unjudged.push(...parsed.unplaced)
  }

  const limit =
    unjudged.length === 0
      ? undefined
      : `The Digital Link as printed carries ${unjudged.join('; and ')}. Packwright does not ` +
        'yet judge that, so the link is not passed: a limit of this tool.'

  if (findings.length === 0) {
    if (limit !== undefined) return { findings, limit }
    return {
      findings: [
        passedOnDocument(
          digitalLinkRule,
          GS1_DIGITAL_LINK_VALID,
          `The Digital Link as printed, ${uri}, is conformant.`,
        ),
      ],
    }
  }
  if (limit === undefined) return { findings }
  const last = findings[findings.length - 1]!
  findings[findings.length - 1] = { ...last, message: `${last.message} ${limit}` }
  return { findings }
}

/** One verdict per label, shared by `check` and `declines`: parsing twice is waste. */
const printedVerdicts = new WeakMap<
  object,
  { printed: string; gtin: string; verdict: PrintedVerdict }
>()

function verdictOnPrinted(data: Gs1RetailContext['data']): PrintedVerdict | undefined {
  const printed = data.digitalLinkAsPrinted
  if (printed === undefined || !gtinIsSound(data.gtin)) return undefined
  const kept = printedVerdicts.get(data)
  // Keyed on both inputs: a GTIN changed in place under the same link returned the
  // old verdict, a pass on a link that no longer carries it (found by review).
  if (kept?.printed === printed && kept.gtin === data.gtin) return kept.verdict
  const verdict = judgedAsPrinted(printed, data.gtin)
  printedVerdicts.set(data, { printed, gtin: data.gtin, verdict })
  return verdict
}

/** The configured domain as the builder prints it, without its trailing slashes. */
const configuredStem = (domain: string) => judgeCustomUriStem(withoutTrailingSlashes(domain))

/**
 * What stops a configured link's pass without a finding, said as a limit of the tool.
 *
 * - **An empty host.** `reg-name = *( … )` in §4.11 allows one, so faulting it under §4
 *   cited a provision against what it permits (found by review), and no resolver can
 *   serve it, so it is not passed either: the printed path's answer.
 * - **A double quote in the lot or serial.** §4.2 writes `DoubleQuote = '"'` unencoded,
 *   and RFC 3986 allows one in a URI only as `%22`: it is in neither `unreserved` (§2.3)
 *   nor `reserved` (§2.2). Both read 2026-10-16. No form satisfies both, so neither is
 *   passed, here or as printed.
 * - **A domain that reads as a GS1 path itself.** `https://x.com/01/09506000134352` is a
 *   stem §4.11 allows, but the link built under it carries two GTINs, and read as printed
 *   the first is its key. It passed here and stood down there (found by review).
 */
function configuredLimit(data: Gs1RetailContext['data']): string | undefined {
  if (!data.digitalLink || !gtinIsSound(data.gtin)) return undefined
  const { domain, lot, serial } = data.digitalLink
  const stem = configuredStem(domain)
  if ('fault' in stem) return undefined
  const reasons: string[] = []
  if (stem.host === '') {
    reasons.push(
      `has no host name in its resolver domain "${domain}", which Digital Link URI Syntax ` +
        '1.7.0 §4.11 allows and no resolver can serve',
    )
  }
  if ([lot, serial].some((value) => value?.includes('"'))) {
    reasons.push(
      'carries a double quote in its lot or serial, which Digital Link URI Syntax 1.7.0 §4.2 ' +
        'writes unencoded and RFC 3986 allows only encoded',
    )
  }
  try {
    const stemAsPrinted = parseDigitalLinkUri(
      buildDigitalLinkUri({ domain, primary: { ai: '01', value: data.gtin } }),
    ).stem
    if (stemAsPrinted !== withoutTrailingSlashes(domain)) {
      reasons.push(
        `reads, under the resolver domain "${domain}", as a link whose key comes before ` +
          'the GTIN built into it',
      )
    }
  } catch (error) {
    // A domain the parser refuses outright is the finding's business, not a limit's.
    if (!(error instanceof DigitalLinkError)) throw error
  }
  return reasons.length === 0
    ? undefined
    : `The Digital Link ${reasons.join(', and ')}, so the link is not passed: a limit of this tool.`
}

/** The GTIN is sound enough to judge a link built from it, or printed beside it. */
const gtinIsSound = (gtin: string): boolean => /^[0-9]{12}$/.test(gtin) && isValidCheckDigit(gtin)

export const digitalLinkRule: Gs1RetailRule = {
  id: 'gs1/digital-link',
  title: 'A GS1 Digital Link, configured here or as printed, is a conformant URI.',
  citation: CITATION,
  citations: [CITATION, ALPHAS_CITATION],
  codes: {
    [GS1_DIGITAL_LINK_INVALID]: ['violation'],
    [GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS]: ['advisory'],
    [GS1_DIGITAL_LINK_VALID]: ['pass'],
  },
  appliesTo: 'gs1-retail',

  // A link, printed or configured, that this tool cannot pass and cannot fault: said as its limit.
  declines(context: Gs1RetailContext): Decline | undefined {
    const { data } = context
    if (data.digitalLinkAsPrinted !== undefined) {
      const limit = verdictOnPrinted(data)?.limit
      return limit === undefined ? undefined : { reason: limit, wants: [], limit: true }
    }
    // Silent beside a finding, which then says the limit itself.
    const limit = digitalLinkRule.check(context).length > 0 ? undefined : configuredLimit(data)
    return limit === undefined ? undefined : { reason: limit, wants: [], limit: true }
  },

  check({ data }: Gs1RetailContext): Finding[] {
    // A barcode GTIN with a wrong check digit leaves this to the check-digit rule, as
    // on the configured path below.
    if (data.digitalLinkAsPrinted !== undefined) return verdictOnPrinted(data)?.findings ?? []

    // No Digital Link configured is not a defect. Sunrise 2027 is a transition,
    // not a deadline that has passed.
    if (!data.digitalLink) return []

    // A GTIN whose check digit is wrong makes `buildDigitalLinkUri` throw, and
    // reporting that here blamed the URI for a fault in the identifier: two
    // findings for one cause, the second of them misattributed. The check-digit
    // rule owns that defect and states it precisely. Nothing can be concluded
    // about the Digital Link until the key it is built from is sound.
    if (!gtinIsSound(data.gtin)) return []

    const { domain, lot, serial, expiry, useConvenienceAlphas } = data.digitalLink
    const findings: Finding[] = []

    // `buildDigitalLinkUri` never looks at the domain, so "it did not throw" was
    // being read as conformance — and an empty resolver, `not a url`, or
    // `javascript:alert(1)` each came back as a green pass under a GS1 citation.
    // A Digital Link is a resolvable web address or it is not a Digital Link.
    // The test that replaced it looked at a prefix only, and passed a domain ending
    // `#x`, which turns the whole GS1 path built after it into a fragment (found by
    // review): the domain is now judged whole, by the same §4.11 productions as a link
    // as printed, and with its trailing slashes gone, as the builder prints it.
    const stem = configuredStem(domain)
    if ('fault' in stem) {
      return [
        finding(digitalLinkRule, {
          code: GS1_DIGITAL_LINK_INVALID,
          severity: 'violation',
          message: `The resolver domain "${domain}" cannot open a conformant Digital Link: ${stem.fault}.`,
          measurement: { actual: domain || '(empty)', required: 'http(s)://host[:port][/path]' },
        }),
      ]
    }
    // What stops the pass without a finding (`configuredLimit`): said by `declines`, or
    // beside a finding in its message. An empty host returned nothing at all here, and hid
    // a lot the builder refuses (found by review).
    const limit = configuredLimit(data)

    const qualifiers: Gs1Element[] = []
    if (lot !== undefined) qualifiers.push({ ai: '10', value: lot })
    if (serial !== undefined) qualifiers.push({ ai: '21', value: serial })

    const attributes: Gs1Element[] = []
    if (expiry !== undefined) attributes.push({ ai: '17', value: expiry })

    try {
      const uri = buildDigitalLinkUri({
        domain,
        primary: { ai: '01', value: data.gtin },
        qualifiers,
        attributes,
        ...(useConvenienceAlphas === undefined ? {} : { useConvenienceAlphas }),
      })
      // Not counted as a pass when the convenience alphas are in use: the
      // advisory below declares the same URI non-conformant, and a rail that
      // tallies both reports a check as cleared that the rule itself just
      // faulted.
      // Nor where the tool cannot judge the URI (`configuredLimit`).
      if (!useConvenienceAlphas && limit === undefined) {
        findings.push(
          // URI Syntax governs the string, and this engine prints no carrier for it: the document.
          passedOnDocument(
            digitalLinkRule,
            GS1_DIGITAL_LINK_VALID,
            `The Digital Link resolves to ${uri}.`,
          ),
        )
      }
    } catch (error) {
      if (!(error instanceof DigitalLinkError)) throw error
      findings.push(
        finding(digitalLinkRule, {
          code: GS1_DIGITAL_LINK_INVALID,
          severity: 'violation',
          message: `The Digital Link is not conformant: ${error.message}.`,
          measurement: { actual: error.message, required: 'a conformant Digital Link URI' },
        }),
      )
    }

    if (useConvenienceAlphas) {
      findings.push(
        finding(digitalLinkRule, {
          code: GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
          severity: 'advisory',
          message:
            'The Digital Link uses the convenience alphas — `/gtin/` in place of `/01/`. They were ' +
            'deprecated in Digital Link URI Syntax 1.2 and removed in 1.3.0, so the URI is ' +
            'non-conformant to the current standard.',
          measurement: { actual: '/gtin/…', required: '/01/…' },
          citation: ALPHAS_CITATION,
        }),
      )
    }

    if (limit !== undefined && findings.length > 0) {
      const last = findings[findings.length - 1]!
      findings[findings.length - 1] = { ...last, message: `${last.message} ${limit}` }
    }
    return findings
  },
}
