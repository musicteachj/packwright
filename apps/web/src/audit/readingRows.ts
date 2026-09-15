/**
 * A reading, as rows a person can accept, edit or discard.
 *
 * Kept out of the view because it is the part with decisions in it, and a
 * decision inside a template is a decision nothing tests. The view renders what
 * this returns and owns none of it.
 *
 * **Every field is rendered through one text representation.** A string, a list
 * of codes and a supplier block are three shapes, and giving each its own editor
 * would be three parsers, three sets of markup and three places for "what the
 * user typed" to diverge from "what gets confirmed". One text form per field,
 * parsed back by the same table that formatted it, means the round trip is a
 * property that can be tested rather than a coincidence.
 */

import {
  canonicalSignalWord,
  canonicalStatementCode,
  hazardStatementText,
  isPictogramRecognised,
  precautionaryStatementText,
  type GhsLabelData,
  type GhsPictogramCode,
  type GhsRegime,
} from '@packwright/label-core'

export type ReadingKey =
  | 'productIdentifier'
  | 'signalWords'
  | 'pictograms'
  | 'hazardStatementCodes'
  | 'precautionaryStatementCodes'
  | 'supplier'
  | 'outerPackageStatement'

export interface FieldShape {
  readonly label: string
  /** How the field is edited, which is also how it is shown. */
  readonly editor: 'line' | 'list' | 'supplier'
  readonly hint?: string
}

export const FIELD_SHAPES: Readonly<Record<ReadingKey, FieldShape>> = {
  productIdentifier: { label: 'Product identifier', editor: 'line' },
  signalWords: { label: 'Signal words', editor: 'list', hint: 'Separated by commas' },
  pictograms: { label: 'Pictograms', editor: 'list', hint: 'Annex V codes, separated by commas' },
  hazardStatementCodes: {
    label: 'Hazard statements',
    editor: 'list',
    hint: 'Codes only, separated by commas',
  },
  precautionaryStatementCodes: {
    label: 'Precautionary statements',
    editor: 'list',
    hint: 'Codes only, separated by commas',
  },
  supplier: {
    label: 'Supplier',
    editor: 'supplier',
    hint: 'Name, address, telephone — one per line',
  },
  outerPackageStatement: { label: 'Outer package statement', editor: 'line' },
}

export const READING_KEYS = Object.keys(FIELD_SHAPES) as readonly ReadingKey[]

const LIST_KEYS = [
  'signalWords',
  'pictograms',
  'hazardStatementCodes',
  'precautionaryStatementCodes',
] as const satisfies readonly ReadingKey[]

export const isListKey = (key: ReadingKey): boolean =>
  (LIST_KEYS as readonly string[]).includes(key)

/** What a rejected entry in this field is, said in words that fit the field. */
export function unusableReason(key: ReadingKey, regimeName: string): string {
  switch (key) {
    case 'hazardStatementCodes':
    case 'precautionaryStatementCodes':
      return `this build has no verified wording for ${regimeName}`
    case 'pictograms':
      return `not a pictogram code ${regimeName} recognises`
    case 'signalWords':
      return 'not one of the two signal words CLP Article 20 defines'
    default:
      return 'not a value this build can carry'
  }
}

/**
 * Whether an entry in a list field is one a label here can carry.
 *
 * **Every closed set, not only the statement tables.** The first version asked
 * this of the two statement tables and let signal words and pictogram codes
 * through untouched, which was fine for a reading straight from the server —
 * those arrive validated against the same lists — and wrong the moment a field
 * is edited. Typing `GHS99` confirmed it into the document, where
 * `isPictogramRecognised` would have refused it and `GhsRequest` would have
 * refused the whole label.
 *
 * Statement codes are canonicalised first, through `label-core`'s own function,
 * because the server canonicalises before it looks anything up. The two
 * disagreed: a user typing `P337+P313` or `h225` — both of which the server
 * accepts — had it marked unusable here and dropped from the confirmed field
 * without a word.
 */
