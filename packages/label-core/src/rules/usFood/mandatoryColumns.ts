/**
 * Which second columns 21 CFR 101.9 obliges a label to carry.
 *
 * `dualColumnDuty` answers that, but assembling its input is more than a
 * projection of the panel: exemption (A) turns on *entitlement* to the
 * small-package displays, which is computed from the drawn stock and the
 * container rather than read off the document.
 *
 * Three rules need the same answer and would otherwise each build it.
 * `us-food/dual-column-required` reports a column that is owed and missing;
 * `us-food/dual-column-form` and `us-food/protein-percent` need it for a
 * different reason — to know whether 101.9(e)(6) reaches the column a label
 * actually drew, since (e)(6) governs only the columns (b)(12)(i) and
 * (b)(2)(i)(D) require. Three copies of an assembly this conditional would
 * drift, and the one that drifted would decide a citation.
 */

import {
  DUAL_COLUMN_BASIS_REFERENCE,
  dualColumnDuty,
  smallPackageRouteApplies,
} from '../../fda/nutritionFormats'
import type { DualColumnDuty, DualColumnFact } from '../../fda/nutritionFormats'
import type { DeclinedFact } from '../types'
import { labelingSurfaceFloor } from '../../geometry/pdp'
import type { LabelStock } from '../../templates/stock'
import type { UsFoodLabelData } from '../../templates/usFood'

/**
 * What second column, if any, this label is obliged to carry.
 *
 * Returns an empty duty for a label with no nutrition panel, which is the same
 * answer as a label that stated no reference amount: not cleared, not asked.
 */
export function dualColumnDutyFor(data: UsFoodLabelData, stock: LabelStock): DualColumnDuty {
  const panel = data.nutritionFacts
  if (panel === undefined) {
    // Asked of the one computation rather than written out: a hand-copied
    // literal here was a second statement of what each provision waits for,
    // which is what `unstated` exists to say in one place. Found by review.
    return dualColumnDuty({})
  }

  // (A) turns on entitlement — "products that **meet the requirements to use**
  // the tabular format", not products that use it — so it is computed from the
  // package rather than from the display the label happens to carry.
  const meetsSmallPackageRequirements =
    panel.availableSurfaceSqInches !== undefined &&
    smallPackageRouteApplies({
      availableSqInches: panel.availableSurfaceSqInches,
      // A package whose label or panel is too big for the route cannot meet its
      // requirements, whatever area is declared — and the exemption this grants is
      // stamped on the document, so no omission would ever withhold it.
      floor: labelingSurfaceFloor(stock, data.container),
      ...(panel.cannotAccommodateVertical === undefined
        ? {}
        : { cannotAccommodateVertical: panel.cannotAccommodateVertical }),
    })

  return dualColumnDuty({
    ...(panel.referenceAmount === undefined ? {} : { referenceAmount: panel.referenceAmount }),
    ...(panel.packageContent === undefined ? {} : { packageContent: panel.packageContent }),
    ...(panel.unitContent === undefined ? {} : { unitContent: panel.unitContent }),
    ...(panel.packagedAndSoldIndividually === undefined
      ? {}
      : { packagedAndSoldIndividually: panel.packagedAndSoldIndividually }),
    ...(panel.columns === undefined ? {} : { columns: panel.columns }),
    ...(panel.dualColumnExemption?.rawCommodityVoluntary === undefined
      ? {}
      : { rawCommodityVoluntary: panel.dualColumnExemption.rawCommodityVoluntary }),
    ...(panel.dualColumnExemption?.variedWeight === undefined
      ? {}
      : { variedWeight: panel.dualColumnExemption.variedWeight }),
    meetsSmallPackageRequirements,
  })
}

/**
 * A provision's missing facts, as the paths a decline names them by.
 *
 * `fda/` speaks of `DualColumnInput`'s own fields; a decline speaks of the
 * label's data, where those fields sit under `nutritionFacts`.
 */
export const asDeclinedFacts = (facts: readonly DualColumnFact[]): DeclinedFact[] =>
  facts.map((fact) => `nutritionFacts.${fact}` as const)

/** What each fact is called when a user is asked to state it. */
const FACT_NAMES: Readonly<Record<DualColumnFact, string>> = {
  referenceAmount: 'the reference amount',
  packageContent: 'what the whole package holds',
  unitContent: 'what one individual unit holds',
  packagedAndSoldIndividually: 'whether it is packaged and sold individually',
}

/**
 * "State the reference amount and what one individual unit holds" — the
 * instruction a decline ends on, built from the same facts it names in `wants`.
 *
 * Written by hand in each rule, the instruction had drifted from what the rule
 * needed: two rules told a user with a per-unit column to state the package's
 * facts, which (b)(2)(i)(D) does not read, so somebody who did exactly as told
 * was left with the check still standing down. Generated from the list, the
 * words and the links beneath them cannot disagree.
 */
export function stateThese(facts: readonly DualColumnFact[]): string {
  const names = facts.map((fact) => FACT_NAMES[fact])
  const list =
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `State ${list}`
}

/**
 * The provision that decides whether a mandatory column on this basis is owed,
 * as the decline prose cites it beside "101.9(e)(6)".
 *
 * Taken from `DUAL_COLUMN_BASIS_REFERENCE`, the table the findings cite and
 * `citations.test.ts` checks, rather than written again — a second table was
 * a correction to one that would never reach the other. Found by review.
 */
export const PROVISION_FOR = (basis: 'per-container' | 'per-unit'): string =>
  DUAL_COLUMN_BASIS_REFERENCE[basis].replace(/^21 CFR /, '')
