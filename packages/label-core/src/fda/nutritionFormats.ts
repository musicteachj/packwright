/**
 * Which Nutrition Facts display a package may use.
 *
 * Source: **21 CFR 101.9(j)(13)**, read from the eCFR on 2026-09-12.
 *
 * **These are permissions, not requirements**, and the distinction decides what a
 * rule may say. (j)(13)(ii) opens "Foods in packages that have a total surface
 * area available to bear labeling of 40 or less square inches **may** modify the
 * requirements of paragraphs (c) through (f) and (i) of this section by one or
 * more of the following means". So a rule can report a label using a display it
 * is not entitled to; it can never demand that a small package use one. Reading
 * a permission as an obligation is the mistake CLP Article 26's "optional"
 * clauses already taught this project once.
 *
 * The entitlement, verbatim from (j)(13)(ii)(A):
 *
 * > "Presenting the required nutrition information in a tabular or, as provided
 * > below, linear (i.e., string) fashion rather than in vertical columns **if the
 * > product has a total surface area available to bear labeling of less than 12
 * > square inches**, or **if the product has a total surface area available to
 * > bear labeling of 40 or less square inches and the package shape or size
 * > cannot accommodate a standard vertical column or tabular display on any
 * > label panel**. Nutrition information may be given in a linear fashion **only
 * > if the label will not accommodate a tabular display**."
 *
 * The tabular display has a second entitlement that does not run through
 * (j)(13) at all — see `TABULAR_VERTICAL_SPACE_INCHES`.
 *
 * Two of those conditions are facts about a package that no inspection of
 * artwork can settle — whether a shape "cannot accommodate" a display, and
 * whether a label "will not accommodate" a tabular one. They are declared by the
 * supplier and never inferred, the same call the GHS small-container provision
 * and §101.100 already get.
 */

import type { LabelingSurfaceFloor } from '../geometry/pdp'

export const NUTRITION_FORMATS = ['vertical', 'tabular', 'linear'] as const
export type NutritionFormat = (typeof NUTRITION_FORMATS)[number]

/**
 * How many sets of values the panel carries, which is **not** the same axis as
 * the display above.
 *
 * A flat union of every "format" 101.9 names cannot describe the labels the
 * regulation itself illustrates. (e)(6)(ii) is "the provisions of (b)(2)(i)(D)
 * and (b)(12)(i) ... **for labels that use the tabular display**" — a dual-column
 * *tabular* panel — and (e)(6)(i) shows the vertical one beside it. Making
 * `dualColumn` a fourth member of `NUTRITION_FORMATS` would make both of those
 * inexpressible, and (d)(1)(iii)'s type-size exceptions name (e)(6)(ii)
 * separately from (d)(11), so the engine has to be able to tell them apart.
 *
 * So: the display is *how the information is arranged*, and this is *how many
 * columns of values it carries*. `aggregate` extends this same union — the
 * (d)(13) display is a column per food — and is in the backlog rather than here.
 */
export const NUTRITION_COLUMN_MODES = ['single', 'dual'] as const
export type NutritionColumnMode = (typeof NUTRITION_COLUMN_MODES)[number]

/**
 * What the second column of a dual-column panel counts.
 *
 * A closed set, and the modality differs across it, which is the whole reason it
 * is a set rather than a boolean. **Four are permissions and two are mandates.**
 * 101.9(e) opens "Nutrition information **may** be presented for two or more
 * forms of the same food"; (b)(12)(i) says a package holding 200–300% of the
 * reference amount "**must** provide an additional column"; (b)(2)(i)(D) says the
 * manufacturer "**shall** provide a column" where a unit weighs the same.
 *
 * Carrying the basis rather than a flag is also what makes (b)(12)(i)(C)'s
 * exemptions computable: it excuses a product that *already* provides a second
 * column for one of the other reasons, so most of that carve-out falls out of
 * this value rather than needing to be declared separately.
 */
