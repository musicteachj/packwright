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

import { getAiSpec, validateAiValue } from '../../gs1/applicationIdentifiers'
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
type Verdict = { findings: Finding[]; limit?: string }

/** How the link judged came to be: printed, built from the editor's fields, or neither. */
type As = 'printed' | 'built' | 'configured'

/**
 * Judges a Digital Link URI as written. `as` names it in what is said, "as printed" for a
 * link from a check request and "as built" for one Packwright built from the editor's
 * fields: both go through here, so the two cannot disagree about the same string. They
 * did, twice, while the configured path kept its own copies of the printed path's checks,
 * and each time the copy was the one missing a refusal (found by review on #97).
 */
function judgedAsWritten(written: string, gtin: string, as: As): Verdict {
  const uri = written.trim()
  const invalid = (reason: string): Finding =>
    finding(digitalLinkRule, {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      message: `The Digital Link as ${as} is not conformant: ${reason}.`,
      measurement: { actual: uri, required: 'a conformant Digital Link URI' },
    })

  let parsed
  try {
    parsed = parseDigitalLinkUri(written)
  } catch (error) {
    if (!(error instanceof DigitalLinkError)) throw error
    return { findings: [invalid(error.message)] }
  }

  const findings: Finding[] = []
  if (parsed.convenienceAlphas.length > 0)
    findings.push(alphasAdvisory(uri, as, parsed.convenienceAlphas))

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

  return verdictOf(findings, uri, as, unjudged)
}

/** The findings, with the pass where there are none and nothing unjudged, and the limit. */
function verdictOf(findings: Finding[], uri: string, as: As, unjudged: string[]): Verdict {
  const limit =
    unjudged.length === 0
      ? undefined
      : `The Digital Link as ${as} carries ${unjudged.join('; and ')}. Packwright does not ` +
        'yet judge that, so the link is not passed: a limit of this tool.'

  if (findings.length === 0) {
    if (limit !== undefined) return { findings, limit }
    return {
      findings: [
        // URI Syntax governs the string, and this engine prints no carrier for it: the document.
        passedOnDocument(
          digitalLinkRule,
          GS1_DIGITAL_LINK_VALID,
          as === 'printed'
            ? `The Digital Link as printed, ${uri}, is conformant.`
            : `The Digital Link resolves to ${uri}.`,
        ),
      ],
    }
  }
  if (limit === undefined) return { findings }
  const last = findings[findings.length - 1]!
  findings[findings.length - 1] = { ...last, message: `${last.message} ${limit}` }
  return { findings }
}

