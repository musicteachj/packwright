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

import { dualColumnDuty, smallPackageRouteApplies } from '../../fda/nutritionFormats'
import type { DualColumnDuty } from '../../fda/nutritionFormats'
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
    return { standing: { 'per-container': 'undetermined', 'per-unit': 'undetermined' } }
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
