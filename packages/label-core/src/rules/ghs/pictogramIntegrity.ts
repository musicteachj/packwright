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
 * CLP reaches the same place by a different route — Annex I 1.2.1.2 requires a
 * black symbol on a white background — but does not spell out that a frame alone
 * is forbidden. The severity differs accordingly: blocking where the text is
 * explicit, violation where it is implied.
 */

import { isPictogramRecognised, type GhsPictogramCode } from '../../ghs/pictograms'
import type { Citation, Finding } from '../../types/index'
import { finding, passed } from '../finding'
import type { GhsChemicalContext, GhsChemicalRule } from '../types'

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
  title: 'Every pictogram carries a hazard symbol the regime recognises.',
  citation: US,
  citations: [US, EU, US_SYMBOLS, EU_SYMBOLS],
  codes: [GHS_PICTOGRAM_SYMBOL_MISSING, GHS_PICTOGRAM_NOT_RECOGNISED, GHS_PICTOGRAM_COMPLETE],
  appliesTo: 'ghs-chemical',

  check({ data, layout }: GhsChemicalContext): Finding[] {
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
              `hazard symbols this regime recognises.`,
            elementId: pictogram.elementId,
            citation: isUs ? US_SYMBOLS : EU_SYMBOLS,
          }),
        )
        continue
      }

      if (!pictogram.glyphDrawn) {
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
        passed(
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
}
