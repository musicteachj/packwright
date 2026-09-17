/**
 * Principal Display Panel geometry — 21 CFR 101.
 *
 * Net quantity is **21 CFR 101.7**. Much of the secondary literature cites
 * 101.105 instead; that was this same section's number until 81 FR 59129
 * (29 Aug 2016) redesignated it out of subpart G, where FDA noted it had never
 * belonged because it says nothing about exemptions. Paragraph letters survived
 * the move unchanged, so a (f)/(h)/(i) reference from an old source still lands
 * correctly — but 101.105 no longer exists and must never be cited.
 *
 * The PDP is the part of the package a shopper is most likely to see on the
 * shelf, and a surprising amount of US food law keys off its *area*: how large
 * the net quantity statement must be printed, and how much of the panel it must
 * sit within. So panel area is not a cosmetic figure — get it wrong and every
 * type-size check downstream is wrong with it.
 */

import type { GlyphBasis } from '../text/measure'
import { MM_PER_INCH, squareInchesToSquareMm } from './units'

export type ContainerShape = 'rectangular' | 'cylindrical' | 'other'

export interface RectangularPanel {
  shape: 'rectangular'
  widthMm: number
  heightMm: number
}

export interface CylindricalContainer {
  shape: 'cylindrical'
  heightMm: number
  /** Circumference of the body, excluding tops, bottoms, flanges and shoulders. */
  circumferenceMm: number
}

export interface OtherContainer {
  shape: 'other'
  /** Total surface area of the container, excluding the same features. */
  totalSurfaceAreaSqMm: number
  /**
   * Set when the container presents an obvious principal display panel — the
   * regulation's own example is the top of a triangular or circular package of
   * cheese. 21 CFR 101.1(c): "Provided, however, That where such container
   * presents an obvious 'principal display panel' [...] the area shall consist
   * of the entire top surface."
   *
   * When present this *is* the panel area, and the 40 percent rule does not
   * apply. Omitting it understated the panel for exactly the packages whose
   * panel is easiest to identify by eye.
   */
  obviousPanelAreaSqMm?: number
}

export type Container = RectangularPanel | CylindricalContainer | OtherContainer

/**
 * Fraction of the wrappable surface treated as the principal display panel for
 * non-rectangular containers. A cylinder has no flat front, so the regulation
 * fixes the share rather than asking anyone to measure a curve.
 */
const NON_RECTANGULAR_PDP_FRACTION = 0.4

/** Computes PDP area in square millimetres. 21 CFR 101.1. */
export function pdpAreaSqMm(container: Container): number {
  switch (container.shape) {
    case 'rectangular':
      return container.widthMm * container.heightMm
    case 'cylindrical':
      return NON_RECTANGULAR_PDP_FRACTION * (container.heightMm * container.circumferenceMm)
    case 'other':
      return (
        container.obviousPanelAreaSqMm ??
        NON_RECTANGULAR_PDP_FRACTION * container.totalSurfaceAreaSqMm
      )
  }
}

/** Same calculation, expressed in the square inches the regulation is written in. */
export function pdpAreaSqInches(container: Container): number {
  return pdpAreaSqMm(container) / squareInchesToSquareMm(1)
}

/** The least surface available to bear labeling a package can have, and what fixes it. */
export interface LabelingSurfaceFloor {
  sqInches: number
  what: 'label' | 'principal display panel'
  why: string
}

/**
 * A floor under 21 CFR 101.9(j)(13)'s "total surface area available to bear labeling".
 *
 * That area is declared, because nothing the engine draws measures it. But two figures
 * the engine does have bound it from below: the label, since a package bears at least
 * the labeling on it, and the principal display panel, which is part of that surface.
 * The larger governs. A package whose label or panel is 12 in² cannot be under 12, and
 * one whose floor is over 40 cannot be at 40 or less, whatever area is typed.
 *
 * Found twice. The (j)(13)(i) exemption trusted the typed area until the review of the
 * PR that added it; the (j)(13)(ii) display route kept trusting it afterwards, and on a
 * 44.64 in² label with 5 in² typed it granted the tabular display, drew the Calories
 * numeral at 14 point where (d)(11)'s tabular display needs 22, and excused a mandatory
 * second column. Takes the stock's dimensions structurally so `geometry` imports
 * nothing from `templates`.
 */
