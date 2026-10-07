/**
 * Where in this application's form each fact a check can wait for is stated.
 *
 * The engine names a fact by its place in the label's data —
 * `nutritionFacts.referenceAmount` — and knows nothing of forms. This is the
 * other half: the field that states it, and what that field is called on
 * screen, so a check that did not run can link straight to what would let it.
 *
 * **The form takes its labels from here**, so the link and the field it lands
 * on cannot be named two ways. They were — the rail offered "What the whole
 * package holds" for a field labelled "The whole package holds (g)" — and
 * `declinedFacts.test.ts` now reads each field's label off the page and checks
 * the link's name begins it. Found by review.
 *
 * A `Record` over the engine's closed `DeclinedFact` union, so a fact the
 * engine learns to ask for without a field here is a compile error rather than
 * a link to nowhere. `declinedFacts.test.ts` checks the other direction: that
 * each field named here is on the page whenever its fact is asked for.
 */
import type { DeclinedFact } from '@packwright/label-core'

export interface FactField {
  /** The element to bring into view and focus — the control, or a group of them. */
  fieldId: string
  /** What the form calls it, so the link reads as the field the user will find. */
  name: string
}

export const DECLINED_FACT_FIELDS: Readonly<Record<DeclinedFact, FactField>> = {
  hazards: { fieldId: 'field-ghs-classification', name: 'Hazard classification' },
  'nutritionFacts.referenceAmount': { fieldId: 'field-food-nf-racc', name: 'Reference amount' },
  'nutritionFacts.packageContent': {
    fieldId: 'field-food-nf-package-content',
    name: 'The whole package holds',
  },
  'nutritionFacts.unitContent': {
    fieldId: 'field-food-nf-unit-content',
    name: 'One individual unit holds',
  },
  'nutritionFacts.packagedAndSoldIndividually': {
    fieldId: 'field-food-nf-sold-individually',
    name: 'Packaged and sold individually',
  },
  'nutritionFacts.columns.basis': {
    fieldId: 'field-food-nf-basis',
    name: 'What the second column counts',
  },
}
