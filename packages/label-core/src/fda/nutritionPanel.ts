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
