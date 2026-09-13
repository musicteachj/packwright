/**
 * The Nutrition Facts panel's typography and rule weights.
 *
 * **Two sources with different force, and the difference decides what may be a
 * rule.**
 *
 * The type sizes are in **21 CFR 101.9** itself and are binding: (d)(2) for the
 * heading, (d)(3) for the servings lines, (d)(5) for Calories, (d)(7)(iii) for
 * the nutrient block, (j)(13) for the small-package floors. Those ship as rules.
 *
 * The rule weights are not in the regulation at all. 101.9 defers to its graphic
 * fifteen times and says only that "for uniformity of presentation, FDA strongly
 * recommends that the nutrition information be presented using the graphic
 * specifications set forth in appendix B to part 101" — a recommendation, and
 * Appendix B is two images. They are stated in FDA's own illustrations:
 *
 * > **FDA, "The New Nutrition Facts Label — Examples of Different Label
 * > Formats"**, https://www.fda.gov/media/99151/download, read 2026-09-12.
 * > "All labels enclosed by ½ point box rule within 3 point of text measure";
 * > "7 pt rule"; "3 pt rule"; "¼ pt rule centered between nutrients (2 pt
 * > leading above and below)"; "Shortened rule above Added Sugars declaration";
 * > "Text in bold font is Helvetica Black; text not bolded is Helvetica Regular
 * > in all instances".
 *
 * That document is **guidance and nonbinding**. So the renderer follows it and
 * **no rule judges a bar weight** — a panel drawn with a 5 pt rule is unusual,
 * not unlawful, and reporting it as a violation would be inventing a
 * requirement. This corrects an earlier conclusion recorded in `docs/DESIGN.md`
 * that the figures were stated nowhere: they are, in a source that was fetched
 * and then not successfully read.
 *
 * **The typeface is deliberately not Helvetica.** 101.9 requires only an
 * "easy-to-read type style"; Helvetica is the illustrations' choice, not the
 * regulation's. This project embeds IBM Plex, whose metrics `text/metrics.ts`
 * carries and whose letter heights every type-size rule is measured against.
 * Substituting a face this build cannot measure would make those rules guesses.
 */

import { MM_PER_POINT } from '../geometry/units'
import {
  type NutritionColumnMode,
  type NutritionFormat,
  smallPackageRouteApplies,
} from './nutritionFormats'

/** A point, in millimetres, for the figures below. 1 pt = 25.4/72 mm. */
const pt = (points: number): number => points * MM_PER_POINT

/**
 * Rule weights from the FDA illustrations, in millimetres.
 *
 * Guidance, not requirement — see the module note. Named for what the source
 * calls them so the citation and the constant cannot drift apart.
 */
export const NUTRITION_PANEL_RULES = {
  /** "All labels enclosed by ½ point box rule". */
  boxMm: pt(0.5),
  /** "within 3 point of text measure" — the box's inset from the type. */
  boxInsetMm: pt(3),
  /** "7 pt rule" — the thick bars that divide the panel's sections. */
  thickMm: pt(7),
  /** "3 pt rule" — the medium bar beneath the Calories line. */
  mediumMm: pt(3),
  /** "¼ pt rule centered between nutrients". */
  hairlineMm: pt(0.25),
  /** "(2 pt leading above and below)" the hairline between nutrients. */
  hairlineLeadingMm: pt(2),
} as const

/**
 * Type sizes for the standard vertical display.
 *
 * Every figure here is a **minimum** the regulation or the illustrations state,
 * not a chosen size — which is why the rules that check them read "no smaller
 * than" and why drawing at exactly these values puts the default label on the
 * line rather than comfortably above it.
 *
 * The reduced displays lower several of them; see `nutritionTypeForDisplay`.
 */
export const NUTRITION_PANEL_TYPE = {
  /** 101.9(d)(2): no smaller than all other print except the Calories figure.
   *  The illustrations set the standard vertical at 22 pt. */
  headingPt: 22,
  /** 101.9(d)(3)(i), and "No smaller than 10 pt with 1 pt of leading". */
  servingsPerContainerPt: 10,
  /** 101.9(d)(3)(ii): "highlighted in bold or extra bold ... no smaller than
   *  10 point". */
  servingSizePt: 10,
  /** 101.9(d)(5): "highlighted in bold or extra bold ... no smaller than 16
   *  point" for the word. The illustrations set the figure beside it at 22 pt. */
  caloriesWordPt: 16,
  caloriesFigurePt: 22,
  /** 101.9(d)(7)(iii): "no smaller than 8 point", with 4 pt of leading. */
  nutrientPt: 8,
  nutrientLeadingPt: 4,
  /** "No smaller than 6 pt with 1 pt of leading" — the footnote. */
  footnotePt: 6,
  footnoteLeadingPt: 1,
} as const

