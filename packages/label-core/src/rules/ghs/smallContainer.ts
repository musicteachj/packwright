/**
 * Reduced labelling for small containers.
 *
 * **Sources, both read rather than recalled.** 29 CFR 1910.1200(f)(12), from the
 * eCFR on 2026-09-12 (title 29 issued 2026-09-09). CLP Annex I sections 1.5.1
 * and 1.5.2, from the consolidated text `02008R1272 — EN — 01.09.2025 —
 * 029.003`.
 *
 * **The two regimes are not the same rule with a different number on it**, and
 * the design document's one-line summary of this was wrong in four ways. OSHA
 * sets a *requirement*: at 100 ml or less, a reduced but mandatory minimum set.
 * CLP grants a *permission*: at 125 ml or less, statements may be omitted for
 * listed hazard categories. The thresholds differ, the contents differ, and only
 * one of them mentions a statement pointing at the outer package.
 *
 * **Neither applies on capacity alone.** OSHA (f)(12)(i) applies only where the
 * manufacturer "can demonstrate that it is not feasible to use pull-out labels,
 * fold-back labels, or tags containing the full label information", and CLP's
 * hangs on Article 29. Both are determinations about packaging and process that
 * no amount of inspecting a label can settle, so the supplier declares the path
 * and this rule checks what that declaration then obliges them to carry. A rule
 * that switched on capacity alone would be enforcing a provision nobody invoked.
 *
 * **What each regime lists, re-read on 2026-10-18** (the eCFR for (f)(12); the CLP
 * consolidation of 2026-07-01 from the Publications Office), after the source
 * verification of 2026-10-17 found this rule wrong in four ways (items 10 and 13):
 * - **CLP 1.5.1.2**, as amended by 2024/2865, requires the inner packaging to carry "at
 *   least the hazard pictograms, the signal words, the product identifier ... and the name
 *   and telephone number of the suppliers". The signal word was left out, so the pass
 *   could clear an inner label without one.
 * - **CLP 1.5.1.1 has no capacity limit.** "Where Article 29(1) applies, the label elements
 *   ... may be provided on a tie-on tag or on an outer packaging." The 125 ml of 1.5.2.1 is
 *   a different permission, to omit statements, and gating this route on it reported a
 *   larger package for using 1.5.1.
 * - **CLP 1.5.2.4.2, at 10 ml or less**: "Notwithstanding sections 1.5.1.2 and 1.5.2.4.1,
 *   the label on the inner packaging shall contain the product identifier and, where
 *   appropriate, the hazard pictograms 'GHS01', 'GHS05', 'GHS06' and/or 'GHS08'." That is
 *   the floor of 1.5.2.4.1's exemption, which needs one of its conditions (a) to (c), and
 *   1.5.2.5 excludes plant protection products and biocides; none of that is stated here.
 *   So at 10 ml or less a missing supplier name or telephone is not reported, and is not
 *   passed either: the rule says, as a limit of the tool, that 1.5.2.4 may excuse it.
 *   Found by `/code-review medium` on the fix, which first applied 1.5.2.4.2 on capacity
 *   alone.
 * - **The pictograms and the signal word are the classification's.** OSHA (f)(12)(ii)
 *   lists "Pictogram(s)" and "Signal word", and CLP "the hazard pictograms, the signal
 *   words"; a classification that carries neither owes neither, and the rule demanded both
 *   of every label. On a CLP label each pictogram Annex V assigns, less any Article 26 makes
 *   optional, must be on it; a label may declare its own pictograms, so this is asked of the
 *   drawing rather than assumed of the engine (found by `/code-review high` on #106, after a
 *   first version passed a label with none). OSHA's assignments are Appendix C.4's, which
 *   this tool does not hold, so a US label drawing no pictogram gets no pass and a stated
 *   limit, as `ghs/pictogram-set` does. Which classifications carry a signal
 *   word is not in this tool's tables, so a label with none gets no pass, and the rule
 *   says so as a limit of the tool rather than reporting a word the label may not owe.
 *
 * The 3 ml tier in (f)(12)(iii) is deliberately not encoded: it applies "where
 * the chemical manufacturer... can demonstrate that any label interferes with
 * the normal use of the container", which is a further determination this engine
 * has no way to represent, and encoding the relaxation without the condition
 * would let a label drop its pictograms on a capacity check alone.
 */

