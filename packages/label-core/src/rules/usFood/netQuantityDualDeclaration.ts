/**
 * The net quantity is declared in both inch/pound and SI metric units.
 *
 * **This requirement is not in 21 CFR 101.** FDA proposed SI declarations in
 * 1993 and never took final action on them; 81 FR 59129 (29 Aug 2016) says so
 * explicitly while renumbering the section. The obligation is statutory, from
 * the Fair Packaging and Labeling Act as amended in 1992 — 15 U.S.C. 1453(a)(2),
 * read from the US Code on 2026-09-12:
 *
 * > "The net quantity of contents […] shall be separately and accurately stated
 * > in a uniform location upon the principal display panel of that label, using
 * > the most appropriate units of both the customary inch/pound system of
 * > measure, as provided in paragraph (3) of this subsection, and, except as
 * > provided in paragraph (3)(A)(ii) or paragraph (6) of this subsection, the SI
 * > metric system"
 *
 * Both named exceptions are modelled, and each is cited to its own paragraph
 * rather than to (a)(2): a random package "is not required to, but may, include
 * a statement in terms of the SI metric system", and under (a)(6) the SI
 * requirement "shall not apply to foods that are packaged at the retail store
 * level." Citing the general clause on a finding about a specific exemption is
 * the mistake `finding.ts` records having shipped once already.
 *
 * **"The SI metric system" is judged as a unit, not as any text.** The pass once took
 * whatever sat in the metric field, so "16 oz" there cleared both systems. It now wants
 * an amount followed by an SI unit for mass, volume, length or area: the gram, liter and
 * meter, bare or with an SI prefix from micro to kilo (micro, milli, centi, deci, deka,
 * hecto, kilo), as symbols or spelled out, and the square and cubic meter with those
 * prefixes. Source: NIST SP 811 (2008, as
 * updated), Table 1 (the meter and kilogram), Table 2 (square and cubic meter), Table 5
 * (the prefixes), § 6.2.7 (prefixes attach to the gram) and Table 6 (the liter, accepted
 * for use with the SI, symbol L or l); and NIST SP 330 (2019), which notes the US
 * spellings "meter" and "liter" for the BIPM's "metre" and "litre". Both read from NIST
 * on 2026-10-17. Both spellings are accepted, since both name the same SI unit, and so
 * are "deka" and "deca", which SP 330 gives the same way.
 *
 * **The inch/pound half is not judged here.** The pass names the SI amount it found and
 * says it did not check that the other declaration is in inch/pound units: a count, such
 * as "24 TABLETS", has none, and whether (a)(2) then wants an SI figure is not settled
 * (`docs/BACKLOG.md`).
 *
 * **Case is not judged.** SP 811 fixes the symbols' case ("mL", never "ML"), but labels
 * are often set in capitals, and "NET WT 12 OZ (340 G)" states grams as plainly to a
 * reader as "(340 g)". The rule asks whether an SI unit is stated, which (a)(2) requires,
 * not whether its symbol follows NIST's style guide, which nothing here makes binding.
 * The prefixes are a closed set, so a capital "M" still reads as the meter and never as
 * mega: nothing larger than the kilo is recognized, and "u" is not taken for micro.
 *
 * Reading the document rather than the geometry is a means, not what is judged.
 * (a)(2) governs what is stated upon the panel, so the pass for both systems rests
 * on the artwork. Only the two exemptions rest on the document, because whether a
 * package is random or packaged at retail is a fact about the package.
 */

import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { UsFoodPackaging } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, passedOnDocument } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_NET_QUANTITY_METRIC_MISSING = 'FDA_NET_QUANTITY_METRIC_MISSING'
export const FDA_NET_QUANTITY_METRIC_NOT_SI = 'FDA_NET_QUANTITY_METRIC_NOT_SI'
export const FDA_NET_QUANTITY_DUAL_MET = 'FDA_NET_QUANTITY_DUAL_MET'
export const FDA_NET_QUANTITY_METRIC_NOT_REQUIRED = 'FDA_NET_QUANTITY_METRIC_NOT_REQUIRED'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '15 U.S.C. 1453(a)(2)',
  title: 'Net quantity of contents in both inch/pound and SI metric units',
}

/** Each exemption cites the paragraph that grants it, not the general rule. */
const EXEMPTION: Record<
  Exclude<UsFoodPackaging, 'standard'>,
  { citation: Citation; why: string }
> = {
  random: {
    citation: {
      authority: 'FDA',
      reference: '15 U.S.C. 1453(a)(3)(A)(ii)',
      title: 'Random packages — SI declaration permitted, not required',
    },
    why: 'this is a random package',
  },
  'packaged-at-retail': {
    citation: {
      authority: 'FDA',
      reference: '15 U.S.C. 1453(a)(6)',
      title: 'Foods packaged at the retail store level — SI requirement does not apply',
    },
    why: 'this food is packaged at the retail store level',
  },
}

/**
 * An amount and an SI unit: "454 g", "1.5 litres", "500mL", "0.2 m²". Built from the
 * prefixes and units the module note sources, never extended by guesswork. The unit
 * must end the word, so "16 grains" is not grams and "2 gal" is not grams either.
 */