/**
 * The footnote, which is codified and must never be composed.
 *
 * 21 CFR 101.9(d)(9), verbatim: 'The footnote shall state: "*The % Daily Value
 * tells you how much a nutrient in a serving of food contributes to a daily
 * diet. 2,000 calories a day is used for general nutrition advice."'
 *
 * The same paragraph gives two variants and both are here rather than
 * paraphrased: a food "represented or purported to be for children 1 through 3
 * years of age" substitutes 1,000 calories, and a food that may use the
 * calorie-free terms in § 101.60(b) may use the first sentence alone.
 */
export const NUTRITION_FOOTNOTE = {
  standard:
    '*The % Daily Value tells you how much a nutrient in a serving of food contributes to a ' +
    'daily diet. 2,000 calories a day is used for general nutrition advice.',
  childrenOneToThree:
    '*The % Daily Value tells you how much a nutrient in a serving of food contributes to a ' +
    'daily diet. 1,000 calories a day is used for general nutrition advice.',
  /** Permitted alone on a food that may bear the § 101.60(b) calorie-free terms. */
  firstSentenceOnly:
    '*The % Daily Value tells you how much a nutrient in a serving of food contributes to a ' +
    'daily diet.',
} as const

/**
 * The displays 101.9 illustrates, named for the paragraph that illustrates each.
 *
 * **This is the axis the regulation states its type-size exceptions on**, and
 * keying the table on anything coarser is what makes them wrong. (d)(1)(iii) and
 * (d)(3) never say "the tabular display" — they name paragraphs, and each
 * exception names a *different set* of them. A single `tabular` row cannot
 * satisfy four exception lists that disagree about which tabular displays they
 * reach, and the row that tried put a 14 point Calories numeral and a 9 point
 * servings statement on (d)(11)'s display, where both are larger.
 */
export const NUTRITION_DISPLAYS = {
  /** The standard vertical display. */
  verticalD12: '21 CFR 101.9(d)(12)',
  /** The ordinary tabular display, reached by (d)(11)(iii)'s vertical space. */
  tabularD11: '21 CFR 101.9(d)(11)',
  /** The dual-column tabular display. */
  tabularDualColumnE6ii: '21 CFR 101.9(e)(6)(ii)',
  /** The tabular display **for small packages**. */
  tabularSmallJ13: '21 CFR 101.9(j)(13)(ii)(A)(1)',
  /** The linear display for small packages, which has no other route to it. */
  linearSmallJ13: '21 CFR 101.9(j)(13)(ii)(A)(2)',
} as const

export type NutritionDisplay = keyof typeof NUTRITION_DISPLAYS

/**
 * The minimums each display answers to — 21 CFR 101.9(d)(1)(iii) and (d)(3).
 *
 * **Four exceptions, four different lists of paragraphs.** Each is quoted here
 * because the difference between them is the whole content of this table.
 *
 * *Calories, the word* — (d)(1)(iii): "no smaller than 16 point except the type
 * size for this information required in the tabular displays as shown in
 * paragraphs **(d)(11), (e)(6)(ii), and (j)(13)(ii)(A)(1)** of this section and
 * the linear display for small packages as shown in paragraph
 * **(j)(13)(ii)(A)(2)** ... shall be in a type size no smaller than 10 point."
 * Every display but the vertical one.
 *
 * *Calories, the numeral* — (d)(1)(iii): "no smaller than 22 point, except the
 * type size for this information required for the tabular display for **small
 * packages** as shown in paragraph **(j)(13)(ii)(A)(1)** ... and for the linear
 * display for small packages as shown in paragraph **(j)(13)(ii)(A)(2)** ... no
 * smaller than 14 point." Only the two small-package displays. So (d)(11)'s
 * ordinary tabular display carries a **22 point numeral beside a 10 point
 * word**, and so does (e)(6)(ii)'s dual-column one.
 *
 * *Servings per container* — (d)(3)(i): "no smaller than 10 point, except the
 * type size for this information shall be no smaller than 9 point in the tabular
 * display for small packages as shown in paragraph **(j)(13)(ii)(A)(1)** ... and
 * the linear display for small packages as shown in paragraph
 * **(j)(13)(ii)(A)(2)**." Again only the small-package pair — (d)(11) and
 * (e)(6)(ii) keep **10 point**.
 *
 * *Serving size* — (d)(3)(ii): "no smaller than 10 point, except the type size
 * shall be no smaller than 9 point for this information in the tabular displays
 * as shown in paragraphs **(d)(11) and (e)(6)(ii)** ..., the tabular display for
 * small packages as shown in paragraph **(j)(13)(ii)(A)(1)** ..., and the linear
 * display for small packages as shown in paragraph **(j)(13)(ii)(A)(2)**." This
 * one *does* reach every display but the vertical.
 *
 * So the two servings lines do **not** move together, and neither do the two
 * Calories figures. Only "Serving size" and the Calories word share a list.
 *
 * The nutrient rows stay at 8 throughout — (d)(1)(iii) states it for (d)(7) and
 * (8) with no exception — and (d)(4), (6) and (9) at 6, likewise.
 *
 * FDA's illustrations annotate the linear display "all type sizes are 6 point",
 * which cannot be squared with the 9, 10 and 14 point minimums above. The
 * regulation governs; the annotation came out of a PDF that had to be decoded
 * rather than read, and a fragment is not a reason to disbelieve the text.
 */
