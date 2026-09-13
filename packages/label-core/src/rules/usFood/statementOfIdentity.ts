/**
 * The label says what the food *is*.
 *
 * Source: 21 CFR 101.3, read from the eCFR on 2026-09-13.
 *
 * (a), verbatim: "The principal display panel of a food in package form **shall**
 * bear as one of its principal features a statement of the identity of the
 * commodity." A plain requirement with no exception stated anywhere in the
 * section — and, until this rule, the only mandatory element of a US food label
 * this engine drew and nothing checked. A blank one reached the renderer, which
 * drew no primitive for it, and every rule reported a clean label.
 *
 * **Only (a) is checked, and the rest of 101.3 is left alone deliberately.**
 *
 * (b) says the statement "shall be in terms of" a name required by Federal law,
 * or the common or usual name, or "an appropriately descriptive term". Whether a
 * string is the common or usual name of a food is a question about 21 CFR part
 * 102 and about usage, not about a label; a rule guessing at it would report
 * confident nonsense about every regional product on the shelf.
 *
 * (d) requires the statement to be "presented in bold type on the principal
 * display panel, ... in a size reasonably related to the most prominent printed
 * matter on such panel, and ... in lines generally parallel to the base". Three
 * clauses, none of which becomes a check here:
 *
 * - **Bold** is satisfied by construction — `usFoodEngine` draws the statement at
 *   `emphasisFontWeight` unconditionally, so a rule for it could never fail. That
 *   is the same reason 101.9(d)(2)'s relative heading size is not checked.
 * - **"A size reasonably related to"** states no measurable standard. It is the
 *   same shape as 101.9(d)(13)(ii)'s "to the maximum extent possible", and a
 *   finding under it could not be defended against a designer who disagreed.
 * - **"Lines generally parallel to the base"** is the clause `netQuantityPlacement`
 *   already declines for the identical wording in 101.7(f), and it declines for
 *   the same reason: this engine draws no rotated text, so there is nothing a
 *   check could ever catch.
 */

import { US_FOOD_ELEMENTS } from '../../templates/usFood'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { UsFoodContext, UsFoodRule } from '../types'

export const FDA_STATEMENT_OF_IDENTITY_MISSING = 'FDA_STATEMENT_OF_IDENTITY_MISSING'
export const FDA_STATEMENT_OF_IDENTITY_MET = 'FDA_STATEMENT_OF_IDENTITY_MET'

const CITATION: Citation = {
  authority: 'FDA',
  reference: '21 CFR 101.3(a)',
  title: 'Statement of identity on the principal display panel',
}

export const usFoodStatementOfIdentityRule: UsFoodRule = {
  id: 'us-food/statement-of-identity',
  title: 'The principal display panel states what the food is.',
  citation: CITATION,
  codes: [FDA_STATEMENT_OF_IDENTITY_MISSING, FDA_STATEMENT_OF_IDENTITY_MET],
  appliesTo: 'us-food',

  check({ data }: UsFoodContext): Finding[] {
    const statement = data.statementOfIdentity.trim()

    if (statement === '') {
      return [
        finding(usFoodStatementOfIdentityRule, {
          code: FDA_STATEMENT_OF_IDENTITY_MISSING,
          // Blocking, as the absent ingredient statement is. This is not a
          // detail of a label that is otherwise real — a package that does not
          // say what is inside it is not a food label at all.
          severity: 'blocking',
          message:
            'The principal display panel does not say what the food is. 101.3(a) requires a ' +
            'statement of identity as one of the panel’s principal features.',
          measurement: {
            actual: 'no statement of identity',
            required: 'a statement of identity on the principal display panel',
          },
          elementId: US_FOOD_ELEMENTS.principalDisplayPanel,
        }),
      ]
    }

    return [
      passed(
        usFoodStatementOfIdentityRule,
        FDA_STATEMENT_OF_IDENTITY_MET,
        `The panel identifies the food as “${statement}”. Whether that is its common or usual ` +
          'name under 101.3(b) is a question about 21 CFR part 102 and is not checked here.',
        US_FOOD_ELEMENTS.statementOfIdentity,
      ),
    ]
  },
}
