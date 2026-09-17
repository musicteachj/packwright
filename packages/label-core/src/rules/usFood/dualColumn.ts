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

import { willDrawSecondColumn } from '../../layout/nutritionPanel'
import { DUAL_COLUMN_BASIS_REFERENCE } from '../../fda/nutritionFormats'
import type { MandatoryDualColumnBasis } from '../../fda/nutritionFormats'
import { dualColumnDutyFor } from './mandatoryColumns'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, passedOnDocument, untitled } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_DUAL_COLUMN_MISSING = 'FDA_DUAL_COLUMN_MISSING'
export const FDA_DUAL_COLUMN_MET = 'FDA_DUAL_COLUMN_MET'
export const FDA_DUAL_COLUMN_EXEMPT = 'FDA_DUAL_COLUMN_EXEMPT'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(b)(12)(i)',
  title: 'A second column for a package holding 200 to 300 percent of the reference amount',
}

/**
 * The two bases that carry an obligation, as a value rather than only a type.
 *
 * A `Record<MandatoryDualColumnBasis, true>` rather than an array, because the
 * array form does not do what it appears to. `readonly MandatoryDualColumnBasis[]`
 * constrains what may go *in* and says nothing about what must: widening the
 * union leaves this compiling happily, and the rule would quietly stop declaring
 * the paragraph it had started reporting under. A record keyed on the union is
 * exhaustive, so adding a mandatory basis fails the build here.
 */
const MANDATORY_DUAL_COLUMN_BASES: Record<MandatoryDualColumnBasis, true> = {
  'per-container': true,
  'per-unit': true,
}

const BASIS_NAME = {
  'per-container': 'the entire package',
  'per-unit': 'the individual unit',
} as const

export const usFoodDualColumnRule: UsFoodRule = {
  id: 'us-food/dual-column-required',
  title: 'A package holding 200 to 300 percent of its reference amount carries a second column.',
  citation: CITATION,
  /**
   * The basis decides which paragraph demands the column and the exemptions each
   * cite their own, so this rule ranges over both tables in
   * `fda/nutritionFormats`. Built from them rather than restated, because a
   * second copy of a table is a second copy to keep in step.
   */
  citations: [
    CITATION,
    ...[
      ...new Set([
        // **Only the bases this rule can actually report under.**
        // `DUAL_COLUMN_BASIS_REFERENCE` is keyed on every `DualColumnBasis`,
        // including the voluntary ones 101.9(e) permits, and `dualColumnDuty`
        // returns a `MandatoryDualColumnBasis` — two of the seven. Listing all
        // seven made this rule advertise 101.9(e)(5) and (b)(10)(iii), which it
        // has no path to emit: a catalogue entry claiming a check that never
        // runs, which is the same defect as a rule that can never fail. The
        // annotation is what keeps it honest — adding a mandatory basis widens
        // this list, and adding a voluntary one does not.
        ...Object.keys(MANDATORY_DUAL_COLUMN_BASES).map(
          (basis) => DUAL_COLUMN_BASIS_REFERENCE[basis as MandatoryDualColumnBasis],
        ),
        // The three exemptions `dualColumnDuty` can return. Written out because
        // it returns them from a chain of conditionals rather than a table, and
        // a rule may not report under a paragraph the catalogue does not list.
        '21 CFR 101.9(b)(12)(i)(A)',
        '21 CFR 101.9(b)(12)(i)(B)',
        '21 CFR 101.9(b)(12)(i)(C)',
      ]),
    ]
      .filter((reference) => reference !== CITATION.reference)
      .sort()
      .map((reference) => untitled(CITATION, reference)),
  ],
  codes: [FDA_DUAL_COLUMN_MISSING, FDA_DUAL_COLUMN_MET, FDA_DUAL_COLUMN_EXEMPT],
  appliesTo: 'us-food',

  check({ data, layout, stock }: UsFoodContext): Finding[] {
    const panel = data.nutritionFacts
    if (panel === undefined) return []

    // Assembled in `mandatoryColumns.ts`, because two other rules need the same
    // answer to decide whether (e)(6) reaches the column they are judging.
    const duty = dualColumnDutyFor(data, stock)

    // No duty is nothing to report. A label outside the band, or one that never
    // stated its reference amount, has not been cleared of anything — it has not
    // been asked.
    if (duty.basis === undefined) return []

    const reference = DUAL_COLUMN_BASIS_REFERENCE[duty.basis]
    const percent = duty.percentOfReferenceAmount!.toFixed(0)

    if (duty.exemption !== undefined) {
      return [
        // On the document, not the artwork: the message below says so itself.
        // An exemption is a fact about the product, so it survives a panel the
        // engine could not draw — and withholding it there would leave the
        // label saying nothing at all about a column it was never required to
        // carry.
        passedOnDocument(
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

    // **No panel drawn at all, and the column is still owed.** Only (j)(14) reaches this: an
    // egg carton's information is presented beneath the lid or in an insert, and a panel run
    // off the stock still records its elements. The layout has no column to read, and
    // "the panel as drawn carries one column" would describe a panel not on the label. But
    // (j)(14) moves the required information rather than excusing it, so the column is
    // judged on the figures declared for it: whether a second column is asked for and given
    // figures, which is all `willDrawSecondColumn` asks. Not whether this engine could draw it
    // in the display declared — the dual-column tabular display is one (e)(6)(ii) illustrates
    // and this engine has not built, and a carton presenting it beneath the lid breaks no
    // rule by that. A column declared is not certified, because nothing here printed it; the
    // pass that would say so is simply not issued. The first cut of this returned nothing
    // either way, and its review found it excusing a column the regulation still demands.
    if (!layout.elements.some((element) => element.elementId === US_FOOD_ELEMENTS.nutritionPanel)) {
      if (willDrawSecondColumn(panel)) return []
      return [
        finding(usFoodDualColumnRule, {
          code: FDA_DUAL_COLUMN_MISSING,
          severity: 'violation',
          message:
            `This package holds ${percent} percent of its reference amount, so its nutrition ` +
            `information must carry a second column for ${BASIS_NAME[duty.basis]} beside the one ` +
            'per serving. The information declared for presentation off this label carries one ' +
            `column${panel.columns?.mode === 'dual' ? ', though the label asks for two' : ''}.`,
          measurement: {
            actual: 'one column declared',
            required: `a second column for ${BASIS_NAME[duty.basis]}`,
          },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
          citation: { ...CITATION, reference },
        }),
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
      // (b)(12)(i): the package "must provide an additional column" — printed, so the artwork.
      passedOnArtwork(
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