import { SYMBOL_NOT_DRAWN_BECAUSE } from '../../layout/ghsEngine'
import { omissionsForElement, wasFullyDrawn } from '../../layout/omissions'
import { GHS_ELEMENTS } from '../../templates/ghs'
import { isPictogramRecognised, type GhsPictogramCode } from '../../ghs/pictograms'
import { derivedPictograms, precedenceSuppressions } from '../../ghs/precedence'
import type { GhsRegime } from '../../ghs/statements'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork } from '../finding'
import type { Decline, GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_SMALL_CONTAINER_INCOMPLETE = 'GHS_SMALL_CONTAINER_INCOMPLETE'
export const GHS_SMALL_CONTAINER_NOT_ELIGIBLE = 'GHS_SMALL_CONTAINER_NOT_ELIGIBLE'
export const GHS_SMALL_CONTAINER_AVAILABLE = 'GHS_SMALL_CONTAINER_AVAILABLE'
export const GHS_SMALL_CONTAINER_COMPLETE = 'GHS_SMALL_CONTAINER_COMPLETE'

/** A capacity in words: "1 liter", "0.1 liters". */
const liters = (capacityL: number): string => `${capacityL} ${capacityL === 1 ? 'liter' : 'liters'}`

/**
 * Both titles are the sources' own headings, so they keep the sources' spelling, re-read
 * on 2026-10-27: the eCFR (as of 2026-10-01) heads 1910.1200(f)(12) "Small container
 * labelling", the one place in the section OSHA writes it that way, and the CLP
 * consolidation of 2026-07-01 heads Annex I 1.5 "Exemptions from labelling and packaging
 * requirements". This module's own sentences are in American English.
 */
const US: Citation = {
  authority: 'OSHA',
  reference: '29 CFR 1910.1200(f)(12)',
  title: 'Small container labelling',
}

const EU: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.5',
  title: 'Exemptions from labelling and packaging requirements',
}

/** OSHA (f)(12)(ii): "a container less than or equal to 100 ml capacity". */
export const OSHA_SMALL_CONTAINER_MAX_L = 0.1
/** CLP 1.5.2.1.1(a): "the contents of the package do not exceed 125 ml". */
export const CLP_SMALL_PACKAGE_MAX_L = 0.125
/** CLP 1.5.2.4: "inner packaging where the contents do not exceed 10 ml". */
export const CLP_INNER_PACKAGING_MAX_L = 0.01

/** Whether CLP 1.5.2.4 may reach the inner label: 10 ml or less, on capacity alone. */
const underTenMl = (data: GhsChemicalContext['data']): boolean =>
  data.regime === 'eu-clp' && data.capacityL <= CLP_INNER_PACKAGING_MAX_L

/** Whether the label carries a signal word, the one listed element no table here derives. */
const carriesSignalWord = (data: GhsChemicalContext['data']): boolean =>
  (data.signalWords ?? []).length > 0

/**
 * The pictograms a CLP classification assigns that the label does not carry: Annex V's, after
 * the clauses of Article 26 that forbid one, less those it makes optional. Empty for a US
 * label, whose assignments this tool does not hold, and for one with no classification.
 */
const missingAssignedPictograms = ({
  data,
  layout,
}: Pick<GhsChemicalContext, 'data' | 'layout'>): readonly GhsPictogramCode[] => {
  const hazards = data.hazards ?? []
  if (data.regime !== 'eu-clp' || hazards.length === 0) return []
  const assigned = derivedPictograms(hazards, 'eu-clp')
  const optional = new Set(
    precedenceSuppressions(assigned, hazards, 'eu-clp')
      .filter((suppression) => suppression.kind === 'optional')
      .map((suppression) => suppression.code),
  )
  const drawn = new Set(layout.pictograms.map((pictogram) => pictogram.code))
  return assigned.filter((code) => !drawn.has(code) && !optional.has(code))
}

