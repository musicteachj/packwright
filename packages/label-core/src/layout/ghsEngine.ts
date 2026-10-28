/**
 * Resolves a GHS chemical label to millimetre geometry.
 *
 * The sibling of `layOutUpcALabel`, and deliberately not a branch inside it.
 * They share the anchor kernel in `templates/stock` and the `ResolvedLayout`
 * they produce, and nothing else: this one takes no barcode encoder, because a
 * GHS label has no symbol to encode.
 *
 * **It resolves; it does not refuse.** The same lesson phase 3 forced on the
 * UPC-A engine applies here before a single GHS rule exists. A label whose
 * pictograms are below the CLP minimum, or whose stock is smaller than Table 1.3
 * demands, is drawn exactly as asked — because a label that cannot be resolved
 * cannot be measured, and a rule with nothing to run against can never fail.
 * `LayoutError` is reserved for input that describes no drawing at all.
 *
 * **The glyphs are omitted, and that is a decision.** Every pictogram frame is
 * drawn to its resolved size; the symbol inside it is not, because no verified
 * vector artwork for the Annex V specimens could be obtained. Each one records a
 * `LayoutOmission` saying so. Drawing an approximate flame would produce a label
 * that looks compliant and is not, which is the failure this project exists to
 * prevent — see `ghs/pictograms.ts`.
 */

import {
  GHS_PICTOGRAM_STYLE_DEFAULT,
  GHS_PICTOGRAM_SYMBOLS,
  pictogramFrameCommands,
} from '../ghs/pictograms'
import { derivedPictograms } from '../ghs/precedence'
import { hazardStatementText, precautionaryStatementText } from '../ghs/statements'
import { roundTo } from '../geometry/units'
import { measureTextMm, measuredFamilyFor, wrapTextMm } from '../text/measure'
import { dimensionBandFor, pictogramAreaSqMm } from '../ghs/labelDimensions'
import type { GhsLabelData } from '../templates/ghs'
import { GHS_ELEMENTS, GHS_TYPE_DEFAULT } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'
import { panelFor } from '../templates/stock'
import { LayoutError, assertMarginLeavesPanel } from './engine'
import type {
  LayoutOmission,
  LayoutPrimitive,
  ResolvedElement,
  ResolvedLayout,
  ResolvedPictogram,
} from './types'
import { explainedOmission } from './omissions'

export interface GhsLayoutRequest {
  data: GhsLabelData
  stock: LabelStock
}

const mmText = (value: number): string => `${roundTo(value, 2).toFixed(2)} mm`

function assertFinitePositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new LayoutError(`${what} must be a positive finite number, received ${value}.`)
  }
}

/**
 * Why a pictogram's symbol is not drawn, under the regime that governs the label.
 *
 * It said "CLP Annex V requires…" whatever the regime, so a US label was told its
 * pictograms answered to an EU regulation that does not reach it — and once the
 * explanation was shared across pictograms it was the one line of the "cannot be
 * checked" block saying so. Found by `/code-review high` on PR #60; it predates
 * that PR, which only made the sentence shared.
 *
 * The OSHA half is quoted from 29 CFR 1910.1200 Appendix C.2.3.2, read from the
 * eCFR on 2026-10-07: "One of eight standard hazard symbols shall be used in each
 * pictogram. The eight hazard symbols are depicted in Figure C.1." The CLP half
 * is unchanged from what this engine already said. Neither says anything about
 * what an empty frame is under the regime — C.2.3.1 forbids one on a US label —
 * because that is a verdict, and an omission is a fact; judging it is
 * `rules/`'s business.
 *
 * Exported so a test can recognise the missing-glyph omission by exact equality
 * with its explanation. Two helpers found it by searching `reason` for "Annex
 * V", which stopped matching the day the US wording became correct.
 */
export const SYMBOL_NOT_DRAWN_BECAUSE: Readonly<Record<GhsLabelData['regime'], string>> = {
  'eu-clp':
    'CLP Annex V requires each pictogram to conform to the specimen artwork published with the ' +
    'standard, and no verified vector of the specimen artwork was available. Frames are drawn to ' +
    'their resolved size; an approximation of a symbol would look compliant without being so.',
  'us-osha':
    '29 CFR 1910.1200 Appendix C.2.3.2 requires each pictogram to use one of the eight standard ' +
    'hazard symbols depicted in its Figure C.1, and no verified vector of that artwork was ' +
    'available. Frames are drawn to their resolved size; an approximation of a symbol would look ' +
    'compliant without being so.',
}

