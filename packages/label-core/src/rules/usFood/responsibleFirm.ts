/**
 * The label names a responsible firm, and says where it is.
 *
 * Source: 21 CFR 101.5, read from the eCFR on 2026-09-12. Four of its five
 * paragraphs are checkable and all four are checked here:
 *
 * - (a) "The label of a food in packaged form shall specify conspicuously the
 *   name and place of business of the manufacturer, packer, or distributor."
 * - (b) for a corporation, "only by the actual corporate name"; for an
 *   individual, partnership or association, "the name under which the business
 *   is conducted".
 * - (c) "Where the food is not manufactured by the person whose name appears on
 *   the label, the name shall be qualified by a phrase that reveals the
 *   connection such person has with such food; such as 'Manufactured for
 *   ______', 'Distributed by ______', or **any other wording that expresses the
 *   facts**." That last clause is why the phrase is free text and not an enum: a
 *   closed list would reject compliant labels.
 * - (d) "The statement of the place of business shall include the street
 *   address, city, State, and ZIP code; however, the street address may be
 *   omitted if it is shown in a current city directory or telephone directory."
 *
 * Two of those hang on facts no inspection of artwork can settle — whether this
 * firm made the food, and whether its address is in a current directory. Both
 * are declared by the supplier and neither is inferred, the same call the GHS
 * small-container rule makes about feasibility.
 *
 * (b) is deliberately not enforced. Whether a string is a corporation's actual
 * registered name is a question about a companies register, not about a label,
 * and a rule guessing at it from the presence of "Inc" or "Ltd" would report
 * confident nonsense about sole traders.
 */

import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_RESPONSIBLE_FIRM_MISSING = 'FDA_RESPONSIBLE_FIRM_MISSING'
export const FDA_RESPONSIBLE_FIRM_UNQUALIFIED = 'FDA_RESPONSIBLE_FIRM_UNQUALIFIED'
export const FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE = 'FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE'
export const FDA_RESPONSIBLE_FIRM_MET = 'FDA_RESPONSIBLE_FIRM_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.5(a)',
  title: 'Name and place of business of the manufacturer, packer, or distributor',
}

const QUALIFIER: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.5(c)',
  title: 'A firm that did not manufacture the food must qualify its name',
}

const PLACE: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.5(d)',
  title: 'The place of business includes street address, city, State and ZIP code',
}

export const usFoodResponsibleFirmRule: UsFoodRule = {
  id: 'us-food/responsible-firm',
  title: 'The label names a manufacturer, packer or distributor and gives its place of business.',
  citation: CITATION,
  codes: [
    FDA_RESPONSIBLE_FIRM_MISSING,
    FDA_RESPONSIBLE_FIRM_UNQUALIFIED,
    FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE,
    FDA_RESPONSIBLE_FIRM_MET,
  ],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const firm = data.responsibleFirm

    if (firm === undefined || firm.name.trim() === '') {
      return [
        finding(usFoodResponsibleFirmRule, {
          code: FDA_RESPONSIBLE_FIRM_MISSING,
          severity: 'blocking',
          message:
            'The label names no manufacturer, packer or distributor. A packaged food must carry ' +
            'one, with its place of business.',
          measurement: { actual: 'no firm named', required: 'a name and place of business' },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        }),
      ]
    }

    const findings: Finding[] = []

    if (!firm.isManufacturer && (firm.qualifyingPhrase ?? '').trim() === '') {
      findings.push(
        finding(usFoodResponsibleFirmRule, {
          code: FDA_RESPONSIBLE_FIRM_UNQUALIFIED,
          severity: 'violation',
          message:
            `"${firm.name.trim()}" did not manufacture this food, so its name must be qualified ` +
            'by a phrase revealing the connection — "Manufactured for", "Distributed by", or any ' +
            'other wording that expresses the facts.',
          measurement: {
            actual: firm.name.trim(),
            required: `a qualifying phrase before "${firm.name.trim()}"`,
          },
          elementId: US_FOOD_ELEMENTS.responsibleFirm,
          citation: QUALIFIER,
        }),
      )
    }

    // The street address is required unless the supplier declares it appears in
    // a current city or telephone directory — 101.5(d)'s own escape, and not one
    // this engine can verify for itself.
    const missing = [
      (firm.streetAddress ?? '').trim() === '' && firm.streetAddressInDirectory !== true
        ? 'street address'
        : '',
      firm.city.trim() === '' ? 'city' : '',
      firm.state.trim() === '' ? 'State' : '',
      (firm.zip ?? '').trim() === '' ? 'ZIP code' : '',
    ].filter(Boolean)

    if (missing.length > 0) {
      findings.push(
        finding(usFoodResponsibleFirmRule, {
          code: FDA_RESPONSIBLE_FIRM_ADDRESS_INCOMPLETE,
          severity: 'violation',
          message:
            `The place of business is missing its ${missing.join(', ')}. 101.5(d) requires the ` +
            'street address, city, State and ZIP code, the street address being optional only ' +
            'where it appears in a current city or telephone directory.',
          measurement: {
            actual: `missing ${missing.join(', ')}`,
            required: 'street address, city, State and ZIP code',
          },
          elementId: US_FOOD_ELEMENTS.responsibleFirm,
          citation: PLACE,
        }),
      )
    }

    if (findings.length > 0) return findings

    return [
      passed(
        usFoodResponsibleFirmRule,
        FDA_RESPONSIBLE_FIRM_MET,
        `The label names ${firm.name.trim()} and gives a complete place of business.`,
        US_FOOD_ELEMENTS.responsibleFirm,
      ),
    ]
  },
}
