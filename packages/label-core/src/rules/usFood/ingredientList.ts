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
 * **The § 101.100 exemptions are declared, never inferred, and each by the
 * paragraph claimed.** A bare "exempt" could not be judged, because the limbs of
 * (a) differ in kind: (a)(1) excuses an assortment "on the condition that the
 * label shall bear, in conjunction with the names of such ingredients as are
 * common to all packages, a statement … indicating by name other ingredients
 * which may be present", while (a)(2)'s condition is on a retail display. So the
 * pass cites the paragraph and says what it does not check, and a label saved
 * with the old bare flag gets an advisory asking which paragraph it claims. The
 * passes rest on the artwork like the rest. Read from the eCFR on 2026-09-16.
 */

import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type {
  UsFoodAssortmentExemption,
  UsFoodIngredientsExemptionKind,
} from '../../templates/usFood'
import type { TextPrimitive } from '../../layout/types'
import { INGREDIENT_THRESHOLD_PERCENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork, untitled } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_INGREDIENTS_MISSING = 'FDA_INGREDIENTS_MISSING'
export const FDA_INGREDIENT_NAME_MISSING = 'FDA_INGREDIENT_NAME_MISSING'
export const FDA_INGREDIENTS_OUT_OF_ORDER = 'FDA_INGREDIENTS_OUT_OF_ORDER'
export const FDA_INGREDIENTS_ORDER_MET = 'FDA_INGREDIENTS_ORDER_MET'
export const FDA_INGREDIENTS_EXEMPT = 'FDA_INGREDIENTS_EXEMPT'
export const FDA_INGREDIENTS_EXEMPTION_UNSTATED = 'FDA_INGREDIENTS_EXEMPTION_UNSTATED'
export const FDA_ASSORTMENT_STATEMENT_MISSING = 'FDA_ASSORTMENT_STATEMENT_MISSING'
export const FDA_ASSORTMENT_STATEMENT_INCOMPLETE = 'FDA_ASSORTMENT_STATEMENT_INCOMPLETE'

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

/**
 * Each exemption cites the paragraph that grants it, and says what of that
 * paragraph is not checked. Untitled, because the subparagraphs carry no heading
 * of their own to quote.
 */
const EXEMPTIONS: Record<
  Exclude<UsFoodIngredientsExemptionKind, 'assortment'>,
  { citation: Citation; grants: string; unchecked: string }
> = {
  'bulk-at-retail': {
    citation: untitled(EXEMPTION, '21 CFR 101.100(a)(2)'),
    grants: 'a food received in bulk containers at a retail establishment',
    unchecked:
      'that it is displayed with the bulk container’s labeling plainly in view, or with a ' +
      'counter card, sign or other device, bearing the ingredient information in lettering at ' +
      'least one-fourth of an inch high — a condition on the retail display, not on this label',
  },
}

/** § 101.100(a)(1), the one ingredient exemption whose condition is on the label. */
const ASSORTMENT = untitled(EXEMPTION, '21 CFR 101.100(a)(1)')

