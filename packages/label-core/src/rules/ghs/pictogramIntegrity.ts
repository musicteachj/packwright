/**
 * A pictogram must carry a hazard symbol, and be one the regime recognises.
 *
 * **Source.** 29 CFR 1910.1200 Appendix C, read from the eCFR on 2026-09-12
 * (title 29 issue date 2026-09-09). C.2.3.1, verbatim: "Pictograms shall be in
 * the shape of a square set at a point and shall include a black hazard symbol
 * on a white background with a red frame sufficiently wide to be clearly
 * visible. A square red frame set at a point without a hazard symbol is not a
 * pictogram and is not permitted on the label." C.2.3.2: "One of eight standard
 * hazard symbols shall be used in each pictogram."
 *
 * **This rule fires on every GHS label this engine currently draws, and that is
 * the point.** The Annex V specimen artwork could not be verified, so the layout
 * draws each frame at its resolved size and records the missing symbol as an
 * omission rather than approximating it. Under OSHA that produces exactly what
 * C.2.3.1 forbids. Leaving the consequence in a source comment would let a user
 * export a label the regulation prohibits while the rail reported nothing, so
 * the rule says it out loud.
 *
 * **On a label printed elsewhere it stands down instead** (`LabelSubject`). There
 * the empty frame is this engine's reconstruction, not the user's ink, and the
 * finding was a false one about their label: the 2026-10-10 evaluation's Haiku
 * relayed it as a defect in all 18 of its GHS answers. The rule declines as a
 * limit of the tool and gives no verdict either way — never a pass, since nothing
 * was seen — and the layout's omission says the same per pictogram, in words
 * about the user's label. Read again from the eCFR on 2026-10-11 (title 29 as of
 * 2026-10-01): C.2.3.1 and C.2.3.2 are as quoted above.
 *
 * CLP reaches the same place by a different route — Annex I 1.2.1.2 requires a
 * black symbol on a white background — but does not spell out that a frame alone
 * is forbidden. The severity differs accordingly: blocking where the text is
 * explicit, violation where it is implied.
 */

import { isPictogramRecognised, type GhsPictogramCode } from '../../ghs/pictograms'
import type { Citation, Finding } from '../../types/index'
import { finding, passedOnArtwork } from '../finding'
import type { Decline, GhsChemicalContext, GhsChemicalRule } from '../types'

export const GHS_PICTOGRAM_SYMBOL_MISSING = 'GHS_PICTOGRAM_SYMBOL_MISSING'
export const GHS_PICTOGRAM_NOT_RECOGNISED = 'GHS_PICTOGRAM_NOT_RECOGNISED'
export const GHS_PICTOGRAM_COMPLETE = 'GHS_PICTOGRAM_COMPLETE'

const US: Citation = {
  authority: 'OSHA',
  reference: '29 CFR 1910.1200, Appendix C, C.2.3.1',
  title: 'Pictograms — a frame without a hazard symbol is not a pictogram',
}

const EU: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Annex I, 1.2.1.2',
  title: 'Hazard pictograms shall have a black symbol on a white background',
}

const US_SYMBOLS: Citation = {
  authority: 'OSHA',
  reference: '29 CFR 1910.1200, Appendix C, C.2.3.2',
  title: 'One of eight standard hazard symbols shall be used in each pictogram',
}

const EU_SYMBOLS: Citation = {
  authority: 'EU',
  reference: 'Regulation (EC) No 1272/2008 (CLP), Annex V',
  title: 'Hazard pictograms',
}

export const ghsPictogramIntegrityRule: GhsChemicalRule = {
  id: 'ghs/pictogram-integrity',
  title: 'Every pictogram carries a hazard symbol the regime recognizes.',
  citation: US,
  citations: [US, EU, US_SYMBOLS, EU_SYMBOLS],
  codes: {
    [GHS_PICTOGRAM_SYMBOL_MISSING]: ['blocking', 'violation'],
    [GHS_PICTOGRAM_NOT_RECOGNISED]: ['violation'],
    [GHS_PICTOGRAM_COMPLETE]: ['pass'],
  },
  appliesTo: 'ghs-chemical',

  check({ data, layout, subject }: GhsChemicalContext): Finding[] {
    const isUs = data.regime === 'us-osha'
    const findings: Finding[] = []

    for (const pictogram of layout.pictograms) {
      const code = pictogram.code as GhsPictogramCode

      if (!isPictogramRecognised(data.regime, code)) {
        findings.push(
          finding(ghsPictogramIntegrityRule, {
            code: GHS_PICTOGRAM_NOT_RECOGNISED,
            severity: 'violation',
            message:
              `${code} (${pictogram.symbolName}) is not one of the ${isUs ? 'eight' : 'nine'} ` +
              `hazard symbols this regime recognizes.`,
            elementId: pictogram.elementId,
            citation: isUs ? US_SYMBOLS : EU_SYMBOLS,
          }),
        )
        continue
      }

      if (!pictogram.glyphDrawn) {
        // Nothing to say about a frame whose symbol is on a label this engine cannot
        // see — and in particular no pass. `declines` says why.
        if (subject === 'described') continue
        findings.push(
          finding(ghsPictogramIntegrityRule, {
            code: GHS_PICTOGRAM_SYMBOL_MISSING,
            // OSHA states the prohibition outright; CLP requires the symbol but
            // does not say in terms that a bare frame is forbidden.
            severity: isUs ? 'blocking' : 'violation',
            message:
              `The ${code} pictogram is drawn as a frame with no hazard symbol inside it. ` +
              (isUs
                ? 'A square red frame set at a point without a hazard symbol is not a pictogram ' +
                  'and is not permitted on the label.'
                : 'A hazard pictogram must carry a black symbol on a white background.'),
            elementId: pictogram.elementId,
            citation: isUs ? US : EU,
          }),
        )
        continue
      }

      findings.push(
        // C.2.3.1: a pictogram "shall include a black hazard symbol" — ink, so the artwork.
        passedOnArtwork(
          ghsPictogramIntegrityRule,
          GHS_PICTOGRAM_COMPLETE,
          `The ${code} pictogram carries its ${pictogram.symbolName} symbol.`,
          pictogram.elementId,
          isUs ? US : EU,
        ),
      )
    }

    return findings
  },

  declines({ data, layout, subject }: GhsChemicalContext): Decline | undefined {
    if (subject !== 'described') return undefined
    const unseen = layout.pictograms.filter(
      (pictogram) =>
        !pictogram.glyphDrawn &&
        isPictogramRecognised(data.regime, pictogram.code as GhsPictogramCode),
    )
    if (unseen.length === 0) return undefined
    // A rule that judged has not stood down — `declinesOf` drops this when `check`
    // reported an unrecognised pictogram. The omission on each frame still says the
    // symbol went unchecked.
    return {
      reason:
        'Packwright draws no pictogram artwork and cannot see the symbols on your label, so it ' +
        'gives no verdict on whether each pictogram carries its hazard symbol. That is a limit ' +
        'of this tool, not a fault found in your label.' +
        // OSHA sets no minimum size, so on a US label no size check runs to mention.
        (data.regime === 'eu-clp'
          ? ' A pictogram whose stated size is smaller than CLP’s minimum is still reported.'
          : ''),
      citation: data.regime === 'us-osha' ? US : EU,
      wants: [],
      limit: true,
    }
  },
}
