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
import type {
  DualColumnBasis,
  DualColumnDuty,
  MandatoryDualColumnBasis,
} from '../../fda/nutritionFormats'
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

/** The facts each provision turns on, named so a user knows what to fill in. */
const FACTS_ASKED: Record<MandatoryDualColumnBasis, string> = {
  'per-container':
    'its reference amount, its package content, and whether it is packaged and sold individually',
  'per-unit': 'its reference amount and its unit content',
}

const paragraphOf = (reference: string) => reference.replace('21 CFR ', '')

/**
 * Why 101.9(e)(6) does not reach the second column a label declared.
 *
 * Reads as a clause following "…(b)(12)(i) and (b)(2)(i)(D) require, and ", and
 * both rules that fall back to a general citation use it, so the two cannot come
 * to describe the same label differently.
 *
 * **"Voluntarily" is the claim to be careful with.** It says the user chose to
 * add this column, which is only true where the label stated every fact the
 * question turns on and they came back no. Two reviews of this change found it
 * asserted where nothing of the sort was known — first on a label with no
 * reference amount, then on one that stated the amount but not the package
 * content, which is every label the editor builds.
 */
export function whyNotReached(basis: DualColumnBasis, duty: DualColumnDuty): string {
  if (basis !== 'per-container' && basis !== 'per-unit') {
    return 'this column counts neither a container nor a unit'
  }
  const other = basis === 'per-container' ? 'per-unit' : 'per-container'

  // A label can owe one column and declare the other. Calling that voluntary is
  // plainly wrong — something is required here, just not the column it declares —
  // and it contradicts the mandate rule's own pass on the same label.
  if (duty.standing[other] === 'required') {
    return (
      `this label owes a ${other} column under ${paragraphOf(DUAL_COLUMN_BASIS_REFERENCE[other])}, ` +
      'which is not the column it declares'
    )
  }

  switch (duty.standing[basis]) {
    case 'undetermined':
      return (
        `the label has not stated everything ${paragraphOf(DUAL_COLUMN_BASIS_REFERENCE[basis])} ` +
        `turns on — ${FACTS_ASKED[basis]} — so whether it requires this column cannot be told`
      )
    case 'excused':
      return duty.exemption === undefined
        ? `${paragraphOf(DUAL_COLUMN_BASIS_REFERENCE[basis])} does not require this column`
        : `${paragraphOf(duty.exemption)} excuses this package from the column it would ` +
            'otherwise require'
    case 'required':
      // Unreachable: a required column is one (e)(6) reaches, so this is never asked.
      return `${paragraphOf(DUAL_COLUMN_BASIS_REFERENCE[basis])} requires this column`
    default:
      return (
        `${paragraphOf(DUAL_COLUMN_BASIS_REFERENCE[basis])} does not require this column, so it ` +
        'is carried voluntarily'
      )
  }
}