export const usFoodIngredientListRule: UsFoodRule = {
  id: 'us-food/ingredient-list',
  title: 'The ingredient statement is present and in descending order of predominance by weight.',
  citation: CITATION,
  citations: [
    CITATION,
    EXEMPTION,
    ...Object.values(EXEMPTIONS).map((exemption) => exemption.citation),
    ASSORTMENT,
  ],
  codes: [
    FDA_INGREDIENTS_MISSING,
    FDA_INGREDIENT_NAME_MISSING,
    FDA_INGREDIENTS_OUT_OF_ORDER,
    FDA_INGREDIENTS_ORDER_MET,
    FDA_INGREDIENTS_EXEMPT,
    FDA_INGREDIENTS_EXEMPTION_UNSTATED,
    FDA_ASSORTMENT_STATEMENT_MISSING,
    FDA_ASSORTMENT_STATEMENT_INCOMPLETE,
  ],
  appliesTo: 'us-food',

  check(context: UsFoodContext): Finding[] {
    const { data } = context
    const ingredients = data.ingredients ?? []

    // § 101.100(a)(1) exempts an assortment "with respect to any ingredient that is not
    // common to all packages". So the common ingredients are listed and judged like any
    // list — by this same rule on the label without the claim, rather than by a second
    // copy of it — and where no ingredient is common to all packages there is nothing to
    // list, and only the statement is owed.
    if (data.ingredientsExemption?.kind === 'assortment') {
      const statement = assortmentStatement(data.ingredientsExemption, context)
      if (ingredients.length === 0) return statement
      const { ingredientsExemption: _claimed, ...unclaimed } = data
      return [...statement, ...usFoodIngredientListRule.check({ ...context, data: unclaimed })]
    }

    // The exemption excuses the *absence* of a statement, not the disorder of
    // one that is printed anyway. §101.100 relieves a food of having to bear the
    // list; it says nothing that makes a voluntary list exempt from running in
    // descending order, and a consumer reading a printed statement has no way of
    // knowing it was voluntary. So this short-circuits only when nothing is
    // listed — otherwise what is on the label is checked like any other list.
    const claimed = data.ingredientsExemption
    if (claimed !== undefined && ingredients.length === 0) {
      const exemption = EXEMPTIONS[claimed.kind]
      return [
        // Each paragraph's condition is on what the label or its display bears, not on a fact
        // about the food alone: artwork.
        passedOnArtwork(
          usFoodIngredientListRule,
          FDA_INGREDIENTS_EXEMPT,
          `The label claims the ${exemption.citation.reference} exemption for ${exemption.grants}, ` +
            `so the statement is not required. Not checked here: ${exemption.unchecked}.`,
          US_FOOD_ELEMENTS.ingredients,
          exemption.citation,
        ),
      ]
    }

    // A label saved before the paragraph was recorded. It keeps the list excused —
    // reporting a blocking missing statement on a document that once cleared would
    // punish it for this project's own omission — but it is no longer cleared,
    // because a claim naming no paragraph has no conditions anyone could check.
    if (data.ingredientsExempt === true && ingredients.length === 0) {
      return [
        finding(usFoodIngredientListRule, {
          code: FDA_INGREDIENTS_EXEMPTION_UNSTATED,
          severity: 'advisory',
          message:
            'The label is marked exempt from ingredient labelling without saying which § 101.100 ' +
            'exemption it claims. Each carries its own conditions, so the claim cannot be judged ' +
            'until the paragraph is stated.',
          measurement: {
            actual: 'exempt, paragraph not stated',
            required: 'the paragraph claimed',
          },
          elementId: US_FOOD_ELEMENTS.ingredients,
          citation: EXEMPTION,
        }),
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
      // 101.4(a)(1): the ingredients "shall be listed" in that order on the panel: the artwork.
      passedOnArtwork(
        usFoodIngredientListRule,
        FDA_INGREDIENTS_ORDER_MET,
        `${ordered.length} ingredient${ordered.length === 1 ? '' : 's'} run in descending order ` +
          `of predominance by weight${grouped > 0 ? `, with ${grouped} grouped behind the quantifying statement` : ''}.`,
        US_FOOD_ELEMENTS.ingredients,
      ),
    ]
  },
}

/**
 * § 101.100(a)(1)'s condition, judged on what printed.
 *
 * **Read from the layout**, like the allergen rule, because the condition is that "the
 * label shall bear" the statement. **Each declared name must appear in it** as a word or
 * phrase of its own, regardless of case: the statement is written by the labeller in whatever words
 * are "as informative as practicable", so this checks that it names what the label says
 * may be present, and nothing about how. Whether those are all the other ingredients,
 * whether the listed ones are common to every package, and whether the variation
 * "normally occur[s] in good packing practice" are facts about the assortment, and are
 * said to be unchecked on the pass.
 *
 * **The pass names the statement**, so a statement that did not print withholds it.
 */
/**
 * Whether the text names the ingredient as a word or phrase of its own, regardless of
 * case.
 *
 * A bare substring was the first version, and a review found it clearing labels that
 * named nothing: "egg" inside "eggplant", "pea" inside "peanuts", "oat" inside
 * "chocolate-coated". So the name must be bounded on both sides by something that is not
 * a letter or digit. That is stricter than a reader would be — "egg" is not found in
 * "eggs" — and the finding names the ingredient it could not find, so a labeller
 * declares it the way the statement spells it.
 */
function namesWholly(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

function assortmentStatement(
  claimed: UsFoodAssortmentExemption,
  context: UsFoodContext,
): Finding[] {
  const printed = context.layout.primitives
    .filter(
      (primitive): primitive is TextPrimitive =>
        primitive.kind === 'text' && primitive.elementId === US_FOOD_ELEMENTS.assortmentStatement,
    )
    .map((primitive) => primitive.text)
    .join(' ')

  if (printed.trim() === '') {
    return [
      finding(usFoodIngredientListRule, {
        code: FDA_ASSORTMENT_STATEMENT_MISSING,
        severity: 'blocking',
        message:
          'The label claims the § 101.100(a)(1) exemption for an assortment but bears no statement ' +
          'naming the other ingredients which may be present, which is the condition it holds on.',
        measurement: { actual: 'no statement', required: 'a statement naming them' },
        elementId: US_FOOD_ELEMENTS.ingredients,
        citation: ASSORTMENT,
      }),
    ]
  }

  const declared = claimed.mayBePresent.map((name) => name.trim()).filter((name) => name !== '')
  const unnamed = declared.filter((name) => !namesWholly(printed, name))
  if (declared.length === 0 || unnamed.length > 0) {
    return [
      finding(usFoodIngredientListRule, {
        code: FDA_ASSORTMENT_STATEMENT_INCOMPLETE,
        severity: 'violation',
        message:
          declared.length === 0
            ? 'The assortment declares no ingredient that may be present, so its statement cannot ' +
              'be shown to indicate them by name as § 101.100(a)(1) requires.'
            : `The assortment statement does not name ${unnamed.map((name) => `"${name}"`).join(', ')}, ` +
              'which the label declares may be present. § 101.100(a)(1) requires it to indicate ' +
              'them by name.',
        measurement: {
          actual: declared.length === 0 ? 'no names declared' : `${unnamed.length} not named`,
          required: 'every ingredient that may be present, by name',
        },
        elementId: US_FOOD_ELEMENTS.assortmentStatement,
        citation: ASSORTMENT,
      }),
    ]
  }

  return [
    // The condition is that "the label shall bear" the statement, and the pass names it: artwork.
    passedOnArtwork(
      usFoodIngredientListRule,
      FDA_INGREDIENTS_EXEMPT,
      `The label claims the ${ASSORTMENT.reference} exemption for an assortment, and bears a ` +
        `statement naming the ${declared.length} ingredient${declared.length === 1 ? '' : 's'} it ` +
        'declares may be present. Not checked here: whether the variations normally occur in good ' +
        'packing practice, whether the listed ingredients are those common to all packages, ' +
        'whether those named are all the others that may be present, and whether the statement is ' +
        'as informative as practicable and not misleading.',
      US_FOOD_ELEMENTS.assortmentStatement,
      ASSORTMENT,
    ),
  ]
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
      // (a)(2)'s permission turns on a listing "placed at the end" of the statement: the artwork.
      passedOnArtwork(
        usFoodIngredientThresholdRule,
        FDA_INGREDIENT_THRESHOLD_MET,
        `${grouped.length} ingredient${grouped.length === 1 ? '' : 's'} sit behind the ` +
          `${threshold.percent} percent statement, none exceeding it.`,
        US_FOOD_ELEMENTS.ingredients,
      ),
    ]
  },
}