function alphasAdvisory(uri: string, as: As, alphas: readonly string[]): Finding {
  return finding(digitalLinkRule, {
    code: GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS,
    severity: 'advisory',
    message:
      `The Digital Link as ${as} uses the convenience alphas ` +
      `${alphas.map((alpha) => `\`${alpha}\``).join(', ')} in place of ` +
      'numeric Application Identifiers, as in `/gtin/` for `/01/`. They were deprecated in ' +
      'Digital Link URI Syntax 1.2 and removed in 1.3.0, so the URI is non-conformant to the ' +
      'current standard.',
    measurement: { actual: uri, required: '/01/…' },
    citation: ALPHAS_CITATION,
  })
}

/**
 * **A Digital Link configured in the editor** is built from its fields and the URI judged
 * as written, by `judgedAsWritten`. Two things are said before that, because they are
 * about the fields rather than the string:
 *
 * - **a resolver domain §4.11 refuses as a stem.** `buildDigitalLinkUri` never looks at
 *   the domain, so "it did not throw" was read as conformance, and an empty resolver,
 *   `not a url` or `javascript:alert(1)` each came back as a green pass. A prefix test
 *   then passed a domain ending `#x`, which turns the GS1 path built after it into a
 *   fragment (found by the medium review of dev, 2026-10-16). The domain is judged whole
 *   by `judgeCustomUriStem`, as the builder prints it, and said as the domain's fault;
 * - **fields the builder refuses,** said as the builder says them, since there is no URI.
 */
function judgedAsConfigured(
  link: NonNullable<Gs1RetailContext['data']['digitalLink']>,
  gtin: string,
): Verdict {
  const { domain, lot, serial, expiry, useConvenienceAlphas } = link
  const stem = judgeCustomUriStem(withoutTrailingSlashes(domain))
  if ('fault' in stem) {
    return {
      findings: [
        finding(digitalLinkRule, {
          code: GS1_DIGITAL_LINK_INVALID,
          severity: 'violation',
          message: `The resolver domain "${domain}" cannot open a conformant Digital Link: ${stem.fault}.`,
          measurement: { actual: domain || '(empty)', required: 'http(s)://host[:port][/path]' },
        }),
      ],
    }
  }

  const qualifiers: Gs1Element[] = []
  if (lot !== undefined) qualifiers.push({ ai: '10', value: lot })
  if (serial !== undefined) qualifiers.push({ ai: '21', value: serial })
  const attributes: Gs1Element[] = []
  if (expiry !== undefined) attributes.push({ ai: '17', value: expiry })

  let uri: string
  try {
    uri = buildDigitalLinkUri({
      domain,
      primary: { ai: '01', value: gtin },
      qualifiers,
      attributes,
      ...(useConvenienceAlphas === undefined ? {} : { useConvenienceAlphas }),
    })
  } catch (error) {
    if (!(error instanceof DigitalLinkError)) throw error
    const refused = finding(digitalLinkRule, {
      code: GS1_DIGITAL_LINK_INVALID,
      severity: 'violation',
      message: `The Digital Link is not conformant: ${error.message}.`,
      measurement: { actual: error.message, required: 'a conformant Digital Link URI' },
    })
    // With no URI to judge, the link built from every field sound on its own is judged
    // instead, by the same code, so what the rest of it carries is still said: an empty
    // host, a quoted lot. Hand copies of those were lost or worded apart here (found by
    // review on #97). It is said "as configured", since no link was built.
    const sound = (element: Gs1Element) => validateAiValue(element.ai, element.value) === null
    let rest: Verdict = { findings: [] }
    try {
      rest = judgedAsWritten(
        buildDigitalLinkUri({
          domain,
          primary: { ai: '01', value: gtin },
          qualifiers: qualifiers.filter(sound),
          attributes: attributes.filter(sound),
        }),
        gtin,
        'configured',
      )
    } catch (probeError) {
      if (!(probeError instanceof DigitalLinkError)) throw probeError
    }
    // Built without the convenience alphas, which are named from the fields below.
    const findings = [refused, ...rest.findings.filter((one) => one.severity !== 'pass')]
    if (useConvenienceAlphas) {
      const alphas = ['01', ...qualifiers.map((one) => one.ai)].flatMap(
        (ai) => getAiSpec(ai)?.digitalLinkAlpha ?? [],
      )
      findings.push(alphasAdvisory('/gtin/…', 'configured', alphas))
    }
    // Said on the refusal it qualifies, not on whichever finding came last.
    if (rest.limit === undefined) return { findings }
    findings[0] = { ...refused, message: `${refused.message} ${rest.limit}` }
    return { findings }
  }
  return judgedAsWritten(uri, gtin, 'built')
}

/** One verdict per label, shared by `check` and `declines`: judging twice is waste. */
const verdicts = new WeakMap<object, { key: string; verdict: Verdict }>()

function verdictOn(data: Gs1RetailContext['data']): Verdict | undefined {
  // A barcode GTIN with a wrong check digit leaves this to the check-digit rule: building
  // a link from it threw, which blamed the URI for a fault in the identifier, two findings
  // for one cause. Nothing can be concluded about the link until its key is sound.
  if (!gtinIsSound(data.gtin)) return undefined
  // No Digital Link is not a defect. Sunrise 2027 is a transition, not a deadline passed.
  const printed = data.digitalLinkAsPrinted
  if (printed === undefined && !data.digitalLink) return undefined
  // Keyed on every input: a GTIN changed in place under the same link returned the old
  // verdict, a pass on a link that no longer carries it (found by review).
  const key = JSON.stringify([data.gtin, printed, data.digitalLink])
  const kept = verdicts.get(data)
  if (kept?.key === key) return kept.verdict
  const verdict =
    printed !== undefined
      ? judgedAsWritten(printed, data.gtin, 'printed')
      : judgedAsConfigured(data.digitalLink!, data.gtin)
  verdicts.set(data, { key, verdict })
  return verdict
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

  // A link this tool cannot pass and cannot fault: said as its limit. A verdict carries a
  // limit only where it has no findings, so this is silent beside one.
  declines({ data }: Gs1RetailContext): Decline | undefined {
    const limit = verdictOn(data)?.limit
    return limit === undefined ? undefined : { reason: limit, wants: [], limit: true }
  },

  check({ data }: Gs1RetailContext): Finding[] {
    return verdictOn(data)?.findings ?? []
  },
}
