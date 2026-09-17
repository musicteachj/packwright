/**
 * A food for children 1 through 3 prints its protein percentage.
 *
 * Source: 21 CFR 101.9(c)(7)(i), read from the eCFR on 2026-09-17. A protein percentage
 * "may be placed on the label, **except that such a statement shall be given** if a
 * protein claim is made for the product, or if the product is represented or purported to
 * be specifically for infants through 12 months or children 1 through 3 years of age."
 *
 * **A permission for most foods and a requirement for these.** The percentage rule leaves
 * protein alone, and the panel prints none unless one is stated, which is right for every
 * food the permission covers. For a food declared for children 1 through 3 the modal verb
 * turns to *shall*, and nothing asked for it until this rule.
 *
 * **Whether it is printed, not whether it is right.** (c)(7)(ii) computes the figure from
 * the protein "multiplied by the amino acid score corrected for protein digestibility",
 * which no label carries, so a stated percentage cannot be recomputed. The pass says so.
 *
 * **Not reached.** A protein claim is the other trigger, and this project models no
 * claims. Infants through 12 months are the third, and are not carried.
 */

import {
  US_FOOD_ELEMENTS,
  dailyValuePopulationOf,
  nutritionRowElementId,
} from '../../templates/usFood'
import { wasFullyDrawn } from '../../layout/omissions'
import type { TextPrimitive } from '../../layout/types'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'
import { DUAL_COLUMN_REFERENCES, eachColumnReference } from './dualColumnParagraphs'
import type { DualColumnReference } from './dualColumnParagraphs'
import { smallestOf } from './printedText'

export const FDA_PROTEIN_PERCENT_MISSING = 'FDA_PROTEIN_PERCENT_MISSING'
export const FDA_PROTEIN_PERCENT_MET = 'FDA_PROTEIN_PERCENT_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(c)(7)(i)',
  title: 'A protein percentage, given where the food is for young children or claims protein',
}

/**
 * What each of 101.9(e)'s column paragraphs requires of the *percentages*, which is what
 * this rule reads. Titled for that: the form rule titles the same references for the
 * quantities and the vertical lines it measures instead.
 */
const EACH_COLUMN_PARAGRAPHS: Record<DualColumnReference, Citation> = {
  [DUAL_COLUMN_REFERENCES.forms]: {
    authority: 'FDA',
    reference: DUAL_COLUMN_REFERENCES.forms,
    title: 'Dual labeling presents the percent Daily Value for every form declared',
  },
  [DUAL_COLUMN_REFERENCES.unitsAndGroups]: {
    authority: 'FDA',
    reference: DUAL_COLUMN_REFERENCES.unitsAndGroups,
    title:
      'Dual labeling for forms, combinations, units or RDI groups presents the percent Daily Value in two columns',
  },
  [DUAL_COLUMN_REFERENCES.servingAndContainer]: {
    authority: 'FDA',
    reference: DUAL_COLUMN_REFERENCES.servingAndContainer,
    title: 'Per-serving and per-container or per-unit columns each present the percent Daily Value',
  },
}

const PROTEIN_ROW = nutritionRowElementId('protein')

/** A printed percentage in a row's text: the figure, where one is there. */
const PERCENT = /(\d+(?:\.\d+)?)\s*%/

