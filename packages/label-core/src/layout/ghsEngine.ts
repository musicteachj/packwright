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
import { hazardStatementText, precautionaryStatementText } from '../ghs/statements'
import { wrapTextMm } from '../text/measure'
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

  function pushText(
    elementId: string,
    label: string,
    text: string,
    fontSizeMm: number,
    bold = false,
  ): void {
    const boxHeightMm = fontSizeMm * type.lineHeight
    elements.push({
      elementId,
      label,
      box: { xMm: panel.xMm, yMm: cursorYMm, widthMm: panel.widthMm, heightMm: boxHeightMm },
    })
    primitives.push({
      kind: 'text',
      elementId,
      xMm: panel.xMm,
      // The baseline sits at the lower edge of the reserved band, so glyphs grow
      // upward into space set aside for them rather than into the block above.
      baselineYMm: cursorYMm + fontSizeMm,
      text,
      fontSizeMm,
      fontFamily: type.fontFamily,
      ...(bold ? { fontWeight: type.emphasisFontWeight } : {}),
      fill: '000000',
      anchor: 'start',
    })
    cursorYMm += boxHeightMm + type.blockGapMm
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
  const pictogramCodes = data.pictograms ?? requiredPictograms(data.hazards ?? [])

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
        elementId,
        scope: 'detail',
        reason:
          `The statement ${code} is not drawn: no verified text for it exists under this ` +
          'label’s regime. Printing another regime’s wording would produce a label that looks ' +
          'complete and is not.',
      })
      return []
    })
    if (statements.length === 0) continue
    statements.forEach((statement) => {
      for (const line of wrapTextMm(statement, panel.widthMm, type.statementMm, type.fontFamily)) {
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
    cursorYMm += type.blockGapMm
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
