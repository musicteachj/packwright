/**
 * What each case looks like to the engine and to the model.
 *
 * The printed text is read off the engine's own layout rather than written by
 * hand, so the model is shown exactly what Packwright would print, and a hand
 * paraphrase cannot add a fact the document does not hold or drop one it does.
 * Lines are grouped by baseline and read top to bottom, left to right — the
 * order a person transcribing the label would read it in.
 */

import {
  buildDigitalLinkUri,
  judgeLabel,
  type Judgement,
  type ResolvedLayout,
} from '@packwright/label-core'
import * as bwip from 'bwip-js/generic'
import type { CaseLabel, ExperimentCase } from './cases'

/**
 * The case judged by the judge the editor and the MCP server share.
 *
 * One call instead of this file's own switch from label type to layout function and
 * a cast to the rules' context. A case the judge refuses is a broken case, not a
 * result, so it throws. What `run.cli.ts` records from it is unchanged — the
 * findings, as `engine.json` has held them since 2026-10-09 — and the full
 * judgement, declined checks included, is stage 19's to record in its new record.
 */
export function judgeCase(item: ExperimentCase): Judgement {
  const { label } = item
  const judged = judgeLabel(label.labelType === 'gs1-retail' ? { ...label, barcode: bwip } : label)
  if (judged.outcome === 'refused') throw new Error(`${item.id}: refused — ${judged.reason}`)
  return judged
}

/** Baselines closer than this are one printed line. */
const SAME_LINE_MM = 0.5

/** The printed text, as lines, top to bottom and left to right. */
export function printedLines(layout: ResolvedLayout): string[] {
  const texts = layout.primitives.flatMap((primitive) =>
    primitive.kind === 'text' && primitive.text.trim() !== ''
      ? [{ x: primitive.xMm, y: primitive.baselineYMm, text: primitive.text.trim() }]
      : [],
  )
  texts.sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: { y: number; parts: { x: number; text: string }[] }[] = []
  for (const text of texts) {
    const line = lines.at(-1)
    if (line !== undefined && Math.abs(line.y - text.y) < SAME_LINE_MM) line.parts.push(text)
    else lines.push({ y: text.y, parts: [text] })
  }
  return lines.map((line) =>
    line.parts
      .sort((a, b) => a.x - b.x)
      .map((part) => part.text)
      .join('   '),
  )
}

/**
 * What is printed that is not text: pictograms and barcodes.
 *
 * A pictogram is named by its code and symbol, as a designer would describe the
 * artwork they placed. A barcode is described by what it encodes; the digits
 * printed beneath a UPC-A are text and already appear among the lines.
 */
export function printedGraphics(layout: ResolvedLayout): string[] {
  const pictograms = layout.pictograms.map(
    (pictogram) =>
      `Hazard pictogram ${pictogram.code} (${pictogram.symbolName}), ${round(pictogram.drawnSideMm)} mm square.`,
  )
  const symbols = layout.symbols.map(
    (symbol) => `A ${symbol.symbology} barcode encoding: ${symbol.value}`,
  )
  return [...pictograms, ...symbols]
}

const round = (mm: number): string => String(Math.round(mm * 10) / 10)

/**
 * A barcode label, described from the document rather than from the layout.
 *
 * The layout cannot serve here, for two reasons the engine gives itself. It
 * refuses to draw a UPC-A whose check digit is wrong, so case 06 would arrive
 * with nothing printed on it at all. And it draws no carrier for a Digital Link
 * — the rule says so: "this engine prints no carrier for it" — so the URI case 07
 * turns on would never be shown. The digits are grouped as a UPC-A prints them,
 * 1-5-5-1, and the URI is built by the same `buildDigitalLinkUri` the rule calls.
 */
function describeBarcodes(label: Extract<CaseLabel, { labelType: 'gs1-retail' }>): string[] {
  const { gtin, digitalLink } = label.data
  const grouped = [gtin.slice(0, 1), gtin.slice(1, 6), gtin.slice(6, 11), gtin.slice(11)].join(' ')
  const lines = [`- A UPC-A barcode, with the digits printed beneath it: ${grouped}`]
  if (digitalLink !== undefined) {
    // The same elements the rule builds from, in the same places: lot and
    // serial qualify the GTIN, the expiry is an attribute.
    const { lot, serial, expiry } = digitalLink
    const uri = buildDigitalLinkUri({
      domain: digitalLink.domain,
      primary: { ai: '01', value: gtin },
      qualifiers: [
        ...(lot === undefined ? [] : [{ ai: '10', value: lot }]),
        ...(serial === undefined ? [] : [{ ai: '21', value: serial }]),
      ],
      attributes: expiry === undefined ? [] : [{ ai: '17', value: expiry }],
      ...(digitalLink.useConvenienceAlphas === undefined
        ? {}
        : { useConvenienceAlphas: digitalLink.useConvenienceAlphas }),
    })
    lines.push(`- A QR code beside it, encoding: ${uri}`)
  }
  return lines
}

export function promptFor(item: ExperimentCase, layout: ResolvedLayout): string {
  const graphics = printedGraphics(layout)
  const printed =
    item.label.labelType === 'gs1-retail'
      ? ['Printed on it:', ...describeBarcodes(item.label)]
      : [
          'Printed text, top to bottom:',
          ...printedLines(layout).map((line) => `  ${line}`),
          ...(graphics.length > 0 ? ['', 'Graphics:', ...graphics.map((g) => `- ${g}`)] : []),
        ]
  return [
    `I'm preparing this label for sale in ${item.market}. Here is everything printed on it.`,
    '',
    'About the product and package:',
    ...item.facts.map((fact) => `- ${fact}`),
    '',
    ...printed,
    '',
    'Is anything missing or non-compliant? For each problem, tell me which regulation or standard requires it.',
  ].join('\n')
}