export const DUAL_COLUMN_BASES = [
  /** (e) — two or more forms of the same food, "as purchased" and "as prepared". */
  'as-prepared',
  /** (e) with (h)(4) — common combinations of food. */
  'combination',
  /** (e) and (b)(10) — different units, e.g. per 100 g. */
  'per-unit-measure',
  /** (e)(5) — two or more groups for which RDIs are established. */
  'rdi-groups',
  /** (b)(10)(iii) — per cup popped, for popcorn. */
  'per-cup-popped',
  /** **(b)(12)(i)** — per serving and per container. Mandatory at 200–300%. */
  'per-container',
  /** **(b)(2)(i)(D)** — per serving and per individual unit. Mandatory likewise. */
  'per-unit',
] as const
export type DualColumnBasis = (typeof DUAL_COLUMN_BASES)[number]

/** The paragraph each basis comes from, for the citation a finding carries. */
export const DUAL_COLUMN_BASIS_REFERENCE: Record<DualColumnBasis, string> = {
  'as-prepared': '21 CFR 101.9(e)',
  combination: '21 CFR 101.9(e)',
  'per-unit-measure': '21 CFR 101.9(e)',
  'rdi-groups': '21 CFR 101.9(e)(5)',
  'per-cup-popped': '21 CFR 101.9(b)(10)(iii)',
  'per-container': '21 CFR 101.9(b)(12)(i)',
  'per-unit': '21 CFR 101.9(b)(2)(i)(D)',
}

/**
 * Below this, (j)(13)(i) exempts a package from nutrition labelling altogether —
 * "Provided, That the labels for these foods bear no nutrition claims or other
 * nutrition information" — and (j)(13)(ii)(A) lets any of the displays be used.
 */
export const SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES = 12

/** At or below this, (j)(13)(ii) permits the reduced displays on conditions. */
export const REDUCED_FORMAT_MAX_SQ_INCHES = 40

/**
 * 21 CFR 101.9(d)(11)(iii): "If there is not sufficient continuous vertical
 * space (i.e., **approximately 3 in**) to accommodate the required components of
 * the nutrition label up to and including the mandatory declaration of
 * potassium, the nutrition label may be presented in a tabular display."
 *
 * A second entitlement to the tabular display, independent of (j)(13)'s areas —
 * and the one a large package uses. A rule knowing only the (j)(13) route would
 * report a tall thin label that is squarely within this one.
 *
 * "Approximately" is the regulation's own word, so this is a threshold to
 * measure against rather than a line to be exact about.
 */
export const TABULAR_VERTICAL_SPACE_INCHES = 3

export interface FormatEntitlement {
  /** Total surface area available to bear labeling, in square inches, as declared. */
  availableSqInches: number
  /**
   * What the drawn label and panel show the area to be at least. Where it exceeds the
   * declared figure it governs — see `labelingSurfaceFloor`.
   */
  floor?: LabelingSurfaceFloor
  /**
   * 101.9(j)(13)(ii)(A): "the package shape or size cannot accommodate a
   * standard vertical column or tabular display on any label panel". A fact
   * about a package, declared rather than measured off a label.
   */
  cannotAccommodateVertical?: boolean
  /** "the label will not accommodate a tabular display" — the linear gate. */
  cannotAccommodateTabular?: boolean
  /**
   * Continuous vertical space available for the nutrition label, in inches.
   * Under (d)(11)(iii), less than approximately 3 entitles a package of any size
   * to the tabular display.
   */
  continuousVerticalSpaceInches?: number
}

export interface FormatVerdict {
  permitted: boolean
  /** One sentence, for the finding. Empty when permitted. */
  reason: string
  reference: string
}

/**
 * Whether **(j)(13)(ii)(A)'s small-package route** reaches this package — "less
 * than 12 square inches", or "40 or less square inches and the package shape or
 * size cannot accommodate a standard vertical column".
 *
 * Named and exported because it answers a second question besides entitlement.
 * (d)(1)(iii) and (d)(3)(i) lower the Calories numeral and the servings
 * statement **only** on "the tabular display for small packages as shown in
 * paragraph (j)(13)(ii)(A)(1)" and the linear display beside it — not on
 * (d)(11)'s ordinary tabular display, which reaches the same arrangement by a
 * different paragraph and keeps the larger figures. One predicate, so the
 * entitlement and the type sizes cannot come to disagree about which route a
 * package took.
 */
export function smallPackageRouteApplies(entitlement: FormatEntitlement): boolean {
  const area = governingArea(entitlement).sqInches
  const under12 = area < SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES
  const under40 = area <= REDUCED_FORMAT_MAX_SQ_INCHES
  return under12 || (under40 && entitlement.cannotAccommodateVertical === true)
}