/** Whether the supplier's name and telephone, both listed, are on the document. */
const carriesSupplier = (data: GhsChemicalContext['data']): boolean =>
  Boolean(data.supplier?.name?.trim()) && Boolean(data.supplier?.telephone?.trim())

/**
 * What the provision lists that has to reach the container's own label, as elements: the
 * product identifier, the pictograms drawn from the classification, the supplier, the signal
 * word where one is carried, and OSHA's outer-package statement.
 */
function listedElements({ data, layout }: Pick<GhsChemicalContext, 'data' | 'layout'>): string[] {
  return [
    GHS_ELEMENTS.productIdentifier,
    ...layout.pictograms.map((pictogram) => pictogram.elementId),
    // Not held to printing where 1.5.2.4 may excuse it and it is not there: see below.
    ...(underTenMl(data) && !carriesSupplier(data) ? [] : [GHS_ELEMENTS.supplier]),
    ...(carriesSignalWord(data) ? [GHS_ELEMENTS.signalWord] : []),
    ...(data.regime === 'us-osha' ? [GHS_ELEMENTS.outerPackageStatement] : []),
  ]
}

/**
 * What stands between a label that reported nothing missing and its pass, that this tool
 * cannot settle, in the words the decline gives. One computation for `check`, which stands
 * down on any of them, and `declines`, which names them all, so the two cannot disagree.
 *
 * `undefined` where something listed did not print for any other reason: the omissions say
 * what, and a decline calling the gap this tool's would excuse it.
 */
function unsettled(context: GhsChemicalContext): string[] | undefined {
  const { data, layout, subject } = context
  const reasons: string[] = []
  const unprinted = listedElements(context).filter((id) => !wasFullyDrawn(layout, id))
  if (unprinted.length > 0) {
    const pictogramIds = new Set(layout.pictograms.map((pictogram) => pictogram.elementId))
    const onlyTheSymbols = unprinted.every(
      (id) =>
        pictogramIds.has(id) &&
        omissionsForElement(layout, id).every(
          (omission) => omission.explanation?.why === SYMBOL_NOT_DRAWN_BECAUSE[data.regime],
        ),
    )
    // And only where every pictogram is one the regime recognizes: a GHS09 on a US label
    // is reported beside this as not a pictogram at all, so seeing its symbol would not
    // let the check pass, and calling the gap this tool's would excuse it. Found by review.
    const allRecognised = layout.pictograms.every((pictogram) =>
      isPictogramRecognised(data.regime, pictogram.code as GhsPictogramCode),
    )
    if (subject !== 'described' || !onlyTheSymbols || !allRecognised) return undefined
    reasons.push(
      'Packwright cannot see the pictograms’ symbols, so it cannot confirm the pictograms are ' +
        'complete',
    )
  }
  // OSHA assigns pictograms in Appendix C.4, which this tool does not hold; with none drawn,
  // whether the classification owes one cannot be told.
  if (data.regime === 'us-osha' && layout.pictograms.length === 0) {
    reasons.push(
      'the label carries no pictogram, and which pictograms Appendix C.4 of 29 CFR ' +
        '1910.1200 assigns its classification is not in Packwright’s tables',
    )
  }
  if (!carriesSignalWord(data)) {
    reasons.push(
      'the label carries no signal word, which the provision lists only where the ' +
        'classification calls for one, and which classifications do is not in Packwright’s ' +
        'tables',
    )
  }
  if (
    underTenMl(data) &&
    (!carriesSupplier(data) || missingAssignedPictograms(context).length > 0)
  ) {
    reasons.push(
      'at 10 ml or less CLP Annex I 1.5.2.4 lets the inner label carry only the product ' +
        'identifier and, where appropriate, GHS01, GHS05, GHS06 and/or GHS08, where one of the ' +
        'conditions in 1.5.2.4.1 holds and the product is not a plant protection product or ' +
        'biocide (1.5.2.5), and otherwise 1.5.1.2 asks for the supplier’s name and telephone ' +
        'and every assigned pictogram; which applies is not something Packwright can tell',
    )
  }
  return reasons
}

