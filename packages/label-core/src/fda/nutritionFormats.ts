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
  /** Total surface area available to bear labeling, in square inches. */
  availableSqInches: number
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
  const under12 = entitlement.availableSqInches < SMALL_PACKAGE_EXEMPT_MAX_SQ_INCHES
  const under40 = entitlement.availableSqInches <= REDUCED_FORMAT_MAX_SQ_INCHES
  return under12 || (under40 && entitlement.cannotAccommodateVertical === true)
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
  const { availableSqInches, cannotAccommodateTabular } = entitlement

  if (format === 'vertical') {
    return { permitted: true, reason: '', reference: '21 CFR 101.9(d)' }
  }

  const under40 = availableSqInches <= REDUCED_FORMAT_MAX_SQ_INCHES
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
        ? `the package is ${availableSqInches.toFixed(1)} in², which permits a reduced display ` +
          'only where its shape or size cannot accommodate a standard vertical column, and the ' +
          'label does not say so'
        : `the package has ${availableSqInches.toFixed(1)} in² available to bear labeling, and a ` +
          'reduced display is permitted only at 40 in² or less',
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