export const usFoodProteinPercentRule: UsFoodRule = {
  id: 'us-food/protein-percent',
  title: 'A food for children 1 through 3 gives its protein as a percentage of the Daily Value.',
  citation: CITATION,
  citations: [CITATION, ...Object.values(EACH_COLUMN_PARAGRAPHS)],
  codes: [FDA_PROTEIN_PERCENT_MISSING, FDA_PROTEIN_PERCENT_MET],
  appliesTo: 'us-food',

  check({ data, layout }: UsFoodContext): Finding[] {
    const panel = data.nutritionFacts
    if (panel === undefined || dailyValuePopulationOf(panel) !== 'children-1-through-3') return []

    const missing = (
      elementId: string,
      where: string,
      actual = 'no protein percentage',
      citation = CITATION,
    ): Finding =>
      finding(usFoodProteinPercentRule, {
        code: FDA_PROTEIN_PERCENT_MISSING,
        severity: 'violation',
        message:
          'The food is declared for children 1 through 3, and 101.9(c)(7)(i) says the protein ' +
          `percentage "shall be given" for such a food. ${where}`,
        measurement: { actual, required: 'a protein percentage' },
        elementId,
        citation,
      })

    // **No panel drawn, and the figure still owed.** Only (j)(14) reaches this: an egg
    // carton's information is presented beneath the lid, and a panel run off the stock
    // still records its elements. The requirement moves with the information, so it is
    // asked of the declared figures, and a declared one is not certified, since nothing
    // here printed it — as the dual-column rule treats the carton's second column.
    const drawn = layout.elements.some(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionPanel,
    )
    if (!drawn) {
      if (panel.declaredPercentDv?.protein === undefined) {
        return [
          missing(
            US_FOOD_ELEMENTS.principalDisplayPanel,
            'The nutrition information declared for presentation off this label states none.',
          ),
        ]
      }
      // A second column the information declares owes the percentage too, under the
      // paragraph for what it counts, and is asked of the document for the same reason.
      const basis = panel.columns?.basis
      // Keyed on the second column's *protein* amount, as the drawn branch is: a column
      // declaring no protein figure is an incomplete column, which the form rule reports.
      return panel.columns?.secondAmounts?.protein !== undefined &&
        panel.columns?.secondPercentDv?.protein === undefined
        ? [
            missing(
              US_FOOD_ELEMENTS.principalDisplayPanel,
              'Its second column states none.',
              'no protein percentage in the second column',
              basis === undefined ? CITATION : EACH_COLUMN_PARAGRAPHS[eachColumnReference(basis)],
            ),
          ]
        : []
    }

    // A panel with no protein row is missing a mandatory nutrient, which the completeness
    // rule reports; reporting its percentage too would be one absence twice.
    const row = smallestOf(layout, PROTEIN_ROW)
    if (row === undefined) return []

    const printed = PERCENT.exec(row.text)
    if (printed === null) {
      return [missing(PROTEIN_ROW, 'The panel prints the protein row with no percentage.')]
    }

    // **Every column drawn, not the first found.** On a dual-column panel each column's
    // figures are drawn as their own right-aligned run, and the percent Daily Value is
    // presented in each — under (e)(2), (e)(3) or (e)(6) by what the column counts. Reading the row as one string passed a panel whose second
    // column printed "5g" beside a first column's "5g 38%". The second column has no stated
    // percentage to draw, and the engine derives none for protein, so such a panel is
    // reported rather than cleared — true of the label, if not yet fixable in the editor.
    const secondColumnDrawn = layout.elements.some(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
    )
    if (secondColumnDrawn) {
      const columns = layout.primitives.filter(
        (primitive): primitive is TextPrimitive =>
          primitive.kind === 'text' &&
          primitive.elementId === PROTEIN_ROW &&
          primitive.anchor === 'end',
      )
      // A second column with no protein figure at all is an incomplete column, which the
      // dual-column form rule reports; its percentage is not a second absence to report.
      // Nor is it cleared.
      if (columns.length < 2) return []
      if (columns.some((column) => !PERCENT.test(column.text))) {
        // No basis stated names no (e) paragraph, so the requirement itself is cited.
        const basis = panel.columns?.basis
        const citation =
          basis === undefined ? CITATION : EACH_COLUMN_PARAGRAPHS[eachColumnReference(basis)]
        return [
          missing(
            PROTEIN_ROW,
            (basis === undefined
              ? 'The panel draws a second column, and states no basis for it, '
              : `On a dual-column panel, ${citation.reference} presents the percent Daily ` +
                'Value in each column, ') +
              'and the second column prints the protein row with no percentage.',
            'no protein percentage in the second column',
            citation,
          ),
        ]
      }
    }

    // Printed means printed in full: a row the engine recorded anything against, or a
    // panel run off the label, is not certified — the serving-size rule's reasoning.
    if (![US_FOOD_ELEMENTS.nutritionPanel, PROTEIN_ROW].every((id) => wasFullyDrawn(layout, id))) {
      return []
    }

    return [
      // (c)(7)(i): the statement "shall be given" on the label — printed, so the artwork.
      passedOnArtwork(
        usFoodProteinPercentRule,
        FDA_PROTEIN_PERCENT_MET,
        `The panel gives protein as ${printed[1]}% of the Daily Value, as 101.9(c)(7)(i) requires ` +
          'of a food for children 1 through 3. Not checked here: the figure itself, which ' +
          '(c)(7)(ii) corrects by a protein digestibility score no label carries.',
        PROTEIN_ROW,
      ),
    ]
  },
}