/** The threshold for a regime, so a form cannot state a different number than the rule applies. */
export function smallContainerThresholdL(regime: GhsRegime): number {
  return regime === 'us-osha' ? OSHA_SMALL_CONTAINER_MAX_L : CLP_SMALL_PACKAGE_MAX_L
}

export const ghsSmallContainerRule: GhsChemicalRule = {
  id: 'ghs/small-container',
  title: 'A label relying on the small-container provision carries what that provision requires.',
  citation: US,
  citations: [US, EU],
  codes: {
    [GHS_SMALL_CONTAINER_INCOMPLETE]: ['violation'],
    [GHS_SMALL_CONTAINER_NOT_ELIGIBLE]: ['violation'],
    [GHS_SMALL_CONTAINER_AVAILABLE]: ['guidance'],
    [GHS_SMALL_CONTAINER_COMPLETE]: ['pass'],
  },
  appliesTo: 'ghs-chemical',

  check(context: GhsChemicalContext): Finding[] {
    const { data, layout } = context
    const isUs = data.regime === 'us-osha'
    const citation = isUs ? US : EU
    const maxL = smallContainerThresholdL(data.regime)
    const eligible = data.capacityL <= maxL
    const tenMl = underTenMl(data)

    if (!data.smallContainerLabelling) {
      // Not on this path. Say the provision exists where it could be used, and
      // say nothing at all where it could not.
      if (!eligible) return []
      return [
        finding(ghsSmallContainerRule, {
          code: GHS_SMALL_CONTAINER_AVAILABLE,
          severity: 'guidance',
          message:
            `At ${liters(data.capacityL)} this container is within the ${maxL} liter threshold for ` +
            (isUs
              ? 'reduced labeling, which applies where full-information pull-out, fold-back or tag ' +
                'labeling is not feasible.'
              : 'the small-package exemptions, under which some statements may be omitted for ' +
                'certain hazard categories.'),
          citation,
        }),
      ]
    }

    // CLP's 1.5.1, the tie-on tag or outer packaging, has no capacity limit: only OSHA's
    // provision stops at a size.
    if (!eligible && isUs) {
      return [
        finding(ghsSmallContainerRule, {
          code: GHS_SMALL_CONTAINER_NOT_ELIGIBLE,
          severity: 'violation',
          message:
            `This label relies on the small-container provision, but at ${liters(data.capacityL)} ` +
            `the container exceeds the ${maxL} liter threshold the provision sets.`,
          measurement: { actual: `${data.capacityL} L`, required: `${maxL} L or less` },
          citation,
        }),
      ]
    }

    // The minimum set each regime demands on the container itself. The pictograms and the
    // signal word are not demanded here: the engine draws the classification's pictograms,
    // and whether it carries a signal word is not this tool's to say (see the module note).
    const missing: string[] = []
    if (!data.productIdentifier.trim()) missing.push('the product identifier')
    // At 10 ml or less 1.5.2.4 may excuse the supplier details, so their absence is left to
    // `unsettled` rather than reported.
    if (!tenMl && !data.supplier?.name?.trim()) {
      missing.push(isUs ? 'the manufacturer’s name' : 'the supplier’s name')
    }
    // Both regimes name a telephone number explicitly, and it is the element
    // most easily left off since it is optional everywhere else.
    if (!tenMl && !data.supplier?.telephone?.trim()) {
      missing.push(isUs ? 'the manufacturer’s phone number' : 'the supplier’s telephone number')
    }
    // Each pictogram the classification assigns, on a CLP label; at 10 ml or less 1.5.2.4.2
    // may excuse some, so there the gap is `unsettled`'s.
    const unassigned = missingAssignedPictograms({ data, layout })
    if (!tenMl && unassigned.length > 0) {
      missing.push(
        `the pictogram${unassigned.length === 1 ? '' : 's'} its classification assigns ` +
          `(${unassigned.join(', ')})`,
      )
    }
    // No classification, no pictograms to hold it to: nothing is cleared, and
    // `ghs/pictogram-set` asks for the classification.
    if ((data.hazards ?? []).length === 0 && layout.pictograms.length === 0) return []
    if (isUs && !data.outerPackageStatement?.trim()) {
      missing.push('a statement that the full label information is on the immediate outer package')
    }

    if (missing.length > 0) {
      const list =
        missing.length === 1
          ? missing[0]
          : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
      return [
        finding(ghsSmallContainerRule, {
          code: GHS_SMALL_CONTAINER_INCOMPLETE,
          severity: 'violation',
          message: `A small container relying on this provision must still carry ${list}.`,
          elementId: GHS_ELEMENTS.supplier,
          citation,
        }),
      ]
    }

    // **Carried means printed.** `missing` reads the document, which says what was
    // asked for; this asks whether it reached the label. A frame with no symbol is
    // not a pictogram, and a supplier line that did not print is not carried — yet
    // this pass said "carries everything" beside `GHS_PICTOGRAM_SYMBOL_MISSING` for
    // the only pictogram. It names no element, so the guard in `runRules` has
    // nothing to look up and cannot withhold it; the rule has to. Declined rather
    // than reported, because the omission and the integrity rule already say what
    // did not print, and a second finding would report one defect twice.
    const listed = listedElements({ data, layout })
    if (!listed.every((elementId) => wasFullyDrawn(layout, elementId))) return []
    // What this tool cannot settle stands it down too, and `declines` names it.
    if ((unsettled(context) ?? []).length > 0) return []

    return [
      // Both provisions list what the container's own label must still carry: the artwork.
      passedOnArtwork(
        ghsSmallContainerRule,
        GHS_SMALL_CONTAINER_COMPLETE,
        (tenMl
          ? 'The inner packaging carries everything CLP Annex I 1.5.1.2 lists, which also covers ' +
            '1.5.2.4.2’s shorter list for 10 ml or less: '
          : 'The container carries everything the small-container provision requires of it: ') +
          'the product identifier, the pictograms its classification assigns, the signal ' +
          `word, the ${isUs ? 'manufacturer’s name and phone number' : 'supplier’s name and telephone number'}` +
          `${isUs ? ', and the statement pointing to the outer package' : ''}.`,
        undefined,
        citation,
      ),
    ]
  },

  /**
   * On a label printed elsewhere, the one thing standing between it and the pass may
   * be that nobody can see its pictograms' symbols.
   *
   * `check` withholds the pass whenever a listed element did not print, and every
   * pictogram carries the "symbol not drawn" omission, so on a drawing the pass
   * never comes and `GHS_PICTOGRAM_SYMBOL_MISSING` says why. On a described label
   * that finding stands down (`ghs/pictogram-integrity`), and the silence here was
   * left with nothing beside it to explain it — a check that read as never having
   * been written. Found by `/code-review high` on #86. So where the unseen symbols
   * are all that is missing, this says so as a limit of the tool; where anything
   * else did not print, the omissions say what, as before.
   */
  declines(context: GhsChemicalContext): Decline | undefined {
    const { data } = context
    if (!data.smallContainerLabelling) return undefined
    if (ghsSmallContainerRule.check(context).length > 0) return undefined
    const reasons = unsettled(context)
    if (reasons === undefined || reasons.length === 0) return undefined
    return {
      reason:
        'Everything else the small-container provision lists is on this label, but ' +
        `${reasons.join('; and ')}. That is a limit of this tool, not a fault found in your label.`,
      citation: data.regime === 'us-osha' ? US : EU,
      wants: [],
      limit: true,
    }
  },
}
