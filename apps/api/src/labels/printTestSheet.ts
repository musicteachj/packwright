/**
 * The print-test sheet — the one check the automated suite cannot make.
 *
 * Every test in this repository proves the geometry is internally consistent:
 * the layout computes what the specification says, and the PDF carries those
 * millimetres faithfully. None of them proves a printed symbol scans. Ink
 * spreads, printers scale, and a symbol can be dimensionally perfect and still
 * fail at a till.
 *
 * So this produces one page carrying the same GTIN at three magnifications plus
 * a deliberately sabotaged control. The control is the point. If every symbol
 * scans including the one whose quiet zone is obstructed, the phone is being
 * generous and the test proved nothing. If only the control fails, the spine is
 * correct — and that is a result worth having before building anything on it.
 */

import {
  EAN_UPC_NOMINAL_X_DIMENSION_MM,
  layOutSymbol,
  magnificationToXDimensionMm,
  measureClearSpace,
  upcAHriFor,
  type LayoutPrimitive,
  type PlacedSymbol,
  type ResolvedElement,
  type ResolvedLayout,
  type ResolvedSymbol,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'

/** A4, so it prints on whatever is already in the tray. */
const PAGE = { widthMm: 210, heightMm: 297 }
const MARGIN_MM = 18
const CAPTION_SIZE_MM = 3.2
const BLOCK_GAP_MM = 12

const GTIN_PAYLOAD = '03600029145'
const EXPECTED_GTIN = '036000291452'

interface Block {
  magnification: number
  caption: string
  /** Obstructs the quiet zone, so the symbol should fail to scan. */
  sabotageQuietZone?: boolean
}

const BLOCKS: readonly Block[] = [
  { magnification: 0.8, caption: '0.8x — minimum permitted magnification (X = 0.264 mm)' },
  { magnification: 1, caption: '1.0x — nominal (X = 0.330 mm)' },
  { magnification: 2, caption: '2.0x — maximum permitted magnification (X = 0.660 mm)' },
  {
    magnification: 1,
    caption: 'CONTROL — quiet zone obstructed. This one SHOULD FAIL to scan.',
    sabotageQuietZone: true,
  },
]

function caption(text: string, xMm: number, baselineYMm: number): LayoutPrimitive {
  return {
    kind: 'text',
    xMm,
    baselineYMm,
    text,
    fontSizeMm: CAPTION_SIZE_MM,
    fontFamily: 'IBM Plex Sans',
    fill: '000000',
    anchor: 'start',
  }
}

/**
 * Fills the quiet zone either side of the bars with solid black.
 *
 * A realistic failure rather than a contrived one: reclaiming the quiet zone for
 * artwork is the single most common way a real label stops scanning, precisely
 * because the space looks empty and therefore wasted.
 */
function obstructQuietZone(symbol: PlacedSymbol): {
  primitives: LayoutPrimitive[]
  elements: ResolvedElement[]
} {
  const boxes = [
    {
      elementId: 'sabotage-left',
      label: 'Obstruction — left quiet zone',
      box: {
        xMm: symbol.xMm - symbol.requiredQuietZoneLeftMm * 0.8,
        yMm: symbol.yMm,
        widthMm: symbol.requiredQuietZoneLeftMm * 0.8,
        heightMm: symbol.barHeightMm,
      },
    },
    {
      elementId: 'sabotage-right',
      label: 'Obstruction — right quiet zone',
      box: {
        xMm: symbol.xMm + symbol.barPatternWidthMm,
        yMm: symbol.yMm,
        widthMm: symbol.requiredQuietZoneRightMm * 0.8,
        heightMm: symbol.barHeightMm,
      },
    },
  ]

  return {
    elements: boxes,
    // Emitted as elements as well as ink, so the control's measured clear space
    // reports the obstruction rather than the trim edge. The sheet then states
    // in millimetres what it is asking the phone to fail on.
    primitives: boxes.map(({ elementId, box }) => ({
      kind: 'rect' as const,
      ...box,
      fill: '000000',
      elementId,
    })),
  }
}

export function buildPrintTestSheet(): ResolvedLayout {
  const primitives: LayoutPrimitive[] = []
  const elements: ResolvedElement[] = []
  const placed: PlacedSymbol[] = []
  let cursorYMm = MARGIN_MM

  primitives.push(
    caption(`packwright print test — expected GTIN ${EXPECTED_GTIN}`, MARGIN_MM, cursorYMm),
  )
  cursorYMm += CAPTION_SIZE_MM * 2
  primitives.push(
    caption(
      'Print at 100% (no "fit to page"), then scan each symbol with a phone.',
      MARGIN_MM,
      cursorYMm,
    ),
  )
  cursorYMm += BLOCK_GAP_MM

  for (const block of BLOCKS) {
    primitives.push(caption(block.caption, MARGIN_MM, cursorYMm))
    cursorYMm += CAPTION_SIZE_MM + 3

    const laidOut = layOutSymbol(bwip as never, {
      symbology: 'UPC-A',
      payload: GTIN_PAYLOAD,
      xDimensionMm: magnificationToXDimensionMm(block.magnification),
      xMm: MARGIN_MM,
      yMm: cursorYMm,
      elementId: `symbol-${block.magnification}x${block.sabotageQuietZone ? '-control' : ''}`,
      hri: upcAHriFor(block.magnification),
    })

    primitives.push(...laidOut.primitives)
    elements.push(laidOut.element)
    if (block.sabotageQuietZone) {
      const obstruction = obstructQuietZone(laidOut.symbol)
      primitives.push(...obstruction.primitives)
      elements.push(...obstruction.elements)
    }
    placed.push(laidOut.symbol)

    cursorYMm += laidOut.footprintHeightMm + BLOCK_GAP_MM
  }

  if (cursorYMm > PAGE.heightMm - MARGIN_MM) {
    throw new Error(
      `The print test sheet runs ${cursorYMm.toFixed(1)} mm tall, past the ` +
        `${(PAGE.heightMm - MARGIN_MM).toFixed(1)} mm A4 margin.`,
    )
  }

  // Measured once every element on the sheet is known — clear space is a
  // property of a symbol and its surroundings, so it cannot be settled while
  // the surroundings are still being placed.
  const symbols: ResolvedSymbol[] = placed.map((symbol) => ({
    ...symbol,
    ...measureClearSpace({ symbol, elements, labelWidthMm: PAGE.widthMm }),
    // Every block is placed inside the page margins by construction, and the
    // height guard above fails the build if the sheet outgrows A4.
    verticalOverflowMm: 0,
  }))

  return {
    widthMm: PAGE.widthMm,
    heightMm: PAGE.heightMm,
    primitives,
    elements,
    symbols,
    // The print-test sheet is barcodes only; it carries no hazard pictograms.
    pictograms: [],
    omissions: [],
  }
}

export const PRINT_TEST_EXPECTED_GTIN = EXPECTED_GTIN
export const PRINT_TEST_NOMINAL_X_MM = EAN_UPC_NOMINAL_X_DIMENSION_MM