/**
 * The area the entitlement turns on: the declared figure, unless what is drawn shows the
 * package has more — and a sentence saying which, for a finding.
 */
function governingArea(entitlement: FormatEntitlement): { sqInches: number; describe: string } {
  const { availableSqInches, floor } = entitlement
  if (floor !== undefined && floor.sqInches > availableSqInches) {
    return {
      sqInches: floor.sqInches,
      describe:
        `the ${floor.what} is itself ${floor.sqInches.toFixed(1)} in², and ${floor.why}, so ` +
        `the package has at least that much available to bear labeling however much is declared`,
    }
  }
  return {
    sqInches: availableSqInches,
    describe: `the package has ${availableSqInches.toFixed(1)} in² available to bear labeling`,
  }
}

/**
 * Whether a package may present its nutrition information in this display.
 *
 * The vertical display is always available — it is the one (d) describes and
 * everything else is a modification of it — so only the two reduced displays
 * have anything to check.
 */
export function formatIsPermitted(
  format: NutritionFormat,
  entitlement: FormatEntitlement,
): FormatVerdict {
  const { cannotAccommodateTabular } = entitlement

  if (format === 'vertical') {
    return { permitted: true, reason: '', reference: '21 CFR 101.9(d)' }
  }

  const area = governingArea(entitlement)
  const under40 = area.sqInches <= REDUCED_FORMAT_MAX_SQ_INCHES
  const reduced = smallPackageRouteApplies(entitlement)

  // (d)(11)(iii) is a second route to the tabular display and does not run
  // through (j)(13) at all: a package of any size may use it where there is not
  // approximately 3 inches of continuous vertical space. It does not reach the
  // linear display, which (j)(13)(ii)(A) alone permits.
  const tooShort =
    entitlement.continuousVerticalSpaceInches !== undefined &&
    entitlement.continuousVerticalSpaceInches < TABULAR_VERTICAL_SPACE_INCHES
  if (format === 'tabular' && tooShort) {
    return { permitted: true, reason: '', reference: '21 CFR 101.9(d)(11)(iii)' }
  }

  if (!reduced) {
    return {
      permitted: false,
      reason: under40
        ? `${area.describe}, which permits a reduced display only where its shape or size ` +
          'cannot accommodate a standard vertical column, and the label does not say so'
        : `${area.describe}, and a reduced display is permitted only at 40 in² or less`,
      reference: '21 CFR 101.9(j)(13)(ii)(A)',
    }
  }

  if (format === 'linear' && cannotAccommodateTabular !== true) {
    return {
      permitted: false,
      reason:
        'nutrition information may be given in a linear fashion only if the label will not ' +
        'accommodate a tabular display, and the label does not say that it will not',
      reference: '21 CFR 101.9(j)(13)(ii)(A)',
    }
  }

  return { permitted: true, reason: '', reference: '21 CFR 101.9(j)(13)(ii)(A)' }
}

/**
 * The two provisions that make a second column **mandatory**, and the exemptions
 * they share.
 *
 * Source: 21 CFR 101.9(b)(12)(i) and (b)(2)(i)(D), read from the eCFR on
 * 2026-09-13. Everything else about the Nutrition Facts displays in this module
 * is a permission; these two are not, and they are the only provisions in this
 * project that can report a label for **not** doing something optional-looking.
 *
 * (b)(12)(i), verbatim: "Products that are packaged and sold individually and
 * that contain **at least 200 percent and up to and including 300 percent** of
 * the applicable reference amount **must** provide an additional column within
 * the Nutrition Facts label that lists the quantitative amounts and percent Daily
 * Values for the entire package, as well as a column listing the quantitative
 * amounts and percent Daily Values for a serving that is less than the entire
 * package."
 *
 * (b)(2)(i)(D): "If a unit weighs at least 200 percent and up to and including
 * 300 percent of the applicable reference amount ... the manufacturer **shall**
 * provide a column within the Nutrition Facts label that lists the quantitative
 * amounts and percent Daily Values **per individual unit**." It closes with "The
 * exemptions in paragraphs (b)(12)(i)(A), (B), and (C) of this section apply to
 * this provision", which is why one exemption set serves both.
 *
 * **The band is inclusive at both ends.** "At least 200 ... up to and including
 * 300" — so 200.0 and 300.0 are inside it and 199.9 and 300.1 are not.
 *
 * **Which of the two bit matters beyond this module.** 101.9(e)(6), read from the
 * eCFR on 2026-09-17, governs the *format* of these columns and names its own
 * predicate: "When dual labeling is presented for a food on a per serving basis
 * and per container basis **as required in paragraph (b)(12)(i)** ... or on a per
 * serving basis and per unit basis **as required in paragraph (b)(2)(i)(D)**".
 * So a rule citing (e)(6) has to know not merely that *a* column was owed but
 * *which* provision owed it — a per-unit column is (e)(6)'s business only where
 * (b)(2)(i)(D) required a per-unit column. Both provisions can bite on one label,
 * and `basis` reports only the first, which is why `required` reports every one.
 *
 * A column excused by (b)(12)(i)(A), (B) or (C) is not "required in paragraph
 * (b)(12)(i)" either, so an exemption empties `required` while leaving `basis`
 * and `exemption` to say what was excused.
 */