/**
 * The shared half of every overrun's second wording — see `LayoutOmission.whenDescribed`.
 *
 * A GHS document carries no type sizes, so every block is set at `GHS_TYPE_DEFAULT`
 * and everything below the first block sits where those sizes put it. An overrun is
 * then a fact about this engine's layout, and on a label printed elsewhere it says
 * nothing about whether that label's text fits. The words say whose layout it was.
 *
 * Exported so a test can find these omissions by exact equality, as
 * `SYMBOL_NOT_DRAWN_BECAUSE` is.
 */
export const LAID_OUT_AT_DEFAULT_TYPE_SIZES =
  'The label’s type sizes were not given, so Packwright set its text at its own default ' +
  'sizes. This is a fact about that layout, not about your label: whether your label prints ' +
  'all of it is not checked.'

/**
 * The second wording of a missing pictogram symbol, on a label printed elsewhere.
 *
 * `SYMBOL_NOT_DRAWN_BECAUSE` explains why this engine's frame is empty, which is
 * true of its drawing and of nothing a user printed. Exported for the same reason.
 */
export const SYMBOL_NOT_SEEN_BECAUSE: Readonly<Record<GhsLabelData['regime'], string>> = {
  // Said per regime because the second sentence is true only under CLP: OSHA sets no
  // minimum pictogram size, so `ghs/pictogram-size` does not run on a US label, and
  // telling a US user a size check still ran would read its silence as a clearance.
  // Found by review.
  'eu-clp':
    'Packwright draws no pictogram artwork and cannot see the symbol printed on the label, so ' +
    'it gives no verdict on it. Where a pictogram’s size is stated, one smaller than CLP’s ' +
    'minimum is still reported.',
  'us-osha':
    'Packwright draws no pictogram artwork and cannot see the symbol printed on the label, so ' +
    'it gives no verdict on it.',
}

/** A second wording in two halves, the second shared — built as `explainedOmission` builds the first. */
function shared(what: string, why: string): NonNullable<LayoutOmission['whenDescribed']> {
  return { reason: `${what} ${why}`, explanation: { what, why } }
}

/**
 * The same for a pictogram that runs off the label.
 *
 * Where a pictogram sits is this engine's choice twice over: the text above it is
 * at the default type sizes, and every pictogram goes in one row with the default
 * gap between them. A label printed elsewhere may set four pictograms in a square,
 * so running off the edge of this engine's row says nothing about that label.
 */
export const LAID_OUT_IN_PACKWRIGHTS_ARRANGEMENT =
  'The label’s arrangement was not given, so Packwright set its text at its own default ' +
  'sizes and its pictograms in one row. This is a fact about that layout, not about your ' +
  'label: whether your label fits them is not checked.'

/**
 * Which of this engine's own choices put an element past the edge — or, for a
 * pictogram whose own box is larger than the label, the one fact that is true of
 * any label the document could describe: it does not fit, however it is arranged.
 * Where the engine's row put it is still the engine's choice, so even then the
 * sentence is about the size and not about where the drawing ran out. Found by
 * review, twice.
 */
type OverrunCause = 'type sizes' | 'arrangement' | { readonly tooLarge: string }

const OVERRUN_BECAUSE: Readonly<
  Record<Extract<OverrunCause, string>, { lead: string; why: string }>
> = {
  'type sizes': {
    lead: 'At Packwright’s default type sizes',
    why: LAID_OUT_AT_DEFAULT_TYPE_SIZES,
  },
  arrangement: { lead: 'In Packwright’s arrangement', why: LAID_OUT_IN_PACKWRIGHTS_ARRANGEMENT },
}

/** The second wording, or nothing where the overrun is not this engine's doing. */
function whenDescribedFor(
  cause: OverrunCause | undefined,
  label: string,
  wouldHappen: string,
): Pick<LayoutOmission, 'whenDescribed'> {
  if (cause === undefined) return {}
  if (typeof cause === 'object') return { whenDescribed: { reason: cause.tooLarge } }
  const { lead, why } = OVERRUN_BECAUSE[cause]
  return { whenDescribed: shared(`${lead}, ${inSentence(label)} would ${wouldHappen}.`, why) }
}

/** "Precautionary statements" → "precautionary statements"; "The GHS02 pictogram" → "the GHS02 pictogram". */
function inSentence(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1)
}