export function labelingSurfaceFloor(
  stock: { widthMm: number; heightMm: number },
  container: Container,
): LabelingSurfaceFloor {
  const label: LabelingSurfaceFloor = {
    sqInches: (stock.widthMm * stock.heightMm) / squareInchesToSquareMm(1),
    what: 'label',
    why: 'a package bears at least the labeling on it',
  }
  const panel: LabelingSurfaceFloor = {
    sqInches: pdpAreaSqInches(container),
    what: 'principal display panel',
    why: 'that panel is part of the surface available to bear labeling',
  }
  return panel.sqInches > label.sqInches ? panel : label
}

/**
 * How the declaration is formed on the package. 21 CFR 101.7(i) closes with a
 * sentence that is easy to read past: a declaration shaped into the surface
 * rather than printed on it needs more type, because there is no ink contrast
 * to carry it.
 */
export type NetQuantityMarkingMethod = 'printed' | 'blown-embossed-or-molded'

/**
 * The extra height 21 CFR 101.7(i) demands of a declaration formed in the
 * surface: "Where the declaration is blown, embossed, or molded on a glass or
 * plastic surface rather than by printing, typing, or coloring, the lettering
 * sizes specified in paragraphs (h)(1) through (4) of this section shall be
 * increased by one-sixteenth of an inch."
 *
 * The cross-reference in that sentence is wrong in the official text — it says
 * (h)(1) through (4) where the type-size table is at (i)(1) through (4). The
 * error predates the 2016 redesignation: it reads identically in the 2016
 * edition of the section's former number. Left as the CFR has it, so a later
 * reader does not "correct" this comment back.
 */
const FORMED_SURFACE_INCREASE_INCHES = 1 / 16

/**
 * Minimum type height for the net quantity of contents declaration, by PDP
 * area. 21 CFR 101.7(i).
 *
 * **Which letter is measured is 101.7(h)(2), not this paragraph**, and it is
 * conditional: "Letter heights pertain to upper case or capital letters. When
 * upper and lower case or all lower case letters are used, it is the lower case
 * letter 'o' or its equivalent that shall meet the minimum standards." So the
 * default basis is the cap height and the lowercase "o" governs only a
 * declaration set with some lower case. Neither is the em, and a rule that
 * assumes the "o" always applies over-demands type on `NET WT 12 OZ` by a third.
 *
 * Bands are open at the lower bound and closed at the upper: "more than 5 but
 * not more than 25 square inches" puts exactly 25 in² in the 1/8" band.
 */
export function minNetQuantityTypeHeightInches(
  pdpSqInches: number,
  markingMethod: NetQuantityMarkingMethod = 'printed',
): number {
  const increase = markingMethod === 'printed' ? 0 : FORMED_SURFACE_INCREASE_INCHES
  if (pdpSqInches <= 5) return 1 / 16 + increase
  if (pdpSqInches <= 25) return 1 / 8 + increase
  if (pdpSqInches <= 100) return 3 / 16 + increase
  if (pdpSqInches <= 400) return 1 / 4 + increase
  return 1 / 2 + increase
}

/** The same minimum, in millimetres, for comparison against laid-out type. */
export function minNetQuantityTypeHeightMm(
  pdpSqInches: number,
  markingMethod: NetQuantityMarkingMethod = 'printed',
): number {
  return minNetQuantityTypeHeightInches(pdpSqInches, markingMethod) * MM_PER_INCH
}

