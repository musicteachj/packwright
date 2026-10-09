/**
 * The pictograms on the label are the ones the classification requires.
 *
 * **Found by verification, not by design.** The precedence rule judges the set
 * that was *drawn*, which is right — Article 26 is about what appears on a
 * label. But nothing compared that set against the classification it came from,
 * so a document declaring serious eye damage and skin irritation while drawing
 * GHS02 and GHS07 came back with precedence "met": a green tick on a label whose
 * pictograms contradict its own hazards. A pass that is true in the narrow sense
 * and gravely misleading is the failure this project exists to prevent.
 *
 * **Firm in one direction, soft in the other.** A pictogram no declared hazard
 * requires is simply unjustified, and that is a violation. A pictogram that a
 * hazard requires but that is absent may have been *correctly* removed by
 * Article 26 — 26(a) and 26(e) make some optional and 26(b) to (d) forbid
 * others — and this rule does not model which. So absence is reported as an
 * advisory that says plainly it may be precedence at work, rather than asserting
 * a violation this rule cannot actually establish.
 *
 * **On a US label it stands down, and says the limit is this tool's.** It used to
 * judge a `us-osha` label against CLP Annex V and cite Annex V while doing it, so a
 * US label was told its pictograms were wrong under an EU regulation. 29 CFR
 * 1910.1200 Appendix C.2, read from the eCFR on 2026-10-09, gives the US answer:
 * a classified chemical's label "shall include the ... pictogram(s) ... specified
 * in C.4 for each hazard class and associated hazard category". C.4's tables are
 * published as images, this tool holds no verified copy of them, and its hazard
 * classes are CLP's, which do not map one to one onto OSHA's — Appendix A.3.2.1
 * lets a substance in eye irritation Category 2 be classified 2A or 2B, and
 * 1910.1200 has no aquatic hazard class at all. So on a US label this rule gives
 * no verdict, citing the paragraph it could not judge, and
 * `docs/WHAT-IS-NOT-CHECKED.md` says so. `ghs/pictogram-precedence` and
 * `ghs/pictogram-integrity` still judge US labels under OSHA's own text.
 */

import { derivedPictograms } from '../../ghs/precedence'
import type { GhsPictogramCode } from '../../ghs/pictograms'
import { GHS_PICTOGRAM_SYMBOLS } from '../../ghs/pictograms'
import { wasFullyDrawn } from '../../layout/omissions'
import { GHS_ELEMENTS } from '../../templates/ghs'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork } from '../finding'
import type { GhsRegime } from '../../ghs/statements'
import type { Decline, GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_PICTOGRAM_NOT_REQUIRED = 'GHS_PICTOGRAM_NOT_REQUIRED'
export const GHS_PICTOGRAM_MISSING = 'GHS_PICTOGRAM_MISSING'
export const GHS_PICTOGRAM_SET_MATCHES = 'GHS_PICTOGRAM_SET_MATCHES'

const CITATION: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Annex V',
  title: 'Hazard pictograms required by hazard class and category',
}

/** What a US label's pictograms answer to, which this rule cannot judge. See the note above. */
const US_CITATION: Citation = {
  authority: 'OSHA',
  reference: '29 CFR 1910.1200, Appendix C, C.2',
  title: 'Label elements specified in C.4 for each hazard class and category',
}

/**
 * Whether this rule stands down on a regime's labels, and what it says when it does.
 *
 * It judges only against CLP Annex V, the table it holds. **An exhaustive switch rather than a
 * test for one regime**, so a regime added to `GhsRegime` does not compile until somebody decides
 * what this rule says about it, instead of being judged against Annex V by default or told it
 * is a US label. One function for `declines` and `check`, so the two cannot disagree.
 */
function standsDownFor(regime: GhsRegime): Decline | undefined {
  switch (regime) {
    case 'eu-clp':
      return undefined
    case 'us-osha':
      return {
        reason:
          'This label is for the US market, where 29 CFR 1910.1200 Appendix C.2 takes a ' +
          'classified chemical’s pictograms from the tables in C.4, hazard class by hazard ' +
          'class. This tool holds no verified copy of those tables, and the hazard classes it ' +
          'offers are those of the EU’s CLP Regulation, which do not map one to one onto ' +
          'OSHA’s. So it gives no verdict on whether the pictograms printed are the ones your ' +
          'classification requires. That is a limit of this tool, not a fault found in your label.',
        citation: US_CITATION,
        wants: [],
        limit: true,
      }
    default: {
      const unreached: never = regime
      return unreached
    }
  }
}

