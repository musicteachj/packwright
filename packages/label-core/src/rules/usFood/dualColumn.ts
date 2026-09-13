/**
 * A package that must carry a second column of nutrition information does.
 *
 * **Measured on the resolved layout.** Whether a panel carries a second column is
 * a question about what is printed, and asking the document instead let this rule
 * clear a tabular panel that declares `columns: dual` and draws one column.
 *
 * Source: 21 CFR 101.9(b)(12)(i) and (b)(2)(i)(D), read from the eCFR on
 * 2026-09-13. The thresholds, the band and the shared exemption set live in
 * `fda/nutritionFormats.ts`; this measures a label against them.
 *
 * **This is the first rule in the project that reports a label for *not* using a
 * display**, and every format rule before it is deliberately careful never to.
 * The difference is in the verbs. (j)(13)(ii) opens "may modify the
 * requirements" and 101.9(e) opens "Nutrition information **may** be presented
 * for two or more forms" — permissions, and a rule demanding either would report
 * violations that do not exist. (b)(12)(i) says a qualifying package "**must**
 * provide an additional column" and (b)(2)(i)(D) says the manufacturer "**shall**
 * provide" one. Those are obligations, and a rule silent about them would clear
 * a label the regulation does not.
 *
 * **It fires only on facts the label has asserted.** The trigger is a percentage
 * of "the applicable reference amount" from §101.12(b), a table this project does
 * not carry, so the figure is declared on the label and this rule declines
 * entirely when it is absent. Reporting a missing column on an inferred reference
 * amount would be the worst of both: a demand the user cannot check, resting on a
 * number this engine made up.
 *
 * **The exemptions are load-bearing, not decorative.** All three of
 * (b)(12)(i)(A), (B) and (C) apply to both provisions — (b)(2)(i)(D) says so in
 * its closing sentence — and without them the rule reports ordinary labels:
 * (A) alone excuses every package small enough for the reduced displays, which is
 * a large share of the ones that would otherwise qualify. Each exemption is
 * reported as a pass naming the paragraph that granted it, rather than as
 * silence, because a rule that declines invisibly is indistinguishable from one
 * that is broken.
 */

import { dualColumnDuty, smallPackageRouteApplies } from '../../fda/nutritionFormats'
import { DUAL_COLUMN_BASIS_REFERENCE } from '../../fda/nutritionFormats'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_DUAL_COLUMN_MISSING = 'FDA_DUAL_COLUMN_MISSING'
export const FDA_DUAL_COLUMN_MET = 'FDA_DUAL_COLUMN_MET'
export const FDA_DUAL_COLUMN_EXEMPT = 'FDA_DUAL_COLUMN_EXEMPT'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(b)(12)(i)',
  title: 'A second column for a package holding 200 to 300 percent of the reference amount',
}

const BASIS_NAME = {
  'per-container': 'the entire package',
  'per-unit': 'the individual unit',
} as const

export const usFoodDualColumnRule: UsFoodRule = {
  id: 'us-food/dual-column-required',
  title: 'A package holding 200 to 300 percent of its reference amount carries a second column.',
  citation: CITATION,
  codes: [FDA_DUAL_COLUMN_MISSING, FDA_DUAL_COLUMN_MET, FDA_DUAL_COLUMN_EXEMPT],
  appliesTo: 'us-food',

  check({ data, layout }: UsFoodContext): Finding[] {
    const panel = data.nutritionFacts
    if (panel === undefined) return []

    // (A) turns on entitlement — "products that **meet the requirements to use**
    // the tabular format", not products that use it — so it is computed from the
    // package rather than from the display the label happens to carry.
    const meetsSmallPackageRequirements =
      panel.availableSurfaceSqInches !== undefined &&
      smallPackageRouteApplies({
        availableSqInches: panel.availableSurfaceSqInches,
        ...(panel.cannotAccommodateVertical === undefined
          ? {}
          : { cannotAccommodateVertical: panel.cannotAccommodateVertical }),
      })

    const duty = dualColumnDuty({
      ...(panel.referenceAmount === undefined ? {} : { referenceAmount: panel.referenceAmount }),
      ...(panel.packageContent === undefined ? {} : { packageContent: panel.packageContent }),
      ...(panel.unitContent === undefined ? {} : { unitContent: panel.unitContent }),
      ...(panel.packagedAndSoldIndividually === undefined
        ? {}
        : { packagedAndSoldIndividually: panel.packagedAndSoldIndividually }),
      ...(panel.columns === undefined ? {} : { columns: panel.columns }),
      ...(panel.dualColumnExemption?.rawCommodityVoluntary === undefined
        ? {}
        : { rawCommodityVoluntary: panel.dualColumnExemption.rawCommodityVoluntary }),
      ...(panel.dualColumnExemption?.variedWeight === undefined
        ? {}
        : { variedWeight: panel.dualColumnExemption.variedWeight }),
      meetsSmallPackageRequirements,
    })

    // No duty is nothing to report. A label outside the band, or one that never
    // stated its reference amount, has not been cleared of anything — it has not
    // been asked.
    if (duty.basis === undefined) return []

    const reference = DUAL_COLUMN_BASIS_REFERENCE[duty.basis]
    const percent = duty.percentOfReferenceAmount!.toFixed(0)

    if (duty.exemption !== undefined) {
      return [
        passed(
          usFoodDualColumnRule,
          FDA_DUAL_COLUMN_EXEMPT,
          `This package holds ${percent} percent of its reference amount, which would require a ` +
            `second column for ${BASIS_NAME[duty.basis]} — but ${duty.exemption} excuses it. ` +
            'Whether that exemption applies is a fact about the product, not about the label, ' +
            'and is not checked here.',
          US_FOOD_ELEMENTS.nutritionPanel,
          { ...CITATION, reference: duty.exemption },
        ),
      ]
    }

    // **Asked of the layout, not of the document.** This read `columns.mode` and
    // reported the column present on a tabular panel that draws a single one —
    // certifying content the engine never printed, which is the failure
    // `layout/types.ts` records learning the hard way with the GHS pictograms.
    // What a package carries is a question about what was drawn on it.
    const drawn = layout.elements.some(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
    )

    if (!drawn) {
      return [
        finding(usFoodDualColumnRule, {
          code: FDA_DUAL_COLUMN_MISSING,
          severity: 'violation',
          message:
            `This package holds ${percent} percent of its reference amount, so the panel must ` +
            `carry a second column for ${BASIS_NAME[duty.basis]} beside the one per serving. ` +
            `The panel as drawn carries one column${
              panel.columns?.mode === 'dual' ? ', though the label asks for two' : ''
            }.`,
          measurement: {
            actual: 'one column',
            required: `a second column for ${BASIS_NAME[duty.basis]}`,
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: { ...CITATION, reference },
        }),
      ]
    }

    return [
      passed(
        usFoodDualColumnRule,
        FDA_DUAL_COLUMN_MET,
        `This package holds ${percent} percent of its reference amount and carries the second ` +
          `column ${reference} requires.`,
        US_FOOD_ELEMENTS.nutritionPanel,
        { ...CITATION, reference },
      ),
    ]
  },
}
