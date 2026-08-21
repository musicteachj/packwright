/**
 * Writes the print-test sheet to a file.
 *
 * Run with `npm run print-test --workspace @packwright/api`. Deliberately a
 * script rather than a route: it is a one-off verification artefact, not
 * something the product serves.
 */

import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildPrintTestSheet, PRINT_TEST_EXPECTED_GTIN } from './printTestSheet'
import { renderLayoutToPdf } from './renderPdf'

const output = resolve(process.argv[2] ?? 'print-test-sheet.pdf')
const pdf = await renderLayoutToPdf(buildPrintTestSheet())
await writeFile(output, pdf)

console.log(`Wrote ${output} (${(pdf.length / 1024).toFixed(1)} kB)`)
console.log(`Every symbol should decode to ${PRINT_TEST_EXPECTED_GTIN}.`)
console.log('Print at 100% — no "fit to page" — then scan each one.')
console.log('The control at the bottom SHOULD FAIL. If it scans, the test proved nothing.')
