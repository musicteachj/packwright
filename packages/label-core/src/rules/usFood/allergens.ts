/**
 * Every major food allergen on the label is declared, in one of the two forms
 * the Act permits, naming the source it actually requires.
 *
 * Source: **FD&C Act §403(w) / 21 U.S.C. 343(w)**, read from the US Code on
 * 2026-09-12. Not 21 CFR part 101: the whole part contains no definition of
 * "major food allergen" and no declaration requirement for one. FALCPA put both
 * in the Act in 2004 and the FASTER Act added sesame in 2021, and neither was
 * ever carried across into the regulations.
 *
 * §403(w)(1) offers two forms and requires one of them:
 *
 * > (A) the word "Contains", followed by the name of the food source from which
 * > the major food allergen is derived, is printed immediately after or is
 * > adjacent to the list of ingredients (in a type size no smaller than the type
 * > size used in the list of ingredients); **or**
 * > (B) the common or usual name of the major food allergen in the list of
 * > ingredients is followed in parentheses by the name of the food source …
 *
 * with (B) excused where "(i) the common or usual name of the ingredient uses
 * the name of the food source" — `whey (milk)` needs the parenthetical,
 * `buttermilk` does not — or "(ii) the name of the food source … appears
 * elsewhere in the ingredient list".
 *
 * §403(w)(2) is the trap. The food source name is §321(qq)(1)'s name, "provided
 * that in the case of a tree nut, fish, or Crustacean shellfish, the term …
 * means the name of the specific type of nut or species of fish or Crustacean
 * shellfish." So "Contains: tree nuts" declares nothing; "Contains: almonds"
 * does. Three of the nine work this way and six do not.
 *
 * **Not modelled, and recorded rather than left unsaid:** §403(w)(3)'s finding
 * that labeling may substitute for the label, §403(w)(5)'s power to modify the
 * two forms by regulation, and the §403(w)(6) and (7) petition and notification
 * exemptions. All four are facts about a Federal Register docket rather than
 * about a label, so nothing here infers them.
 */

import { foodSourceName, majorFoodAllergen } from '../../fda/allergens'
import type { MajorFoodAllergenId } from '../../fda/allergens'
import { wasFullyDrawn } from '../../layout/omissions'
import type { TextPrimitive } from '../../layout/types'
import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { UsFoodIngredient } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_ALLERGEN_NOT_DECLARED = 'FDA_ALLERGEN_NOT_DECLARED'
export const FDA_ALLERGEN_SOURCE_NOT_SPECIFIC = 'FDA_ALLERGEN_SOURCE_NOT_SPECIFIC'
export const FDA_ALLERGEN_DECLARATION_UNCONFIRMED = 'FDA_ALLERGEN_DECLARATION_UNCONFIRMED'
export const FDA_ALLERGEN_DECLARED_MET = 'FDA_ALLERGEN_DECLARED_MET'

/** The declaring elements in words, for a message a reader can act on. */
const DECLARING_ELEMENT_NAMES: Readonly<Record<string, string>> = {
  [US_FOOD_ELEMENTS.containsStatement]: 'the "Contains" statement',
  [US_FOOD_ELEMENTS.ingredients]: 'the ingredient list',
}

const CITATION: Citation = {
  authority: 'FDA',
  reference: 'FD&C Act §403(w)(1)',
  title: 'Major food allergens declared by a "Contains" statement or an in-line parenthetical',
}

const SPECIFIC: Citation = {
  authority: 'FDA',
  reference: 'FD&C Act §403(w)(2)',
  title: 'A tree nut, fish or Crustacean shellfish is named by its specific type or species',
}

/**
 * Where the printed label names this food source, of the places it counts.
 *
 * **Which element, not merely whether.** The rule withholds its pass unless one
 * element that declares the source printed in full, and it needs to know which to
 * ask. Returning a boolean is how a Contains statement drawn past the bottom of
 * the label came to clear "almonds is declared" on a list that never named them.
 *
 * **Read from the layout, not re-derived from the document**, because §403(w) is
 * about what a package says. That also collapses four clauses into one
 * measurement: (A)'s "Contains" statement, (B)'s parenthetical, (B)(i)'s
 * ingredient whose own name carries the source — `buttermilk` for milk — and
 * (B)(ii)'s source appearing elsewhere in the list are all just "the name is
 * printed", and the statute treats them as equally sufficient.
 *
 * The one place they are not equal is (B)(ii)'s caveat: the appearance does not
 * count where it is "part of the name of a food ingredient that is not a major
 * food allergen". Coconut milk contains no dairy, so the word "milk" in it
 * discharges nothing — which is why the names of other ingredients are struck out
 * of the printed list before it is searched, rather than the whole string being
 * matched.
 *
 * **"Other" means other than this allergen**, and that is the whole of it. The
 * search is run once per allergen, and only the names of ingredients bearing
 * *that* allergen are left standing — so a food-source word can only ever settle
 * the question it belongs to.
 */
