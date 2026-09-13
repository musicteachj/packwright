/**
 * The ingredient statement is present, and in descending order of predominance.
 *
 * Source: 21 CFR 101.4(a), read from the eCFR on 2026-09-12.
 *
 * (a)(1): ingredients "shall be listed by common or usual name in descending
 * order of predominance by weight on either the principal display panel or the
 * information panel", except those exempted by § 101.100.
 *
 * (a)(2): the descending-order requirement "do[es] not apply to ingredients
 * present in amounts of 2 percent or less by weight when a listing of these
 * ingredients is placed at the end of the ingredient statement following an
 * appropriate quantifying statement, e.g., 'Contains __ percent or less of
 * ______'". The permitted thresholds are a closed set — "2 percent, or, if
 * desired, 1.5 percent, 1.0 percent, or 0.5 percent" — and "no ingredient to
 * which the quantifying phrase applies may be present in an amount greater than
 * the stated threshold."
 *
 * **Order is checked against declared weights, not asserted.** A list of names in
 * an order is a claim about predominance that nothing can test. Carrying the
 * weight share turns it into a claim that can be wrong, which is the only kind
 * this engine can report on.
 *
 * The § 101.100 exemptions are not modelled and are not inferred: they turn on
 * facts about the product and its packaging rather than on anything drawable. A
 * label claiming one says so, the way a GHS small container does.
 */

import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import { INGREDIENT_THRESHOLD_PERCENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_INGREDIENTS_MISSING = 'FDA_INGREDIENTS_MISSING'
export const FDA_INGREDIENT_NAME_MISSING = 'FDA_INGREDIENT_NAME_MISSING'
export const FDA_INGREDIENTS_OUT_OF_ORDER = 'FDA_INGREDIENTS_OUT_OF_ORDER'
export const FDA_INGREDIENTS_ORDER_MET = 'FDA_INGREDIENTS_ORDER_MET'
export const FDA_INGREDIENTS_EXEMPT = 'FDA_INGREDIENTS_EXEMPT'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.4(a)(1)',
  title: 'Ingredients listed by common or usual name in descending order of predominance by weight',
}

const EXEMPTION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.100',
  title: 'Food; exemptions from labeling',
}

export const usFoodIngredientListRule: UsFoodRule = {
  id: 'us-food/ingredient-list',
  title: 'The ingredient statement is present and in descending order of predominance by weight.',
  citation: CITATION,
  codes: [
    FDA_INGREDIENTS_MISSING,
    FDA_INGREDIENT_NAME_MISSING,
    FDA_INGREDIENTS_OUT_OF_ORDER,
    FDA_INGREDIENTS_ORDER_MET,
    FDA_INGREDIENTS_EXEMPT,
  ],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const ingredients = data.ingredients ?? []

    // The exemption excuses the *absence* of a statement, not the disorder of
    // one that is printed anyway. §101.100 relieves a food of having to bear the
    // list; it says nothing that makes a voluntary list exempt from running in
    // descending order, and a consumer reading a printed statement has no way of
    // knowing it was voluntary. So this short-circuits only when nothing is
    // listed — otherwise what is on the label is checked like any other list.
    if (data.ingredientsExempt === true && ingredients.length === 0) {
      return [
        passed(
          usFoodIngredientListRule,
          FDA_INGREDIENTS_EXEMPT,
          'The label claims an exemption from ingredient labelling, so the statement is not ' +
            'required. Whether the exemption applies is a fact about the product, not about the ' +
            'label, and is not checked here.',
          US_FOOD_ELEMENTS.ingredients,
          EXEMPTION,
        ),
      ]
    }

    if (ingredients.length === 0) {
      return [
        finding(usFoodIngredientListRule, {
          code: FDA_INGREDIENTS_MISSING,
          severity: 'blocking',
          message:
            'The label bears no ingredient statement. A packaged food must list its ingredients ' +
            'unless § 101.100 exempts it, which this label does not claim.',
          measurement: { actual: 'no ingredients listed', required: 'an ingredient statement' },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        }),
      ]
    }

    // 101.4(a)(1) does not merely require a list — ingredients "shall be listed
    // by **common or usual name**". An entry with no name at all is not one, and
    // the engine draws it: a blank reaches the statement as "INGREDIENTS: oats, ,
    // salt.", which is why the removal handler in the rail carries a comment
    // about having once drawn "INGREDIENTS: .". Nothing reported it, and the API
    // rejected the document instead — a `min(1)` standing in for a rule, which
    // turned a compliance finding into a 400 on the one screen a user meets it.
    const unnamed = ingredients.filter((ingredient) => ingredient.name.trim() === '').length
    if (unnamed > 0) {
      return [
        finding(usFoodIngredientListRule, {
          code: FDA_INGREDIENT_NAME_MISSING,
          severity: 'violation',
          message:
            `${unnamed === 1 ? 'An ingredient is' : `${unnamed} ingredients are`} listed with no ` +
            'name. 101.4(a)(1) requires each to be listed by its common or usual name.',
          measurement: {
            actual: `${unnamed} unnamed of ${ingredients.length}`,
            required: 'a common or usual name for every ingredient',
          },
          elementId: US_FOOD_ELEMENTS.ingredients,
        }),
      ]
    }

    // Entries behind a 101.4(a)(2) quantifying statement are outside the
    // ordering requirement entirely, so they are excluded before the comparison
    // rather than compared and forgiven — the threshold rule judges them.
    //
    // Clamped, because an unclamped count produced an empty slice and this rule
    // then reported "0 ingredients run in descending order" as a pass, about a
    // list it had not looked at. The count reaches here from a form that never
    // lowered it on removal and an API that set no upper bound.
    const grouped = Math.min(Math.max(0, data.ingredientThreshold?.count ?? 0), ingredients.length)
    const ordered = ingredients.slice(0, ingredients.length - grouped)

    // Every entry released from the ordering requirement leaves nothing for this
    // rule to order. That is a rule declining, not a list cleared — the threshold
    // rule is the one with something to say about a label like that.
    if (ordered.length === 0) return []

    const inversions = ordered.flatMap((ingredient, index) => {
      const next = ordered[index + 1]
      return next !== undefined && next.percentByWeight > ingredient.percentByWeight
        ? [{ ingredient, next }]
        : []
    })

    if (inversions.length > 0) {
      const [first] = inversions
      return [
        finding(usFoodIngredientListRule, {
          code: FDA_INGREDIENTS_OUT_OF_ORDER,
          severity: 'violation',
          message:
            `"${first!.next.name}" is ${first!.next.percentByWeight}% of the food and is listed ` +
            `after "${first!.ingredient.name}" at ${first!.ingredient.percentByWeight}%. ` +
            'Ingredients run in descending order of predominance by weight.',
          measurement: {
            actual: `${first!.ingredient.name} then ${first!.next.name}`,
            required: `${first!.next.name} then ${first!.ingredient.name}`,
          },
          elementId: US_FOOD_ELEMENTS.ingredients,
        }),
      ]
    }

    return [
      passed(
        usFoodIngredientListRule,
        FDA_INGREDIENTS_ORDER_MET,
        `${ordered.length} ingredient${ordered.length === 1 ? '' : 's'} run in descending order ` +
          `of predominance by weight${grouped > 0 ? `, with ${grouped} grouped behind the quantifying statement` : ''}.`,
        US_FOOD_ELEMENTS.ingredients,
      ),
    ]
  },
}