export const DUAL_COLUMN_MIN_PERCENT = 200
export const DUAL_COLUMN_MAX_PERCENT = 300

/**
 * The two bases a label can be *obliged* to carry, as opposed to permitted.
 *
 * Narrower than `DualColumnBasis` on purpose: a duty can only ever arise from
 * (b)(12)(i) or (b)(2)(i)(D), and typing it as the wide set would let a rule
 * write a message about an obligation to declare "per 100 grams".
 */
export type MandatoryDualColumnBasis = Extract<DualColumnBasis, 'per-container' | 'per-unit'>

/**
 * Where a label stands against **one** of the two mandatory provisions.
 *
 * Four answers, not two, and the distinction is the whole point. A caller with
 * only "required or not" tells a user their column is a choice they made on the
 * strength of a field they never filled in — §101.12(b)'s reference amounts are
 * not carried here, and neither is a package content, so an unstated figure
 * leaves the question **unasked** rather than answered no.
 */
export type DualColumnStanding =
  /** The provision compels the column on the facts stated. */
  | 'required'
  /** It would, but (b)(12)(i)(A), (B) or (C) excuses this package. */
  | 'excused'
  /** Every fact the question turns on is stated, and the provision does not reach. */
  | 'not-required'
  /** The label has not stated something the question turns on. Nothing is known. */
  | 'undetermined'

export interface DualColumnDuty {
  /** The basis the label owes a second column on, or undefined where it owes none. */
  basis?: MandatoryDualColumnBasis
  /**
   * Where the label stands against each provision separately.
   *
   * `basis` picks one to report and the package provision wins; this keeps both,
   * because (e)(6)'s predicate is per-provision rather than per-label — a per-unit
   * column is its business only where (b)(2)(i)(D) required a per-unit column.
   */
  standing: Readonly<Record<MandatoryDualColumnBasis, DualColumnStanding>>
  /** The percentage of the reference amount that triggered it. */
  percentOfReferenceAmount?: number
  /** Which paragraph excused it, where one did. */
  exemption?: string
}

export interface DualColumnInput {
  referenceAmount?: { amount: number }
  packageContent?: number
  unitContent?: number
  packagedAndSoldIndividually?: boolean
  columns?: { mode: NutritionColumnMode; basis?: DualColumnBasis }
  rawCommodityVoluntary?: boolean
  variedWeight?: boolean
  /**
   * Whether (j)(13)(ii)(A) reaches this package — exemption (A). Note its wording:
   * "products that **meet the requirements to use** the tabular format", not
   * products that use it. A package entitled to the small-package displays is
   * excused whatever display it actually carries.
   */
  meetsSmallPackageRequirements?: boolean
}

/**
 * (b)(12)(i)(C) excuses a product that **already provides** a second column for
 * one of these reasons — the clause is conjunctive, naming the property *and* the
 * additional column together. So most of the carve-out falls out of the basis the
 * label declares rather than needing to be asserted separately.
 */
const EXEMPT_BASES: readonly DualColumnBasis[] = [
  'as-prepared',
  'combination',
  'rdi-groups',
  'per-cup-popped',
]

