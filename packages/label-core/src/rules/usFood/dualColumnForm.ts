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
 * Four requirements, and three of them are geometry:
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
 * - **(e)(3)** the two columns "**shall** be separated by vertical lines".
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
import { MEASUREMENT_TOLERANCE_MM, finding, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'
import { MM_PER_POINT } from '../../geometry/units'

export const FDA_DUAL_COLUMN_HEADINGS_MISSING = 'FDA_DUAL_COLUMN_HEADINGS_MISSING'
export const FDA_DUAL_COLUMN_NOT_SEPARATED = 'FDA_DUAL_COLUMN_NOT_SEPARATED'
export const FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE = 'FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE'
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

const SEPARATED: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.9(e)(3)',
  title: 'The two columns are separated by vertical lines',
}

export const usFoodDualColumnFormRule: UsFoodRule = {
  id: 'us-food/dual-column-form',
  title: 'A dual-column panel heads its columns, separates them and gives both equal prominence.',
  citation: CITATION,
  codes: [
    FDA_DUAL_COLUMN_HEADINGS_MISSING,
    FDA_DUAL_COLUMN_NOT_SEPARATED,
    FDA_DUAL_COLUMN_UNEQUAL_PROMINENCE,
    FDA_DUAL_COLUMN_FORM_MET,
  ],
  appliesTo: 'us-food',

  check({ layout }: UsFoodContext): Finding[] {
    // Asked of the layout throughout. A panel that declares two columns and draws
    // one has nothing here to judge — that absence is the mandate rule's finding,
    // and repeating it under (e) would report one defect twice.
    const drawn = layout.elements.some(
      (element) => element.elementId === US_FOOD_ELEMENTS.nutritionSecondColumn,
    )
    if (!drawn) return []

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

    const rules = layout.primitives.filter(
      (primitive) => primitive.elementId === US_FOOD_ELEMENTS.nutritionColumnRule,
    )
    if (rules.length === 0) {
      findings.push(
        finding(usFoodDualColumnFormRule, {
          code: FDA_DUAL_COLUMN_NOT_SEPARATED,
          severity: 'violation',
          message:
            'The panel’s two columns run together with nothing between them. 101.9(e)(3) requires ' +
            'them to be separated by vertical lines.',
          measurement: { actual: 'no vertical line', required: 'a vertical line between columns' },
          elementId: US_FOOD_ELEMENTS.nutritionPanel,
          citation: SEPARATED,
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
      passed(
        usFoodDualColumnFormRule,
        FDA_DUAL_COLUMN_FORM_MET,
        `The panel heads both columns, separates them by a vertical line and gives both sets of ` +
          'values equal prominence. Whether each heading accurately describes what its column ' +
          'declares is a question about the food, not about the label, and is not checked here.',
        US_FOOD_ELEMENTS.nutritionPanel,
      ),
    ]
  },
}
