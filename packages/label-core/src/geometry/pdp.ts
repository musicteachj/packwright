/**
 * Principal Display Panel geometry — 21 CFR 101.
 *
 * The PDP is the part of the package a shopper is most likely to see on the
 * shelf, and a surprising amount of US food law keys off its *area*: how large
 * the net quantity statement must be printed, and how much of the panel it must
 * sit within. So panel area is not a cosmetic figure — get it wrong and every
 * type-size check downstream is wrong with it.
 */

import { squareInchesToSquareMm } from './units'

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

/**
 * Minimum type height for the net quantity of contents declaration, by PDP
 * area. 21 CFR 101.7(i).
 *
 * Height is measured by the lowercase letter "o" — not the cap height and not
 * the point size, both of which run larger and will pass a check the printed
 * label fails.
 *
 * Bands are open at the lower bound and closed at the upper: "more than 5 but
 * not more than 25 square inches" puts exactly 25 in² in the 1/8" band.
 */
export function minNetQuantityTypeHeightInches(pdpSqInches: number): number {
  if (pdpSqInches <= 5) return 1 / 16
  if (pdpSqInches <= 25) return 1 / 8
  if (pdpSqInches <= 100) return 3 / 16
  if (pdpSqInches <= 400) return 1 / 4
  return 1 / 2
}

/** The same minimum, in millimetres, for comparison against laid-out type. */
export function minNetQuantityTypeHeightMm(pdpSqInches: number): number {
  return minNetQuantityTypeHeightInches(pdpSqInches) * 25.4
}

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