// "da" before "d", so deka is not read as deci and a stray "a".
const SI_PREFIX_SYMBOLS = '(?:da|k|h|d|c|m|µ|μ)?'
const SI_PREFIX_NAMES = '(?:kilo|hecto|deka|deca|deci|centi|milli|micro)?'
const SI_AMOUNT = new RegExp(
  '\\d(?:[\\d.,]*\\d)?\\s*(' +
    // Symbols: g, L or l, and m alone or squared or cubed.
    `${SI_PREFIX_SYMBOLS}(?:g|l|m(?:[²³23])?)` +
    '|' +
    // Names: the gram, liter and meter, singular or plural, -er or -re, and the square or
    // cubic meter.
    `(?:(?:square|cubic)\\s+)?${SI_PREFIX_NAMES}(?:grams?|lit(?:er|re)s?|met(?:er|re)s?)` +
    ')(?![a-z])',
  'i',
)

/** The SI amount the text states, as written, or `undefined` where it states none. */
const siAmountIn = (text: string): string | undefined => SI_AMOUNT.exec(text)?.[0]

export const usFoodNetQuantityDualDeclarationRule: UsFoodRule = {
  id: 'us-food/net-quantity-dual-declaration',
  title: 'The net quantity is declared in both inch/pound and SI metric units.',
  citation: CITATION,
  // The two exemptions live in the table above, so the list is built from it
  // rather than restated beside it.
  citations: [CITATION, ...Object.values(EXEMPTION).map((entry) => entry.citation)],
  codes: {
    [FDA_NET_QUANTITY_METRIC_MISSING]: ['violation'],
    [FDA_NET_QUANTITY_METRIC_NOT_SI]: ['violation'],
    [FDA_NET_QUANTITY_DUAL_MET]: ['pass'],
    [FDA_NET_QUANTITY_METRIC_NOT_REQUIRED]: ['pass'],
  },
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const { inchPound, metric, packaging = 'standard' } = data.netQuantity

    // No declaration at all is a different defect from a declaration missing one
    // of its two halves, and this rule is not the one that reports it.
    if (inchPound.trim() === '') return []

    if (packaging !== 'standard') {
      const { citation, why } = EXEMPTION[packaging]
      // Both exemptions are permissions, so a label may carry the SI declaration
      // anyway — 1453(a)(3)(A)(ii) says a random package "is not required to, but
      // may, include" one. Saying "stands alone" of a label that plainly carries
      // both is a finding a user can see is wrong, and a finding a user can see
      // is wrong costs more than the one it replaces.
      //
      // Worded as the entitlement, not as what the panel shows. This pass rests on
      // the document and survives a declaration drawn off the stock, and "the label
      // carries an SI declaration" is false of one that never printed.
      // Only an SI amount is the SI statement it permits; "16 oz" there is not one.
      const carriesMetric = metric !== undefined && siAmountIn(metric) !== undefined
      return [
        // An exemption for this kind of package, true whether or not either declaration printed.
        passedOnDocument(
          usFoodNetQuantityDualDeclarationRule,
          FDA_NET_QUANTITY_METRIC_NOT_REQUIRED,
          carriesMetric
            ? `No SI declaration is required, because ${why}; "${metric.trim()}" is permitted ` +
                'all the same.'
            : `No SI declaration is required, because ${why}.`,
          US_FOOD_ELEMENTS.netQuantity,
          citation,
        ),
      ]
    }

    if (metric === undefined || metric.trim() === '') {
      return [
        finding(usFoodNetQuantityDualDeclarationRule, {
          code: FDA_NET_QUANTITY_METRIC_MISSING,
          severity: 'violation',
          message:
            `The label declares "${inchPound}" and no SI metric equivalent. The Fair Packaging ` +
            'and Labeling Act requires both systems on the principal display panel.',
          measurement: { actual: inchPound, required: `${inchPound} and an SI metric declaration` },
          elementId: US_FOOD_ELEMENTS.netQuantity,
        }),
      ]
    }

    // Text in the metric field is not yet an SI declaration: "16 oz" there is the
    // inch/pound system again, and "500" is a number with no unit at all.
    const amount = siAmountIn(metric)
    if (amount === undefined) {
      return [
        finding(usFoodNetQuantityDualDeclarationRule, {
          code: FDA_NET_QUANTITY_METRIC_NOT_SI,
          severity: 'violation',
          message:
            `The label's metric declaration, "${metric.trim()}", states no amount in an SI ` +
            'unit such as grams, kilograms, milliliters or liters. The Fair Packaging and ' +
            'Labeling Act requires the net quantity in the SI metric system as well as in ' +
            'inch/pound units.',
          measurement: {
            actual: metric.trim(),
            required: 'an amount in an SI unit (for example g, kg, mL or L)',
          },
          elementId: US_FOOD_ELEMENTS.netQuantity,
        }),
      ]
    }

    return [
      // 1453(a)(2): both are "stated ... upon the principal display panel" — so the artwork.
      passedOnArtwork(
        usFoodNetQuantityDualDeclarationRule,
        FDA_NET_QUANTITY_DUAL_MET,
        `The label declares "${inchPound}" and "${metric}", an amount in SI units ` +
          `("${amount}"). Not checked here: that "${inchPound}" is in inch/pound units, ` +
          'whether the SI figure equals the inch/pound one, and whether the units are the ' +
          'most appropriate.',
        US_FOOD_ELEMENTS.netQuantity,
      ),
    ]
  },
}
