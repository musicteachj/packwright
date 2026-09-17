/**
 * A panel that carries two columns presents them the way 101.9(e) requires.
 *
 * Source: 21 CFR 101.9(e), read from the eCFR on 2026-09-13.
 *
 * **This rule says nothing about whether to carry two columns.** (e) opens
 * "Nutrition information **may** be presented for two or more forms of the same
 * food", which is a permission, and `us-food/dual-column-required` is the only
 * rule here entitled to demand a second column — on the strength of (b)(12)(i)
 * and (b)(2)(i)(D), which say *must* and *shall*. Everything below applies once a
 * label has already chosen to carry one, which is what "When such dual labeling
 * is provided" means.
 *
 * Five requirements, and three of them are geometry:
 *
 * - **(e)** "When such dual labeling is provided, **equal prominence shall** be
 *   given to both sets of values." Measured as type size, which is the dimension
 *   the engine sets and a reader sees. It is not measured as horizontal extent:
 *   "Sodium 0mg 0%" and "Sodium 1,250mg 54%" are different widths and equally
 *   prominent, and a rule comparing column widths would report the arithmetic.
 * - **(e)(1)** "Following the serving size information there **shall** be two or
 *   more column headings accurately describing the amount per serving size".
 *   Presence and distinctness are checkable; *accuracy* is not — whether "Per
 *   prepared portion" describes the portion is a question about the food.
 * - **(e)(3)** the two columns "**shall** be separated by vertical lines" — and (e)(6) says
 *   the same of the per-container and per-unit columns, so which paragraph a finding cites
 *   follows what the second column counts. See `dualColumnParagraphs.ts`.
 * - **(e)(4)**, and (e)(6)(i) for the mandatory bases, put the vitamins and
 *   minerals after a bar "arrayed vertically in the following order: Vitamin D,
 *   calcium, iron, potassium". **Not checked here** — `us-food/nutrition-order`
 *   already measures 101.9(c)'s order over the whole panel, and the four names in
 *   that sequence are in the same relative order there. Two rules reporting one
 *   defect under two citations is the mistake the net-quantity family was
 *   untangled to avoid.
 *
 * (e)(4) and (e)(6)(i) differ by one parenthetical — (e)(4) reads "vitamins and
 * minerals (**except sodium**)" and (e)(6)(i) omits it — which changes nothing
 * about the order the four are listed in, and so changes nothing here. It is
 * recorded because the difference is real and a later reader will wonder.
 */

import { NUTRITION_ROW_PREFIX, US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { TextPrimitive } from '../../layout/types'
import type { Citation, Finding } from '../../types/index'
import { MEASUREMENT_TOLERANCE_MM, finding, passedOnArtwork } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'
import {
  DUAL_COLUMN_REFERENCES,
  eachColumnReference,
  separatedColumnsReference,
} from './dualColumnParagraphs'
import type { DualColumnReference } from './dualColumnParagraphs'
import type { DualColumnBasis, DualColumnDuty } from '../../fda/nutritionFormats'
import { dualColumnDutyFor, whyNotReached } from './mandatoryColumns'
import { MM_PER_POINT } from '../../geometry/units'

export const FDA_DUAL_COLUMN_HEADINGS_MISSING = 'FDA_DUAL_COLUMN_HEADINGS_MISSING'
export const FDA_DUAL_COLUMN_NOT_SEPARATED = 'FDA_DUAL_COLUMN_NOT_SEPARATED'
export const FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE = 'FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE'
export const FDA_DUAL_COLUMN_INCOMPLETE = 'FDA_DUAL_COLUMN_INCOMPLETE'
export const FDA_DUAL_COLUMN_FORM_MET = 'FDA_DUAL_COLUMN_FORM_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(e)',
  title: 'The form of a dual-column Nutrition Facts panel',
}

const HEADINGS: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(e)(1)',
  title: 'Column headings describing what each column declares',
}

/**
 * What each of 101.9(e)'s column paragraphs requires of the *form* of the panel, which is
 * what this rule measures: both columns filled, and a line between them.
 */
const COLUMN_PARAGRAPHS: Record<DualColumnReference, Citation> = {
  [DUAL_COLUMN_REFERENCES.forms]: {
    authority: 'FDA',
    reference: DUAL_COLUMN_REFERENCES.forms,
    title:
      'The quantitative information is presented for the form as packaged and for every other form',
  },
  [DUAL_COLUMN_REFERENCES.unitsAndGroups]: {
    authority: 'FDA',
    reference: DUAL_COLUMN_REFERENCES.unitsAndGroups,
    title:
      'Dual labeling for forms, combinations, units or RDI groups fills two columns and separates them by vertical lines',
  },
  [DUAL_COLUMN_REFERENCES.servingAndContainer]: {
    authority: 'FDA',
    reference: DUAL_COLUMN_REFERENCES.servingAndContainer,
    title:
      'Per-serving and per-container or per-unit information fills two columns and separates them by vertical lines',
  },
}