export const NUTRITION_TYPE_BY_DISPLAY = {
  verticalD12: {
    servingsPerContainerPt: 10,
    servingSizePt: 10,
    caloriesWordPt: 16,
    caloriesFigurePt: 22,
  },
  tabularD11: {
    servingsPerContainerPt: 10,
    servingSizePt: 9,
    caloriesWordPt: 10,
    caloriesFigurePt: 22,
  },
  tabularDualColumnE6ii: {
    servingsPerContainerPt: 10,
    servingSizePt: 9,
    caloriesWordPt: 10,
    caloriesFigurePt: 22,
  },
  tabularSmallJ13: {
    servingsPerContainerPt: 9,
    servingSizePt: 9,
    caloriesWordPt: 10,
    caloriesFigurePt: 14,
  },
  linearSmallJ13: {
    servingsPerContainerPt: 9,
    servingSizePt: 9,
    caloriesWordPt: 10,
    caloriesFigurePt: 14,
  },
} as const

/** Every minimum a display answers to, in points. */
export type NutritionTypeSizes = Record<keyof typeof NUTRITION_PANEL_TYPE, number>

/** The full set for a display, its own figures folded over the vertical ones. */
export function nutritionTypeForDisplay(display: NutritionDisplay): NutritionTypeSizes {
  return { ...NUTRITION_PANEL_TYPE, ...NUTRITION_TYPE_BY_DISPLAY[display] }
}

/**
 * Which of 101.9's illustrated displays a panel is presented under.
 *
 * **Takes the panel itself**, structurally, so the two callers that need the
 * answer — the renderer and the type-size rule — cannot spell the mapping
 * differently. They each built the argument by hand at first, which is two copies
 * of a decision and one of them free to drift.
 *
 * The base display says tabular or linear; it does not say *by which paragraph*,
 * and the type sizes turn on that. `smallPackageRouteApplies` answers it from
 * the same area and shape facts the entitlement uses, so the two cannot come to
 * disagree about which route a package took.
 *
 * **Without a declared area the small-package route does not apply**, so a
 * tabular panel is held to (d)(11)'s larger figures. That is the stricter
 * reading and the deliberate one: a label claiming a reduced display without
 * saying what makes it small has not stated the fact that would lower the
 * minimum, which is the stance (j)(13)(ii)(A)'s own "and the label does not say
 * so" already takes.
 */
export interface NutritionDisplayInput {
  format?: NutritionFormat
  /** (j)(13)'s area — the whole surface available to bear labeling. */
  availableSurfaceSqInches?: number
  cannotAccommodateVertical?: boolean
  /** A second set of values makes a tabular panel (e)(6)(ii)'s rather than (d)(11)'s. */
  columns?: { mode: NutritionColumnMode }
}

export function nutritionDisplayFor(input: NutritionDisplayInput): NutritionDisplay {
  const format = input.format ?? 'vertical'
  if (format === 'vertical') return 'verticalD12'

  const small =
    input.availableSurfaceSqInches !== undefined &&
    smallPackageRouteApplies({
      availableSqInches: input.availableSurfaceSqInches,
      ...(input.cannotAccommodateVertical === undefined
        ? {}
        : { cannotAccommodateVertical: input.cannotAccommodateVertical }),
    })

  // The linear display has only the one paragraph behind it.
  if (format === 'linear') return 'linearSmallJ13'
  // A small package carrying a dual column qualifies under both (j)(13)(ii)(A)(1)
  // and (e)(6)(ii), and the small-package figures are the lower pair. Where two
  // paragraphs both reach a panel it may be set to either, so the minimum it must
  // clear is the smaller — holding it to (e)(6)(ii)'s 22 point numeral would
  // report a label (j)(13)(ii)(A)(1) permits at 14.
  if (small) return 'tabularSmallJ13'
  return input.columns?.mode === 'dual' ? 'tabularDualColumnE6ii' : 'tabularD11'
}
