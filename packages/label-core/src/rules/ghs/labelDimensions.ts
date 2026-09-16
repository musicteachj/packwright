/**
 * A CLP label must be at least the size its package capacity demands.
 *
 * **Only CLP sets a size.** OSHA's Hazard Communication Standard requires label
 * elements to be legible and sets no millimetre anywhere, so this rule declines
 * entirely for a US label rather than inventing a figure — the distinction the
 * `regime` field exists to carry.
 *
 * The smallest band is qualified in the legal text: "If possible, at least
 * 52 × 74". That is a weaker obligation than the three bands above it, which
 * read "At least", and the severity follows the wording rather than flattening
 * all four into a violation.
 */

import { dimensionBandFor } from '../../ghs/labelDimensions'
import { GHS_ELEMENTS } from '../../templates/ghs'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, mm, passedOnArtwork } from '../finding'
import type { GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_LABEL_BELOW_MINIMUM_SIZE = 'GHS_LABEL_BELOW_MINIMUM_SIZE'
export const GHS_LABEL_SIZE_MET = 'GHS_LABEL_SIZE_MET'

const CITATION: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.4, Table 1.3',
  title: 'Minimum dimensions of labels and pictograms',
}

export const ghsLabelDimensionsRule: GhsChemicalRule = {
  id: 'ghs/label-dimensions',
  title: 'The label is at least the minimum size CLP sets for the package capacity.',
  citation: CITATION,
  codes: [GHS_LABEL_BELOW_MINIMUM_SIZE, GHS_LABEL_SIZE_MET],
  appliesTo: 'ghs-chemical',

  check({ data, layout }: GhsChemicalContext): Finding[] {
    // OSHA sets no dimensional minimum. Nothing to measure against is not a pass.
    if (data.regime !== 'eu-clp') return []

    const band = dimensionBandFor(data.capacityL)
    // The table's two figures are a minimum for each side rather than an
    // orientation: a 74 x 52 label satisfies "at least 52 x 74" laid on its side.
    const [shortMm, longMm] = [
      Math.min(layout.widthMm, layout.heightMm),
      Math.max(layout.widthMm, layout.heightMm),
    ]
    const [needShortMm, needLongMm] = [
      Math.min(band.labelWidthMm, band.labelHeightMm),
      Math.max(band.labelWidthMm, band.labelHeightMm),
    ]

    const fits =
      shortMm >= needShortMm - MEASUREMENT_TOLERANCE_MM &&
      longMm >= needLongMm - MEASUREMENT_TOLERANCE_MM

    const required = `${mm(needShortMm)} × ${mm(needLongMm)}`
    const actual = `${mm(shortMm)} × ${mm(longMm)}`

    if (fits) {
      return [
        passedOnArtwork(
          ghsLabelDimensionsRule,
          GHS_LABEL_SIZE_MET,
          `The label is ${actual}, meeting the ${required} minimum for a package of ` +
            `${band.capacityText.toLowerCase()}.`,
          GHS_ELEMENTS.border,
        ),
      ]
    }

    return [
      finding(ghsLabelDimensionsRule, {
        code: GHS_LABEL_BELOW_MINIMUM_SIZE,
        // "If possible, at least 52 × 74" is not the same obligation as
        // "At least 74 × 105", and only the smallest band is worded that way.
        severity: band.labelDimensionIsBestEffort ? 'advisory' : 'violation',
        message:
          `The label is ${actual}; a package of ${band.capacityText.toLowerCase()} requires ` +
          `${band.labelDimensionIsBestEffort ? 'at least ' + required + ' if possible' : required}.`,
        measurement: { actual, required },
        elementId: GHS_ELEMENTS.border,
      }),
    ]
  },
}