export const usFoodDualColumnFormRule: UsFoodRule = {
  id: 'us-food/dual-column-form',
  title:
    'A dual-column panel declares both forms, heads its columns, separates them and gives both equal prominence.',
  citation: CITATION,
  citations: [CITATION, HEADINGS, ...Object.values(COLUMN_PARAGRAPHS)],
  codes: [
    FDA_DUAL_COLUMN_HEADINGS_MISSING,
    FDA_DUAL_COLUMN_NOT_SEPARATED,
    FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE,
    FDA_DUAL_COLUMN_INCOMPLETE,
    FDA_DUAL_COLUMN_FORM_MET,
  ],
  appliesTo: 'us-food',

  check({ data, layout, stock }: UsFoodContext): Finding[] {
    // Asked of the layout throughout. A panel that declares two columns and draws
    // one has nothing here to judge — that absence is the mandate rule's finding,
    // and repeating it under (e) would report one defect twice.
    const drawn = layout.elements.some(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
    )
    if (!drawn) return []

    // The paragraphs that apply turn on what the second column counts, and — for (e)(6)
    // alone — on whether this label was obliged to carry the column at all. Two labels can
    // fall back to (e), the dual labeling paragraph: one that states no basis, and one
    // carrying a column voluntarily that no subparagraph of (e) reaches.
    // Written as the sibling messages write it — "101.9(e)(6)" — since the finding's
    // citation field already carries the full reference.
    const paragraphOf = (reference: string) => reference.replace('21 CFR ', '')
    const paragraph = (citation: Citation) => paragraphOf(citation.reference)
    const basis = data.nutritionFacts?.columns?.basis
    const duty = dualColumnDutyFor(data, stock)
    const reference = (
      lookup: (
        basis: DualColumnBasis,
        standing: DualColumnDuty['standing'],
      ) => DualColumnReference | undefined,
    ): Citation => {
      if (basis === undefined) return CITATION
      const found = lookup(basis, duty.standing)
      return found === undefined ? CITATION : COLUMN_PARAGRAPHS[found]
    }
    const bothColumns = reference(eachColumnReference)
    const separated = reference(separatedColumnsReference)

    // Why the finding cites (e) rather than one of its subparagraphs. The reasons read
    // alike in a citation and are nothing alike to act on, and the one to assert most
    // carefully is "voluntary": it claims the user chose to add the column, which is only
    // true where the label stated every fact the question turns on and they came back no.
    const unnamed = (requirement: string): string => {
      if (basis === undefined) {
        return (
          'The label states no basis for its second column, so the subparagraph of 101.9(e) ' +
          `that applies cannot be named; each of them requires ${requirement}.`
        )
      }
      return (
        `101.9(e)(6) reaches only the columns (b)(12)(i) and (b)(2)(i)(D) require, and ` +
        `${whyNotReached(basis, duty)}. No subparagraph of 101.9(e) names this column; each ` +
        `of them requires ${requirement}.`
      )
    }

    const textOf = (elementId: string): TextPrimitive[] =>
      layout.primitives.filter(
        (primitive): primitive is TextPrimitive =>
          primitive.kind === 'text' && primitive.elementId === elementId,
      )

    const findings: Finding[] = []

    const headings = textOf(US_FOOD_ELEMENTS.nutritionColumnHeading).map((p) => p.text.trim())
    const distinct = new Set(headings)
    if (headings.length < 2 || distinct.size < headings.length) {
      findings.push(
        finding(usFoodDualColumnFormRule, {
          code: FDA_DUAL_COLUMN_HEADINGS_MISSING,
          severity: 'violation',
          message:
            headings.length < 2
              ? `The panel carries two columns and ${headings.length === 0 ? 'no' : 'one'} column ` +
                'heading. 101.9(e)(1) requires a heading for each, describing what it declares.'
              : 'The panel’s two column headings read the same, so neither says which column is ' +
                'which. 101.9(e)(1) requires each to describe the amount it declares.',
          measurement: {
            actual: headings.length === 0 ? 'no headings' : headings.join(' / '),
            required: 'a distinct heading over each column',
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: HEADINGS,
        }),
      )
    }

    /**
     * Both columns carry the information, under the paragraph for what the second
     * column counts.
     *
     * (e)(2), for forms and combinations: "The quantitative information by weight as
     * required in paragraph (d)(7)(i) and the information required in paragraph
     * (d)(7)(ii) of this section **shall** be presented for the form of the product
     * as packaged **and for any other form** of the product." (e)(3) says it of units
     * and RDI groups and (e)(6) of the per-container and per-unit columns, each "in
     * two columns". So a second column is not a place to put one figure; it is a
     * second declaration of the nutrients the first one declares.
     *
     * The engine draws the second-column band as soon as any single nutrient
     * carries a second amount, which is right — it draws what it was asked for —
     * and left this rule reporting `FDA_DUAL_COLUMN_FORM_MET` on a panel with one
     * figure in a column of fourteen. (b)(12)(i)'s mandate satisfied by a
     * fifteenth of a column.
     *
     * Counted off the end-anchored runs on each nutrient row, which is what a
     * value cell is: one per column. A row with a value in the first column and
     * none in the second has declared that nutrient for one form only. A row with
     * neither is a different question — whether the nutrient should be there at
     * all is `us-food/nutrition-completeness`, under 101.9(c).
     */
    // Which column a lone value cell sits in is read off the headings, which are
    // end-anchored at their own column's right edge. Counting cells alone said
    // "declares a quantity in the first column only" about a nutrient declared
    // only in the *second* — a message a user cannot act on, and exactly the kind
    // of confidently wrong sentence this project treats as worse than silence.
    const headingXs = textOf(US_FOOD_ELEMENTS.nutritionColumnHeading)
      .map((primitive) => primitive.xMm)
      .sort((a, b) => a - b)
    const secondColumnRightMm = headingXs[headingXs.length - 1]

    const rows = layout.elements.filter((element) =>
      element.elementId.startsWith(NUTRITION_ROW_PREFIX),
    )
    const missing = { first: [] as string[], second: [] as string[] }

    for (const row of rows) {
      const cells = textOf(row.elementId).filter((primitive) => primitive.anchor === 'end')
      if (cells.length !== 1) continue
      const inSecondColumn =
        secondColumnRightMm !== undefined &&
        Math.abs(cells[0]!.xMm - secondColumnRightMm) < MEASUREMENT_TOLERANCE_MM
      if (inSecondColumn) missing.first.push(row.label)
      else missing.second.push(row.label)
    }

    const shortRows = [...missing.first, ...missing.second]
    if (shortRows.length > 0) {
      const clause = (names: string[], column: string) =>
        names.length === 0
          ? ''
          : `${names.length === 1 ? 'one nutrient declares' : `${names.length} nutrients declare`} ` +
            `a quantity in the ${column} column only — ${names.join(', ')}`
      const clauses = [clause(missing.second, 'first'), clause(missing.first, 'second')].filter(
        (part) => part !== '',
      )

      findings.push(
        finding(usFoodDualColumnFormRule, {
          code: FDA_DUAL_COLUMN_INCOMPLETE,
          severity: 'violation',
          message:
            `The panel carries two columns, but ${clauses.join('; and ')}. ` +
            (bothColumns === CITATION
              ? unnamed('the quantitative information in both columns')
              : `${paragraph(bothColumns)} requires the quantitative information in both columns.`),
          measurement: {
            actual: `${shortRows.length} of ${rows.length} rows carry one column`,
            required: 'both columns on every row that declares a quantity',
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: bothColumns,
        }),
      )
    }

    const rules = layout.primitives.filter(
      (primitive) => primitive.elementId === US_FOOD_ELEMENTS.nutritionColumnRule,
    )
    if (rules.length === 0) {
      findings.push(
        finding(usFoodDualColumnFormRule, {
          code: FDA_DUAL_COLUMN_NOT_SEPARATED,
          severity: 'violation',
          message:
            'The panel’s two columns run together with nothing between them. ' +
            (separated === CITATION
              ? unnamed('vertical lines between the columns')
              : `${paragraph(separated)} requires them to be separated by vertical lines.`),
          measurement: { actual: 'no vertical line', required: 'a vertical line between columns' },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: separated,
        }),
      )
    }

    // Equal prominence, measured across the values themselves rather than across
    // the panel: the nutrient names are shared by both columns, so only the
    // figures can be set unequally.
    const rowSizes = layout.primitives.filter(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' &&
        (primitive.elementId?.startsWith(NUTRITION_ROW_PREFIX) ?? false),
    )
    const largest = Math.max(...rowSizes.map((p) => p.fontSizeMm), 0)
    const smallest = Math.min(...rowSizes.map((p) => p.fontSizeMm), Infinity)
    if (rowSizes.length > 0 && largest - smallest > MEASUREMENT_TOLERANCE_MM) {
      findings.push(
        finding(usFoodDualColumnFormRule, {
          code: FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE,
          severity: 'violation',
          message:
            `One set of values is set at ${(smallest / MM_PER_POINT).toFixed(1)} point and the ` +
            `other at ${(largest / MM_PER_POINT).toFixed(1)}. 101.9(e) requires equal prominence ` +
            'to be given to both.',
          measurement: {
            actual: `${(smallest / MM_PER_POINT).toFixed(1)} pt and ${(largest / MM_PER_POINT).toFixed(1)} pt`,
            required: 'both sets at the same size',
          },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: CITATION,
        }),
      )
    }

    if (findings.length > 0) return findings

    return [
      // 101.9(e): headings, separating lines and equal prominence are all ink: the artwork.
      passedOnArtwork(
        usFoodDualColumnFormRule,
        FDA_DUAL_COLUMN_FORM_MET,
        'The panel declares every nutrient in both columns, heads them, separates them by a ' +
          'vertical line and gives both sets of values equal prominence. Whether each heading ' +
          'accurately describes what its column declares is a question about the food, not about ' +
          'the label, and is not checked here.',
        US_FOOD_ELEMENTS.nutritionPanel,
      ),
    ]
  },
}