/** Whether a content sits in the inclusive 200–300% band. */
function inBand(content: number, referenceAmount: number): number | undefined {
  if (!(referenceAmount > 0) || !Number.isFinite(content)) return undefined
  const percent = (content / referenceAmount) * 100
  return percent >= DUAL_COLUMN_MIN_PERCENT && percent <= DUAL_COLUMN_MAX_PERCENT
    ? percent
    : undefined
}

/**
 * Where a label stands against one provision, given whether it hit the band and
 * whether the label stated everything that question turns on.
 */
function standingOf(
  percentInBand: number | undefined,
  factsStated: boolean,
  exemption: string | undefined,
): DualColumnStanding {
  if (percentInBand !== undefined) return exemption === undefined ? 'required' : 'excused'
  return factsStated ? 'not-required' : 'undetermined'
}

/**
 * What second column, if any, this label is obliged to carry.
 *
 * Every answer is per provision. Where the label has not stated something the
 * question turns on, the standing is `undetermined` rather than absent: guessing
 * would mean either reporting a label for omitting something on facts it never
 * stated, or telling its author they chose a column they may not have.
 */
export function dualColumnDuty(input: DualColumnInput): DualColumnDuty {
  const referenceAmount = input.referenceAmount?.amount

  // (b)(12)(i) reaches the package; (b)(2)(i)(D) reaches the unit. Both can be
  // true, and the package provision is the one named first.
  const perContainer =
    referenceAmount !== undefined &&
    input.packagedAndSoldIndividually === true &&
    input.packageContent !== undefined
      ? inBand(input.packageContent, referenceAmount)
      : undefined
  const perUnit =
    referenceAmount === undefined || input.unitContent === undefined
      ? undefined
      : inBand(input.unitContent, referenceAmount)

  // What each provision needs before it can be answered at all. (b)(12)(i) turns
  // on three facts, not one: a package that does not say whether it is sold
  // individually has not answered it, and `packagedAndSoldIndividually: false`
  // has — that is a stated fact putting the package outside the provision.
  // A figure has to be a figure before it counts as stated. `inBand` already
  // refuses a reference amount of zero or less — it cannot divide by one — but
  // treating the *question* as asked anyway turned that refusal into "this
  // package does not need a second column", which is an answer nobody gave. A
  // label declaring a reference amount of 0 read as having satisfied
  // (b)(12)(i). Found by review when the editor first gained these inputs.
  const stated = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value > 0
  // "Not sold individually" answers (b)(12)(i) on its own: the provision reaches
  // only products "packaged and sold individually", so a label that says no has
  // said everything the question needs, whatever else it left blank. Demanding a
  // package content on top told such a user they had not stated something they
  // plainly had. Found by review.
  const perContainerAsked =
    input.packagedAndSoldIndividually === false ||
    (stated(referenceAmount) &&
      stated(input.packageContent) &&
      input.packagedAndSoldIndividually !== undefined)
  const perUnitAsked = stated(referenceAmount) && stated(input.unitContent)

  const basis: MandatoryDualColumnBasis | undefined =
    perContainer !== undefined ? 'per-container' : perUnit !== undefined ? 'per-unit' : undefined

  // The exemptions are shared — (b)(2)(i)(D) closes by adopting (b)(12)(i)(A) to
  // (C) — so one chain serves both, and it is only asked once a band was hit.
  const exemption =
    basis === undefined
      ? undefined
      : input.meetsSmallPackageRequirements === true
        ? '21 CFR 101.9(b)(12)(i)(A)'
        : input.rawCommodityVoluntary === true
          ? '21 CFR 101.9(b)(12)(i)(B)'
          : input.variedWeight === true ||
              (input.columns?.mode === 'dual' &&
                input.columns.basis !== undefined &&
                EXEMPT_BASES.includes(input.columns.basis))
            ? '21 CFR 101.9(b)(12)(i)(C)'
            : undefined

  const standing = {
    'per-container': standingOf(perContainer, perContainerAsked, exemption),
    'per-unit': standingOf(perUnit, perUnitAsked, exemption),
  } as const

  if (basis === undefined) return { standing }

  return {
    basis,
    standing,
    percentOfReferenceAmount: perContainer ?? perUnit!,
    ...(exemption === undefined ? {} : { exemption }),
  }
}
