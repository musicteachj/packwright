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
import { requiredPictograms } from '../ghs/classification'
import { applyPrecedence } from '../ghs/precedence'
import { hazardStatementText, precautionaryStatementText } from '../ghs/statements'
import { roundTo } from '../geometry/units'
import { measureTextMm, measuredFamilyFor, wrapTextMm } from '../text/measure'
import { dimensionBandFor, pictogramAreaSqMm } from '../ghs/labelDimensions'
import type { GhsLabelData } from '../templates/ghs'
import { GHS_ELEMENTS, GHS_TYPE_DEFAULT } from '../templates/ghs'
import type { LabelStock } from '../templates/stock'
import { panelFor } from '../templates/stock'
import { LayoutError } from './engine'
import type {
  LayoutOmission,
  LayoutPrimitive,
  ResolvedElement,
  ResolvedLayout,
  ResolvedPictogram,
} from './types'

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

export function layOutGhsLabel(request: GhsLayoutRequest): ResolvedLayout {
  const { data, stock } = request

  assertFinitePositive(stock.widthMm, 'Stock width')
  assertFinitePositive(stock.heightMm, 'Stock height')
  if (!Number.isFinite(stock.marginMm) || stock.marginMm < 0) {
    throw new LayoutError(
      `Stock margin must be a finite, non-negative number, received ${stock.marginMm}.`,
    )
  }
  // Capacity selects the band every dimensional rule is measured against, so a
  // nonsensical one produces a requirement rather than a drawing failure — and
  // silently defaulting it would fabricate a requirement the user never stated.
  assertFinitePositive(data.capacityL, 'Package capacity in litres')
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
  ): boolean {
    if (topMm >= stock.heightMm) {
      omissions.push({
        elementId,
        reason:
          `${label} begins ${mmText(topMm)} down a ${mmText(stock.heightMm)} label, past its ` +
          'bottom edge, so none of it is printed.',
        scope: 'element',
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
  ): void {
    if (leftMm >= stock.widthMm) {
      omissions.push({
        elementId,
        reason:
          `${label} begins ${mmText(leftMm)} across a ${mmText(stock.widthMm)} label, past its ` +
          'right edge, so none of it is printed.',
        scope: 'element',
      })
    } else if (rightMm > stock.widthMm) {
      omissions.push({
        elementId,
        reason:
          `${label} runs ${mmText(rightMm - stock.widthMm)} past the right edge of a ` +
          `${mmText(stock.widthMm)} label, so part of it is not printed.`,
        scope: 'detail',
      })
    }
  }

  // Measured in the face each line prints in — the signal word is drawn at weight
  // 600, and in Regular widths it reads narrow enough to escape the check. A review
  // caught exactly that; see `measuredFamilyFor`.
  const widestLineMm = (lines: readonly string[], fontSizeMm: number, bold = false): number => {
    const family = measuredFamilyFor(type.fontFamily, bold ? type.emphasisFontWeight : undefined)
    return Math.max(0, ...lines.map((line) => measureTextMm(line, fontSizeMm, family)))
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
    if (!recordOverrun(elementId, label, startYMm, startYMm + boxHeightMm)) {
      recordRightOverrun(
        elementId,
        label,
        panel.xMm,
        panel.xMm + widestLineMm(lines, fontSizeMm, bold),
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
  const pictogramCodes =
    data.pictograms ??
    applyPrecedence(requiredPictograms(data.hazards ?? []), data.hazards ?? [], data.regime)

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
        elementId,
        scope: 'detail',
        reason:
          `The ${code} symbol (${symbolName}) is not drawn. CLP Annex V requires each ` +
          'pictogram to conform to the specimen artwork published with the standard, and no ' +
          'verified vector of that specimen was available. The frame is drawn to its resolved ' +
          'size; an approximation of the symbol would look compliant without being so.',
      })

      // Recorded after the glyph, which every pictogram carries. A strip is one
      // row, so it can run off the right as well as the bottom — a label with more
      // pictograms than its width holds draws the last of them past the edge.
      const pictogramLabel = `The ${code} pictogram`
      if (!recordOverrun(elementId, pictogramLabel, cursorYMm, cursorYMm + boxMm)) {
        recordRightOverrun(elementId, pictogramLabel, xMm, xMm + boxMm)
      }
    })

    cursorYMm += boxMm + type.blockGapMm
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
      omissions.push({
        // Suffixed with the code: several statements can be omitted from one
        // block, and each omission should say which statement it is.
        elementId: `${elementId}-${code}`,
        scope: 'detail',
        reason:
          `The statement ${code} is not drawn: no verified text for it exists under this ` +
          'label’s regime. Printing another regime’s wording would produce a label that looks ' +
          'complete and is not.',
      })
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
    if (!recordOverrun(elementId, label, startYMm, cursorYMm)) {
      recordRightOverrun(elementId, label, panel.xMm, panel.xMm + widestMm)
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