function elementsDeclaring(
  source: string,
  allergenId: MajorFoodAllergenId,
  printedList: string,
  printedContains: string,
  ingredients: readonly UsFoodIngredient[],
): string[] {
  const needle = source.toLowerCase()
  const declaring: string[] = []
  if (printedContains.toLowerCase().includes(needle)) {
    declaring.push(US_FOOD_ELEMENTS.containsStatement)
  }

  let searchable = printedList.toLowerCase()
  for (const ingredient of ingredients) {
    // A blank name is skipped, and not as a tidiness measure: `split('')` splits
    // between every character, so one empty ingredient turned the whole printed
    // list into spaced-out letters and nothing was ever found in it again. The
    // rail's "Add an ingredient" button inserts exactly that row, so a label
    // printing `whey (milk)` reported milk undeclared the moment a user clicked
    // it — and went back to clean when the row was filled in.
    if (ingredient.name.trim() === '') continue

    // **What survives is only the names of ingredients that are this allergen.**
    // The test used to keep every ingredient that bore *any* allergen, which is
    // not what (B)(ii)'s caveat asks and not what the note above this function
    // says it does. `coconut milk` carries tree-nuts, so it was left in the
    // searchable list, and the word "milk" inside it then discharged the *dairy*
    // declaration of an undeclared `whey` beside it — a food-source word settling
    // a different allergen's question. The whole label came back clean.
    //
    // Striking out by "is not this allergen" rather than by "has no allergen"
    // reads the caveat the way the example demands: an appearance counts only
    // where it identifies the source it is being searched for.
    if (ingredient.allergen === allergenId) continue
    searchable = searchable.split(ingredient.name.toLowerCase()).join(' ')
  }
  if (searchable.includes(needle)) declaring.push(US_FOOD_ELEMENTS.ingredients)
  return declaring
}