export const FDA_INGREDIENT_THRESHOLD_EXCEEDED = 'FDA_INGREDIENT_THRESHOLD_EXCEEDED'
export const FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED = 'FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED'
export const FDA_INGREDIENT_THRESHOLD_MET = 'FDA_INGREDIENT_THRESHOLD_MET'

const THRESHOLD_CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.4(a)(2)',
  title: 'Ingredients of 2 percent or less grouped behind a quantifying statement',
}

export const usFoodIngredientThresholdRule: UsFoodRule = {
  id: 'us-food/ingredient-threshold',
  title: 'Ingredients grouped behind a quantifying statement are within the threshold it states.',
  citation: THRESHOLD_CITATION,
  codes: [
    FDA_INGREDIENT_THRESHOLD_EXCEEDED,
    FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED,
    FDA_INGREDIENT_THRESHOLD_MET,
  ],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const threshold = data.ingredientThreshold
    const ingredients = data.ingredients ?? []
    // No grouping claimed is no exception invoked, and an exception nobody
    // invoked has not been complied with — it simply does not arise.
    if (threshold === undefined || threshold.count <= 0 || ingredients.length === 0) return []

    if (!INGREDIENT_THRESHOLD_PERCENTS.includes(threshold.percent)) {
      return [
        finding(usFoodIngredientThresholdRule, {
          code: FDA_INGREDIENT_THRESHOLD_NOT_PERMITTED,
          severity: 'violation',
          message:
            `The quantifying statement reads ${threshold.percent} percent. 101.4(a)(2) permits ` +
            '2 percent, 1.5 percent, 1.0 percent or 0.5 percent, and nothing else.',
          measurement: {
            actual: `${threshold.percent} percent`,
            required: INGREDIENT_THRESHOLD_PERCENTS.map((p) => `${p} percent`).join(', '),
          },
          elementId: US_FOOD_ELEMENTS.ingredients,
        }),
      ]
    }

    const grouped = ingredients.slice(
      Math.max(0, ingredients.length - Math.min(threshold.count, ingredients.length)),
    )
    const over = grouped.filter((ingredient) => ingredient.percentByWeight > threshold.percent)

    if (over.length > 0) {
      return over.map((ingredient) =>
        finding(usFoodIngredientThresholdRule, {
          code: FDA_INGREDIENT_THRESHOLD_EXCEEDED,
          severity: 'violation',
          message:
            `"${ingredient.name}" is ${ingredient.percentByWeight}% of the food and sits behind a ` +
            `statement covering ${threshold.percent} percent or less. No ingredient the phrase ` +
            'applies to may exceed the threshold it states.',
          measurement: {
            actual: `${ingredient.percentByWeight}%`,
            required: `${threshold.percent}% or less`,
          },
          elementId: US_FOOD_ELEMENTS.ingredients,
        }),
      )
    }

    return [
      passed(
        usFoodIngredientThresholdRule,
        FDA_INGREDIENT_THRESHOLD_MET,
        `${grouped.length} ingredient${grouped.length === 1 ? '' : 's'} sit behind the ` +
          `${threshold.percent} percent statement, none exceeding it.`,
        US_FOOD_ELEMENTS.ingredients,
      ),
    ]
  },
}