export function layOutGhsLabel(request: GhsLayoutRequest): ResolvedLayout {
  const { data, stock } = request

  assertFinitePositive(stock.widthMm, 'Stock width')
  assertFinitePositive(stock.heightMm, 'Stock height')
  assertMarginLeavesPanel(stock)
  // Capacity selects the band every dimensional rule is measured against, so a
  // nonsensical one produces a requirement rather than a drawing failure — and
  // silently defaulting it would fabricate a requirement the user never stated.
  assertFinitePositive(data.capacityL, 'Package capacity in liters')
  if (data.pictogramSideMm !== undefined) {
    assertFinitePositive(data.pictogramSideMm, 'Pictogram side')
  }

  const panel = panelFor(stock)
  const band = dimensionBandFor(data.capacityL)
  const sideMm = data.pictogramSideMm ?? band.pictogramSideMm

  const primitives: LayoutPrimitive[] = []
  const elements: ResolvedElement[] = []
  const omissions: LayoutOmission[] = []
  const pictograms: ResolvedPictogram[] = []

  const type = GHS_TYPE_DEFAULT
  // Once the pictogram row is drawn, everything below sits where that row put it as
  // well as where the default type sizes did — so its bottom-edge overrun is blamed on
  // the arrangement, whose explanation names both. Found by `/code-review high` on #86.
  let belowThePictogramRow = false
  const bottomCause = (): OverrunCause => (belowThePictogramRow ? 'arrangement' : 'type sizes')
  // A simple top-to-bottom stack. Nothing is clamped: a block that runs past the
  // panel is drawn hanging off it, because nudging it back would hide the defect.
  let cursorYMm = panel.yMm

  /**
   * Says so when a block is drawn past the bottom of the stock.
   *
   * **Drawing it off the label was deliberate; saying nothing was not.** This
   * engine recorded no omission for a block below the edge, so a signal word on a
   * baseline 13.4 mm down a 6 mm label was cleared by `GHS_SIGNAL_WORD_SINGLE`,
   * and a 50 ml container's manufacturer and outer-package statement, both wholly
   * below a 25 mm label, were counted as carried. The same check `usFoodEngine`
   * makes for every stacked block, and in the same two scopes: a block that begins
   * past the edge is absent, and one that runs past it has lost a detail.
   */
  function recordOverrun(
    elementId: string,
    label: string,
    topMm: number,
    bottomMm: number,
    cause: OverrunCause | undefined,
  ): boolean {
    if (topMm >= stock.heightMm) {
      omissions.push({
        elementId,
        reason:
          `${label} begins ${mmText(topMm)} down a ${mmText(stock.heightMm)} label, past its ` +
          'bottom edge, so none of it is printed.',
        scope: 'element',
        ...whenDescribedFor(
          cause,
          label,
          `begin ${mmText(topMm)} down a ${mmText(stock.heightMm)} label, past its bottom edge`,
        ),
      })
      // Absent, so there is nothing across to measure. Checking the right edge as
      // well gave one element "none of it is printed" beside "part of it is not".
      return true
    }
    if (bottomMm > stock.heightMm) {
      omissions.push({
        elementId,
        reason:
          `${label} runs ${mmText(bottomMm - stock.heightMm)} past the bottom of a ` +
          `${mmText(stock.heightMm)} label, so part of it is not printed.`,
        scope: 'detail',
        ...whenDescribedFor(
          cause,
          label,
          `run ${mmText(bottomMm - stock.heightMm)} past the bottom of a ` +
            `${mmText(stock.heightMm)} label`,
        ),
      })
    }
    return false
  }

  /**
   * The same, across. A pictogram strip is one row and runs off the right of a
   * label narrower than it; a text block wraps, but the wrapper never breaks
   * inside a word, so one wider than the panel does too. A review of the bottom-edge
   * check found the second: a 40-letter chemical name printed past the edge of a
   * 30 mm label with nothing recorded, and the small-container rule would have
   * counted the product identifier as carried.
   */
  function recordRightOverrun(
    elementId: string,
    label: string,
    leftMm: number,
    rightMm: number,
    cause: OverrunCause | undefined,
  ): void {
    if (leftMm >= stock.widthMm) {
      omissions.push({
        elementId,
        reason:
          `${label} begins ${mmText(leftMm)} across a ${mmText(stock.widthMm)} label, past its ` +
          'right edge, so none of it is printed.',
        scope: 'element',
        ...whenDescribedFor(
          cause,
          label,
          `begin ${mmText(leftMm)} across a ${mmText(stock.widthMm)} label, past its right edge`,
        ),
      })
    } else if (rightMm > stock.widthMm) {
      omissions.push({
        elementId,
        reason:
          `${label} runs ${mmText(rightMm - stock.widthMm)} past the right edge of a ` +
          `${mmText(stock.widthMm)} label, so part of it is not printed.`,
        scope: 'detail',
        ...whenDescribedFor(
          cause,
          label,
          `run ${mmText(rightMm - stock.widthMm)} past the right edge of a ` +
            `${mmText(stock.widthMm)} label`,
        ),
      })
    }
  }

  // Measured in the face each line prints in — the signal word is drawn at weight
  // 600, and in Regular widths it reads narrow enough to escape the check. A review
  // caught exactly that; see `measuredFamilyFor`.
  const widestLineMm = (lines: readonly string[], fontSizeMm: number, bold = false): number => {
    const family = measuredFamilyFor(type.fontFamily, bold ? type.emphasisFontWeight : undefined)
    // A fold, not a spread, which fails past about 122,000 lines (`usFoodEngine.ts`).
    return lines.reduce(
      (widest, line) => Math.max(widest, measureTextMm(line, fontSizeMm, family)),
      0,
    )
  }

  function pushText(
    elementId: string,
    label: string,
    text: string,
    fontSizeMm: number,
    bold = false,
  ): void {
    // Every block wraps, not only the statements. A product identifier is
    // mandatory under CLP Article 18 and an ordinary chemical name sets wider
    // than a 74 mm label, so leaving this unwrapped put a required element off
    // the substrate with nothing recording it.
    const lines = wrapTextMm(text, panel.widthMm, fontSizeMm, type.fontFamily)
    const startYMm = cursorYMm

    lines.forEach((line, index) => {
      primitives.push({
        kind: 'text',
        elementId,
        xMm: panel.xMm,
        // The baseline sits at the lower edge of each reserved band, so glyphs
        // grow upward into space set aside for them rather than into the line
        // above.
        baselineYMm: startYMm + fontSizeMm + index * fontSizeMm * type.lineHeight,
        text: line,
        fontSizeMm,
        fontFamily: type.fontFamily,
        ...(bold ? { fontWeight: type.emphasisFontWeight } : {}),
        fill: '000000',
        anchor: 'start',
      })
    })

    const boxHeightMm = lines.length * fontSizeMm * type.lineHeight
    elements.push({
      elementId,
      label,
      box: { xMm: panel.xMm, yMm: startYMm, widthMm: panel.widthMm, heightMm: boxHeightMm },
    })
    // Every block sits where the blocks above it put it — at the default type sizes,
    // and below the pictogram row once there is one — and is as tall and as wide as its
    // own type size makes it.
    if (!recordOverrun(elementId, label, startYMm, startYMm + boxHeightMm, bottomCause())) {
      recordRightOverrun(
        elementId,
        label,
        panel.xMm,
        panel.xMm + widestLineMm(lines, fontSizeMm, bold),
        'type sizes',
      )
    }
    cursorYMm = startYMm + boxHeightMm + type.blockGapMm
  }

  pushText(
    GHS_ELEMENTS.productIdentifier,
    'Product identifier',
    data.productIdentifier,
    type.productIdentifierMm,
  )

  // Every signal word the document carries is drawn, including both. Drawing
  // only the first would hide the very defect Article 20(3) exists to catch.
  if (data.signalWords?.length) {
    pushText(
      GHS_ELEMENTS.signalWord,
      'Signal word',
      data.signalWords.join(' '),
      type.signalWordMm,
      true,
    )
  }

  // Derived from the classification where one is given, and taken as supplied
  // otherwise. Deriving is the regulation's own direction of travel; an explicit
  // list stays supported so a label can carry a pictogram set that is *wrong*,
  // which is what the precedence rules need to have something to catch.
  const pictogramCodes = data.pictograms ?? derivedPictograms(data.hazards ?? [], data.regime)

  if (pictogramCodes.length) {
    const boxMm = sideMm * Math.SQRT2
    // One formula, used by both the strip's own box and each frame's position.
    // They were two expressions of the same arithmetic, so a change to the
    // spacing could have moved the frames without moving the box that measures
    // them — and `length - 1` was non-negative only because of the guard above.
    const pictogramXMm = (index: number) => panel.xMm + index * (boxMm + type.blockGapMm)
    const stripWidthMm = pictogramXMm(pictogramCodes.length - 1) + boxMm - panel.xMm
    elements.push({
      elementId: GHS_ELEMENTS.pictograms,
      label: 'Hazard pictograms',
      box: {
        xMm: panel.xMm,
        yMm: cursorYMm,
        widthMm: stripWidthMm,
        heightMm: boxMm,
      },
    })

    pictogramCodes.forEach((code, index) => {
      const xMm = pictogramXMm(index)
      const elementId = `${GHS_ELEMENTS.pictograms}-${code}`

      primitives.push({
        kind: 'path',
        elementId,
        commands: pictogramFrameCommands(xMm, cursorYMm, sideMm),
        fill: GHS_PICTOGRAM_STYLE_DEFAULT.background,
        stroke: GHS_PICTOGRAM_STYLE_DEFAULT.frameStroke,
        strokeWidthMm: sideMm * GHS_PICTOGRAM_STYLE_DEFAULT.frameStrokeFraction,
      })

      const symbolName = GHS_PICTOGRAM_SYMBOLS[code]

      // Each pictogram is an element in its own right, not only a member of the
      // strip. A finding points at one by id, and `ResolvedLayout.elements` is
      // where every consumer looks for the box to draw or enumerate — the canvas
      // highlight, the text-equivalent view, the form-section ring. Recording
      // the strip alone meant clicking a pictogram finding set the selection and
      // then silently drew nothing, which is the signature interaction failing
      // quietly on the label type it was extended for.
      elements.push({
        elementId,
        label: `${code} pictogram (${symbolName})`,
        box: { xMm, yMm: cursorYMm, widthMm: boxMm, heightMm: boxMm },
      })

      pictograms.push({
        elementId,
        code,
        symbolName,
        drawnSideMm: sideMm,
        requiredSideMm: band.pictogramSideMm,
        ...(band.pictogramPreferredSideMm === undefined
          ? {}
          : { preferredSideMm: band.pictogramPreferredSideMm }),
        drawnAreaSqMm: pictogramAreaSqMm(sideMm),
        box: { xMm, yMm: cursorYMm, widthMm: boxMm, heightMm: boxMm },
        glyphDrawn: false,
      })

      omissions.push({
        ...explainedOmission({
          elementId,
          scope: 'detail',
          what: `The ${code} symbol (${symbolName}) is not drawn.`,
          // Said once under every pictogram it applies to, so it names none of
          // them: "that specimen" and "the frame" read as one particular symbol
          // when several are listed above it. Found by review.
          why: SYMBOL_NOT_DRAWN_BECAUSE[data.regime],
        }),
        whenDescribed: shared(
          `The ${code} symbol (${symbolName}) is not checked.`,
          SYMBOL_NOT_SEEN_BECAUSE[data.regime],
        ),
      })

      // Recorded after the glyph, which every pictogram carries. A strip is one
      // row, so it can run off the right as well as the bottom — a label with more
      // pictograms than its width holds draws the last of them past the edge.
      const pictogramLabel = `The ${code} pictogram`
      // A pictogram sits where this engine's row and the text above it put it — unless
      // its own box is larger than the label either way, which no arrangement could
      // fit. Decided for the pictogram, not per edge: only one edge is recorded, and a
      // box too wide for the label pushed off the bottom first would otherwise be
      // blamed on the row. Found by review.
      // Against the stock, not the panel inside its margins. "Does not fit" is said as a
      // fact about the user's label, and the margin is often this engine's assumption
      // (`checkedStock`): measured against an assumed margin, a pictogram the real label
      // carries comfortably would be called impossible. The stock is the one bound the
      // request always states. Raised by `/code-review high` on #86 and kept.
      const tooWide = boxMm > stock.widthMm
      const tooTall = boxMm > stock.heightMm
      const cause: OverrunCause =
        tooWide || tooTall
          ? {
              // Where the document gave no side, the side is this engine's default — the
              // band's minimum — and a label printed elsewhere may carry another, so the
              // sentence says whose size it is. Not "the smallest CLP allows": on a US
              // label CLP does not apply. Found by review.
              tooLarge:
                (data.pictogramSideMm === undefined
                  ? `At the size Packwright draws it when none is given, the ${code} ` +
                    `pictogram, set at a point, is ${mmText(boxMm)} across — `
                  : `The ${code} pictogram, set at a point, is ${mmText(boxMm)} across — `) +
                (tooWide && tooTall
                  ? `larger than a ${mmText(stock.widthMm)} by ${mmText(stock.heightMm)} label`
                  : tooWide
                    ? `wider than a ${mmText(stock.widthMm)} label`
                    : `taller than a ${mmText(stock.heightMm)} label`) +
                ', so it does not fit on the label however the label is arranged.',
            }
          : 'arrangement'
      if (!recordOverrun(elementId, pictogramLabel, cursorYMm, cursorYMm + boxMm, cause)) {
        recordRightOverrun(elementId, pictogramLabel, xMm, xMm + boxMm, cause)
      }
    })

    cursorYMm += boxMm + type.blockGapMm
    belowThePictogramRow = true
  }

  for (const [elementId, label, codes, lookup] of [
    [
      GHS_ELEMENTS.hazardStatements,
      'Hazard statements',
      data.hazardStatementCodes,
      hazardStatementText,
    ],
    [
      GHS_ELEMENTS.precautionaryStatements,
      'Precautionary statements',
      data.precautionaryStatementCodes,
      precautionaryStatementText,
    ],
  ] as const) {
    if (!codes?.length) continue
    const startYMm = cursorYMm
    // Resolved before drawing, so a code with no verified text for this regime
    // becomes a recorded omission rather than a blank line on the label.
    const statements = codes.flatMap((code) => {
      const text = lookup(data.regime, code)
      if (text !== undefined) return [text]
      omissions.push(
        explainedOmission({
          // Suffixed with the code: several statements can be omitted from one
          // block, and each omission should say which statement it is.
          elementId: `${elementId}-${code}`,
          scope: 'detail',
          what: `The statement ${code} is not drawn.`,
          // Two sentences where there was one with a colon, so the shared half
          // reads as a sentence on its own — and with no "it", because it is said
          // once under several statements and would point at none of them.
          why:
            'No verified wording exists under this label’s regime, and printing another ' +
            'regime’s would produce a label that looks complete and is not.',
        }),
      )
      return []
    })
    if (statements.length === 0) continue
    let widestMm = 0
    statements.forEach((statement) => {
      const lines = wrapTextMm(statement, panel.widthMm, type.statementMm, type.fontFamily)
      widestMm = Math.max(widestMm, widestLineMm(lines, type.statementMm))
      for (const line of lines) {
        primitives.push({
          kind: 'text',
          elementId,
          xMm: panel.xMm,
          baselineYMm: cursorYMm + type.statementMm,
          text: line,
          fontSizeMm: type.statementMm,
          fontFamily: type.fontFamily,
          fill: '000000',
          anchor: 'start',
        })
        cursorYMm += type.statementMm * type.lineHeight
      }
    })
    elements.push({
      elementId,
      label,
      box: {
        xMm: panel.xMm,
        yMm: startYMm,
        widthMm: panel.widthMm,
        heightMm: cursorYMm - startYMm,
      },
    })
    if (!recordOverrun(elementId, label, startYMm, cursorYMm, bottomCause())) {
      recordRightOverrun(elementId, label, panel.xMm, panel.xMm + widestMm, 'type sizes')
    }
    cursorYMm += type.blockGapMm
  }

  if (data.outerPackageStatement) {
    pushText(
      GHS_ELEMENTS.outerPackageStatement,
      'Outer package statement',
      data.outerPackageStatement,
      type.statementMm,
    )
  }

  if (data.supplier) {
    const { name, address, telephone } = data.supplier
    pushText(
      GHS_ELEMENTS.supplier,
      'Supplier identification',
      [name, address, telephone].filter(Boolean).join(' · '),
      type.supplierMm,
    )
  }

  // The label itself is an element, so a finding about its size has a box to
  // outline. Without this the size rule anchored to an id nothing resolved, and
  // clicking it set the selection and drew nothing — the same silent break this
  // engine records having fixed for pictograms.
  elements.unshift({
    elementId: GHS_ELEMENTS.border,
    label: 'Label',
    box: { xMm: 0, yMm: 0, widthMm: stock.widthMm, heightMm: stock.heightMm },
  })

  return {
    widthMm: stock.widthMm,
    heightMm: stock.heightMm,
    primitives,
    elements,
    symbols: [],
    pictograms,
    omissions,
  }
}