export const usFoodAllergenRule: UsFoodRule = {
  id: 'us-food/allergen-declaration',
  title: 'Every major food allergen is declared, naming the food source the Act requires.',
  citation: CITATION,
  citations: [CITATION, SPECIFIC],
  codes: [
    FDA_ALLERGEN_NOT_DECLARED,
    FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
    FDA_ALLERGEN_DECLARATION_UNCONFIRMED,
    FDA_ALLERGEN_DECLARED_MET,
  ],
  appliesTo: 'us-food',

  check({ data, layout }: UsFoodContext): Finding[] {
    const ingredients = data.ingredients ?? []
    const bearing = ingredients.filter((ingredient) => ingredient.allergen !== undefined)
    // No allergen on the recipe is nothing for this rule to declare. A label
    // that simply has not said is not a label that has been cleared.
    if (bearing.length === 0) return []

    const textOf = (elementId: string): string =>
      layout.primitives
        .filter(
          (primitive): primitive is TextPrimitive =>
            primitive.kind === 'text' && primitive.elementId === elementId,
        )
        .map((primitive) => primitive.text)
        .join(' ')

    const printedList = textOf(US_FOOD_ELEMENTS.ingredients)
    const printedContains = textOf(US_FOOD_ELEMENTS.containsStatement)
    const findings: Finding[] = []

    for (const ingredient of bearing) {
      const id = ingredient.allergen!
      const allergen = majorFoodAllergen(id)
      if (allergen === undefined) continue

      const source = foodSourceName(id, ingredient.allergenSpecificType)

      // §403(w)(2) first: without a specific type there is no food source name
      // to put in either form, so neither can be satisfied and saying "not
      // declared" would name the wrong defect.
      if (source === undefined) {
        findings.push(
          finding(usFoodAllergenRule, {
            code: FDA_ALLERGEN_SOURCE_NOT_SPECIFIC,
            severity: 'violation',
            message:
              `"${ingredient.name}" is ${allergen.name}, which must be declared by its specific ` +
              `${id === 'fish' || id === 'crustacean-shellfish' ? 'species' : 'type'} — ` +
              `${allergen.examples.join(', ')} — and not by the category.`,
            measurement: { actual: allergen.name, required: `a specific ${allergen.name} source` },
            elementId: US_FOOD_ELEMENTS.ingredients,
            citation: SPECIFIC,
          }),
        )
        continue
      }

      // Either form satisfies (w)(1). They are alternatives in the statute and
      // demanding both would report a violation against a compliant label.
      const declaring = elementsDeclaring(source, id, printedList, printedContains, ingredients)
      if (declaring.length > 0) {
        if (declaring.some((elementId) => wasFullyDrawn(layout, elementId))) continue

        // **Declared only by a block with an omission recorded against it.**
        // `textOf` reads every primitive, including those of a block drawn off the
        // label, which is the text a declaration must not rest on — so this cannot
        // clear. Nor can it say "not declared": the omission is recorded per
        // element, not per line, so the rule cannot tell whether the line that was
        // lost is the one carrying the source. Silence was the answer once, and a
        // label with no responsible firm then exported with its Contains statement
        // cut off and no allergen finding at all, because a `detail` omission does
        // not block export.
        //
        // So an advisory, as `GHS_PICTOGRAM_MISSING` is where a violation cannot be
        // established: it names the allergen and points at the element that
        // declared it. `wasFullyDrawn` counts any omission, as the guard does, so a
        // Contains statement whose only omission is an entry no ingredient carries
        // raises this too, though its source printed — and so does one whose last
        // line printed with only its line box overhanging. Stricter than necessary,
        // never looser. Telling those apart needs either omissions that say what was
        // lost or this rule measuring each line's ink against the stock itself, and
        // the second loosens a pass condition — `docs/BACKLOG.md` records both.
        //
        // **So the message says only what the rule knows: that an omission is
        // recorded, not that anything went unprinted.** It first said the statement
        // "did not print in full", which the review of PR #31 showed false in a state
        // the editor keeps on purpose — clear an ingredient's allergen and the rail
        // leaves its Contains tick in place, so a statement ticked for tree nuts and
        // milk prints "Contains: almonds." whole on a full-size label, beside an
        // omission for the milk entry it dropped.
        findings.push(
          finding(usFoodAllergenRule, {
            code: FDA_ALLERGEN_DECLARATION_UNCONFIRMED,
            severity: 'advisory',
            message:
              `"${ingredient.name}" contains ${source} and is declared only in ` +
              `${declaring.map((elementId) => DECLARING_ELEMENT_NAMES[elementId]).join(' and ')}, ` +
              `${declaring.length === 1 ? 'which has' : 'each of which has'} a layout omission ` +
              'recorded against it. This check does not know which part of the text an omission ' +
              `affects, so it cannot confirm that ${source} is declared on the printed label.`,
            measurement: {
              actual: 'declared only in text with a layout omission recorded against it',
              required: `a declaration naming ${source} in text with no omission recorded`,
            },
            elementId: declaring[0]!,
          }),
        )
        continue
      }

      findings.push(
        finding(usFoodAllergenRule, {
          code: FDA_ALLERGEN_NOT_DECLARED,
          severity: 'violation',
          message:
            `"${ingredient.name}" contains ${source} and the label declares it neither in a ` +
            '"Contains" statement nor in parentheses after the ingredient.',
          measurement: { actual: 'not declared', required: `a declaration naming ${source}` },
          elementId: US_FOOD_ELEMENTS.ingredients,
        }),
      )
    }

    // Any finding withholds the pass — the advisory above included, which is how a
    // declaration resting only on text that did not print stays uncleared.
    if (findings.length > 0) return findings

    const names = bearing
      .map((ingredient) => foodSourceName(ingredient.allergen!, ingredient.allergenSpecificType))
      .filter((name): name is string => name !== undefined)
    return [
      // §403(w)(1) is satisfied by what the package prints, in either form: the artwork.
      passedOnArtwork(
        usFoodAllergenRule,
        FDA_ALLERGEN_DECLARED_MET,
        `${[...new Set(names)].join(', ')} ${names.length === 1 ? 'is' : 'are'} declared.`,
        US_FOOD_ELEMENTS.ingredients,
      ),
    ]
  },
}
