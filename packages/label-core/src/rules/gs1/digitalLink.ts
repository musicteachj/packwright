/**
 * A Digital Link configured on the label must be expressible as a conformant URI.
 *
 * The rule does not reimplement the syntax — it hands the configured data to
 * `buildDigitalLinkUri` and reports whatever that rejects. A second
 * implementation of the same rules would drift from the first, and the drift
 * would show up as a label that validates here and fails at a resolver.
 *
 * Two clauses, so two codes. The convenience alphas are cited to their own
 * version of the standard because that is where they were removed, and a
 * finding that said "Digital Link URI Syntax" without the version would be
 * citing a document that no longer says what the finding claims.
 */

import { isValidCheckDigit } from '../../gs1/checkDigit'
import { DigitalLinkError, buildDigitalLinkUri } from '../../gs1/digitalLink'
import type { Gs1Element } from '../../gs1/elementString'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { Gs1RetailContext, Gs1RetailRule } from '../types'

export const GS1_DIGITAL_LINK_INVALID = 'GS1_DIGITAL_LINK_INVALID'
export const GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS = 'GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS'
export const GS1_DIGITAL_LINK_VALID = 'GS1_DIGITAL_LINK_VALID'

const CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 Digital Link URI Syntax',
  title: 'Structure of a GS1 Digital Link URI',
}

const ALPHAS_CITATION: Citation = {
  authority: 'GS1',
  reference: 'GS1 Digital Link URI Syntax 1.3.0',
  title: 'Removal of the convenience alphas from the URI path',
}

export const digitalLinkRule: Gs1RetailRule = {
  id: 'gs1/digital-link',
  title: 'A configured GS1 Digital Link resolves to a conformant URI.',
  citation: CITATION,
  citations: [CITATION, ALPHAS_CITATION],
  codes: [GS1_DIGITAL_LINK_INVALID, GS1_DIGITAL_LINK_CONVENIENCE_ALPHAS, GS1_DIGITAL_LINK_VALID],
  appliesTo: 'gs1-retail',

  check({ data }: Gs1RetailContext): Finding[] {
    // No Digital Link configured is not a defect. Sunrise 2027 is a transition,
    // not a deadline that has passed.
    if (!data.digitalLink) return []

    // A GTIN whose check digit is wrong makes `buildDigitalLinkUri` throw, and
    // reporting that here blamed the URI for a fault in the identifier: two
    // findings for one cause, the second of them misattributed. The check-digit
    // rule owns that defect and states it precisely. Nothing can be concluded
    // about the Digital Link until the key it is built from is sound.
    if (!/^[0-9]{12}$/.test(data.gtin) || !isValidCheckDigit(data.gtin)) return []

    const { domain, lot, serial, expiry, useConvenienceAlphas } = data.digitalLink
    const findings: Finding[] = []

    // `buildDigitalLinkUri` never looks at the domain, so "it did not throw" was
    // being read as conformance — and an empty resolver, `not a url`, or
    // `javascript:alert(1)` each came back as a green pass under a GS1 citation.
    // A Digital Link is a resolvable web address or it is not a Digital Link.
    if (!/^https?:\/\/[^\s/?#]+/i.test(domain)) {
      return [
        finding(digitalLinkRule, {
          code: GS1_DIGITAL_LINK_INVALID,
          severity: 'violation',
          message:
            `The resolver domain "${domain}" is not an http or https web address, ` +
            'so the Digital Link cannot resolve.',
          measurement: { actual: domain || '(empty)', required: 'https://…' },
        }),
      ]
    }

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
      if (!useConvenienceAlphas) {
        findings.push(
          passed(digitalLinkRule, GS1_DIGITAL_LINK_VALID, `The Digital Link resolves to ${uri}.`),
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
            'deprecated in Digital Link URI Syntax 1.2.0 and removed in 1.3.0, so the URI is ' +
            'non-conformant to the current standard.',
          measurement: { actual: '/gtin/…', required: '/01/…' },
          citation: ALPHAS_CITATION,
        }),
      )
    }

    return findings
  },
}