/**
 * Which letter a regulated type size is measured by, given the text that will be
 * printed. 21 CFR 101.7(h)(2), verbatim:
 *
 * > "Letter heights pertain to upper case or capital letters. When upper and
 * > lower case or all lower case letters are used, it is the lower case letter
 * > 'o' or its equivalent that shall meet the minimum standards."
 *
 * So capitals are the default and the "o" is the exception, not the other way
 * round. `NET WT 12 OZ` is judged on its capitals; `Net wt 12 oz` on its "o",
 * which prints at 0.540 em against a capital's 0.698 and therefore needs a
 * markedly larger em to clear the same minimum.
 *
 * A declaration with no letters at all — a bare count, say — falls to the
 * capital basis. That is the conservative choice: IBM Plex's figures stand
 * 0.722 em, taller than its capitals, so they clear a bar set by cap height.
 *
 * **Not specific to the net quantity, despite living beside its table.**
 * 21 CFR 101.2(c) sets the floor for everything on the principal display or
 * information panel and then says "The requirements for conspicuousness and
 * legibility shall include the specifications of §§ 101.7(h)(1) and (2) and
 * 101.15" — so (h)(2) is incorporated by reference for the ingredient list, the
 * responsible firm and the allergen statement too. One reading, one function.
 */
export function regulatedGlyphBasis(text: string): GlyphBasis {
  return /\p{Ll}/u.test(text) ? 'lowercase-o' : 'cap-height'
}

/**
 * The floor for everything printed on the principal display or information
 * panel, in inches. 21 CFR 101.2(c): "in no case may the letters and/or numbers
 * be less than one-sixteenth inch in height unless an exemption pursuant to
 * paragraph (f) of this section is established."
 *
 * A floor, not a requirement in its own right. Where 101.7(i) demands more of
 * the net quantity than this, more is what applies; this binds the ingredient
 * list, the responsible firm and everything else the panel carries, for which no
 * larger figure is set anywhere.
 */
export const INFORMATION_PANEL_MIN_TYPE_HEIGHT_INCHES = 1 / 16

/** The same floor in millimetres: 1/16 inch is 1.5875 mm. */
export const INFORMATION_PANEL_MIN_TYPE_HEIGHT_MM =
  INFORMATION_PANEL_MIN_TYPE_HEIGHT_INCHES * MM_PER_INCH

/**
 * Panel area at or below which the bottom-30% placement rule does not apply.
 * 21 CFR 101.7(f): "on packages having a principal display panel of 5 square
 * inches or less, the requirement for placement within the bottom 30 percent of
 * the area of the label panel shall not apply".
 */
export const NET_QUANTITY_ZONE_EXEMPT_MAX_SQ_INCHES = 5

/**
 * The net quantity declaration must sit within the bottom 30% of the PDP.
 * Returns the y coordinate, in millimetres from the panel top, at which that
 * zone begins.
 *
 * 21 CFR 101.7(**f**) — the placement rule, not 101.7(i), which governs type
 * size. They are adjacent in the regulation and easy to conflate, and a finding
 * that cites the wrong paragraph is not a finding a user can act on.
 *
 * The regulation says "the bottom 30 percent of the *area* of the label panel"
 * and this measures a height. The two coincide exactly where width is constant
 * down the panel, which is true of every drawn label stock — so pass this the
 * height of the panel the declaration is *drawn on*, not a dimension of the
 * container. A cylinder's PDP is a 40%-of-circumference band whose width is
 * constant, so it holds there too; an "other" container has no height at all,
 * which is the case this must not be handed.
 */
export function netQuantityZoneTopMm(panelHeightMm: number): number {
  return panelHeightMm * 0.7
}

/**
 * Whether the bottom-30% placement rule applies to a panel of this size at all.
 *
 * A rule that checks placement without consulting this reports a violation
 * against a small package that is fully compliant — 21 CFR 101.7(f) exempts it.
 */
export function isNetQuantityZoneRequired(pdpSqInches: number): boolean {
  return pdpSqInches > NET_QUANTITY_ZONE_EXEMPT_MAX_SQ_INCHES
}