export const ghsPictogramSetRule: GhsChemicalRule = {
  id: 'ghs/pictogram-set',
  title: 'On an EU label, every pictogram is one the classification requires.',
  citation: CITATION,
  codes: {
    [GHS_PICTOGRAM_NOT_REQUIRED]: ['violation'],
    [GHS_PICTOGRAM_MISSING]: ['advisory'],
    [GHS_PICTOGRAM_SET_MATCHES]: ['pass'],
  },
  appliesTo: 'ghs-chemical',

  /**
   * A label carries H-statements and pictograms, not hazard classes.
   *
   * So this rule reads something no label prints and nothing derives: with no
   * classification it has nothing to compare against and stands down. That was
   * silence, and on a reading taken from a photograph — which yields H-codes —
   * it is the normal case rather than the exception.
   */
  declines({ data }: GhsChemicalContext): Decline | undefined {
    // First, because no fact the label could state would make the check run.
    const limit = standsDownFor(data.regime)
    if (limit !== undefined) return limit
    if ((data.hazards ?? []).length > 0) return undefined
    return {
      reason:
        'This label declares no hazard classification, so nothing here can tell you ' +
        'whether the pictograms printed are the ones this substance’s hazards require. A classification cannot be worked out from the H-codes a label ' +
        'prints — classify the substance and this check will run.',
      wants: ['hazards'],
    }
  },

  check({ data, layout }: GhsChemicalContext): Finding[] {
    // Declined above, at this tool's limit. Judging a US label against Annex V is the
    // defect this guard exists to prevent.
    if (standsDownFor(data.regime) !== undefined) return []
    const hazards = data.hazards ?? []
    // With no classification there is nothing to compare against. Declining is
    // not a pass — see the note on `Rule.check`.
    if (hazards.length === 0) return []

    // Compared against the set *after* Article 26, not before it. Comparing
    // against the raw requirement flagged GHS07 as missing on labels this tool
    // had itself derived as compliant — reintroducing the derivation-versus-rule
    // disagreement that `ghs/precedence.ts` was extracted to end.
    const required = new Set(derivedPictograms(hazards, data.regime))
    const drawn = layout.pictograms.map((p) => ({
      code: p.code as GhsPictogramCode,
      elementId: p.elementId,
    }))
    const drawnCodes = new Set(drawn.map((p) => p.code))

    const findings: Finding[] = []

    for (const pictogram of drawn) {
      if (required.has(pictogram.code)) continue
      findings.push(
        finding(ghsPictogramSetRule, {
          code: GHS_PICTOGRAM_NOT_REQUIRED,
          severity: 'violation',
          message:
            `${pictogram.code} (${GHS_PICTOGRAM_SYMBOLS[pictogram.code]}) is on the label, but no ` +
            'hazard class declared for this product requires it.',
          elementId: pictogram.elementId,
        }),
      )
    }

    for (const code of required) {
      if (drawnCodes.has(code)) continue
      findings.push(
        finding(ghsPictogramSetRule, {
          code: GHS_PICTOGRAM_MISSING,
          // Advisory rather than violation: Article 26 legitimately removes some
          // pictograms, and this rule does not model which.
          severity: 'advisory',
          message:
            `${code} (${GHS_PICTOGRAM_SYMBOLS[code]}) is required by a declared hazard class and ` +
            'is not on the label. Check that a precedence rule accounts for its absence.',
          elementId: GHS_ELEMENTS.pictograms,
        }),
      )
    }

    // **A frame is not a pictogram, so a set of frames has not been certified.**
    // This judges the pictograms the label carries, and one whose symbol was not
    // drawn is not carried (C.2.3.1). The pass names the strip so the canvas can
    // outline it, while omissions are recorded per pictogram — so the guard in
    // `runRules` never matched, and this cleared the set on every GHS label beside
    // a `GHS_PICTOGRAM_SYMBOL_MISSING` for the same frame. Declined rather than
    // reported: the integrity rule owns that defect. While no glyph artwork is
    // verified, that is every label carrying a pictogram.
    const everyMemberPrinted = layout.pictograms.every((pictogram) =>
      wasFullyDrawn(layout, pictogram.elementId),
    )

    if (findings.length === 0 && everyMemberPrinted) {
      findings.push(
        // Whether the pictograms the label carries are the ones Annex V requires: the artwork.
        passedOnArtwork(
          ghsPictogramSetRule,
          GHS_PICTOGRAM_SET_MATCHES,
          'Every pictogram on the label is required by a declared hazard class.',
          GHS_ELEMENTS.pictograms,
        ),
      )
    }

    return findings
  },
}