export function entryIsUsable(key: ReadingKey, regime: GhsRegime, entry: string): boolean {
  switch (key) {
    case 'hazardStatementCodes':
      return hazardStatementText(regime, canonicalStatementCode(entry)) !== undefined
    case 'precautionaryStatementCodes':
      return precautionaryStatementText(regime, canonicalStatementCode(entry)) !== undefined
    case 'pictograms':
      // Regime-aware, which a flat membership test would have missed: OSHA
      // recognises eight of the nine, so GHS09 is a pictogram in the EU and not
      // one on a US label.
      return isPictogramRecognised(regime, entry.trim().toUpperCase() as GhsPictogramCode)
    case 'signalWords':
      // Case-folded, through `label-core`'s own function, because the endpoint
      // folds case too. Matching exactly here meant an edited `DANGER` — which
      // is what labels actually print — was marked unusable under a banner
      // claiming this build had no wording for it.
      return canonicalSignalWord(entry) !== undefined
    default:
      return true
  }
}

/** The spelling a usable entry is stored as, which is the one the engine looks up. */
export function canonicalEntry(key: ReadingKey, entry: string): string {
  if (key === 'hazardStatementCodes' || key === 'precautionaryStatementCodes') {
    return canonicalStatementCode(entry)
  }
  if (key === 'pictograms') return entry.trim().toUpperCase()
  if (key === 'signalWords') return canonicalSignalWord(entry) ?? entry.trim()
  return entry.trim()
}

export function formatValue(key: ReadingKey, value: unknown): string {
  if (key === 'supplier') {
    const supplier = value as GhsLabelData['supplier']
    if (supplier === undefined) return ''
    // The address is flattened onto its own single line. Without that, an
    // address the model read across two lines wrote four lines here, and the
    // parse below read the third as the telephone — so a supplier displayed
    // correctly and confirmed with half its address missing.
    const address = supplier.address.replace(/\s*\n\s*/g, ', ')
    return [supplier.name, address, supplier.telephone ?? ''].join('\n').trimEnd()
  }
  if (Array.isArray(value)) return value.join(', ')
  return typeof value === 'string' ? value : ''
}

/**
 * The text back into a value, or `undefined` when there is nothing left of it.
 *
 * `undefined` rather than an empty string or an empty array, because a field
 * edited down to nothing is a field the user has decided not to declare — and
 * `''` in `productIdentifier` is a product identifier that exists and is blank,
 * which the engine would then draw.
 */
export function parseValue(key: ReadingKey, text: string): unknown {
  if (key === 'supplier') {
    // First line the name, last line the telephone when there are three or
    // more, everything between them the address. Positional indexing read the
    // second line as the address and the third as the telephone, so a four-line
    // supplier lost two lines of its address and gained a telephone number that
    // was a street.
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    if (lines.length < 2) return undefined
    const name = lines[0]!
    const telephone = lines.length >= 3 ? lines[lines.length - 1]! : undefined
    const address = lines.slice(1, telephone === undefined ? undefined : -1).join(', ')
    if (name === '' || address === '') return undefined
    return { name, address, ...(telephone === undefined ? {} : { telephone }) }
  }
  if (FIELD_SHAPES[key].editor === 'list') {
    const entries = text
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
    return entries.length === 0 ? undefined : entries
  }
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}

export interface ReadingRow {
  readonly key: ReadingKey
  readonly label: string
  readonly editor: FieldShape['editor']
  readonly hint: string | undefined
  readonly confidence: number
  /** The text shown and edited. */
  readonly text: string
  /**
   * Codes read off the label that this build cannot carry into one.
   *
   * Shown, never confirmed. `GhsRequest` admits only codes with verified text,
   * so confirming one would produce a label the save and export routes refuse
   * outright — with a 400 naming a field the user cannot edit their way out of.
   * Showing them is the honest half: the code really was on their label.
   */
  readonly unusable: readonly string[]
}

/** Splits a list field's entries into the ones a label can carry and the rest. */
export function partitionEntries(
  key: ReadingKey,
  regime: GhsRegime,
  text: string,
): { readonly usable: readonly string[]; readonly unusable: readonly string[] } {
  if (!isListKey(key)) return { usable: [], unusable: [] }
  const entries = (parseValue(key, text) ?? []) as readonly string[]
  return {
    // Stored canonicalised, because the engine looks these up by exact key: a
    // confirmed `p337+p313` would draw nothing and record an omission, which is
    // the label being blamed for our punctuation.
    usable: entries.filter((e) => entryIsUsable(key, regime, e)).map((e) => canonicalEntry(key, e)),
    unusable: entries.filter((e) => !entryIsUsable(key, regime, e)),
  }
}
