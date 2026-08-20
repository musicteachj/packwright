/**
 * Per-symbology input constraints.
 *
 * Ported from `barcode-crud`'s `client/src/constants/barcodeTypes.ts`, which is
 * the one genuinely reusable artifact from that project — the lengths and
 * check-digit behaviour were arrived at empirically against a working encoder.
 *
 * The important subtlety, and the reason this cannot be read off a spec sheet:
 * `payloadLength` is what a **user types**, excluding any check digit the
 * encoder appends. EAN-13 is thirteen digits on the pack but twelve in the
 * form. Conflating the two produces a field that rejects every valid input.
 */

import type { SymbologyId } from '../types/index'

export interface SymbologyConstraints {
  id: SymbologyId
  /** Display name, as printed in the UI. */
  label: string
  description: string
  numericOnly: boolean
  /** Character count the user supplies, excluding an appended check digit. */
  payloadLength: { min: number; max: number }
  /** True when the encoder computes and appends a check digit. */
  appendsCheckDigit: boolean
  /** Bounds on the numeric value itself, where the symbology constrains it. */
  valueRange?: { min: number; max: number }
  /**
   * Encoder name passed to bwip-js.
   *
   * TODO(verify): confirm each against the BWIPP barcode-types listing before
   * the first symbol is rendered — a wrong name fails loudly at render time
   * rather than producing a wrong symbol, so this is low risk but not zero.
   */
  bwipId: string
}

const CONSTRAINTS: readonly SymbologyConstraints[] = [
  {
    id: 'CODE128',
    label: 'Code 128',
    description: 'Most versatile — supports the full ASCII set',
    numericOnly: false,
    payloadLength: { min: 1, max: 80 },
    appendsCheckDigit: false,
    bwipId: 'code128',
  },
  {
    id: 'EAN-13',
    label: 'EAN-13',
    description: 'European Article Number — 12 digits plus a check digit',
    numericOnly: true,
    payloadLength: { min: 12, max: 12 },
    appendsCheckDigit: true,
    bwipId: 'ean13',
  },
  {
    id: 'EAN-8',
    label: 'EAN-8',
    description: 'Compact EAN for small packs — 7 digits plus a check digit',
    numericOnly: true,
    payloadLength: { min: 7, max: 7 },
    appendsCheckDigit: true,
    bwipId: 'ean8',
  },
  {
    id: 'UPC-A',
    label: 'UPC-A',
    description: 'Universal Product Code — 11 digits plus a check digit',
    numericOnly: true,
    payloadLength: { min: 11, max: 11 },
    appendsCheckDigit: true,
    bwipId: 'upca',
  },
  {
    id: 'UPC-E',
    label: 'UPC-E',
    description: 'Zero-suppressed UPC for very small packs',
    numericOnly: true,
    payloadLength: { min: 7, max: 7 },
    appendsCheckDigit: true,
    bwipId: 'upce',
  },
  {
    id: 'ITF-14',
    label: 'ITF-14',
    description: 'Interleaved 2 of 5 — shipping cartons, 13 digits plus a check digit',
    numericOnly: true,
    payloadLength: { min: 13, max: 13 },
    appendsCheckDigit: true,
    bwipId: 'itf14',
  },
  {
    id: 'GS1-128',
    label: 'GS1-128',
    description: 'Code 128 carrying GS1 Application Identifiers — logistics labels',
    numericOnly: false,
    payloadLength: { min: 1, max: 80 },
    appendsCheckDigit: false,
    bwipId: 'gs1-128',
  },
  {
    id: 'CODE39',
    label: 'Code 39',
    description: 'Alphanumeric — uppercase letters and digits',
    numericOnly: false,
    payloadLength: { min: 1, max: 40 },
    appendsCheckDigit: false,
    bwipId: 'code39',
  },
  {
    id: 'MSI',
    label: 'MSI',
    description: 'Modified Plessey — inventory and shelf marking',
    numericOnly: true,
    payloadLength: { min: 1, max: 12 },
    appendsCheckDigit: false,
    bwipId: 'msi',
  },
  {
    id: 'PHARMACODE',
    label: 'Pharmacode',
    description: 'Pharmaceutical packaging control code',
    numericOnly: true,
    payloadLength: { min: 1, max: 6 },
    appendsCheckDigit: false,
    // Pharmacode encodes a number, not a digit string, and the number itself is
    // bounded — 7 digits fits the length rule but exceeds the encodable range.
    valueRange: { min: 3, max: 131_070 },
    bwipId: 'pharmacode',
  },
] as const

const BY_ID = new Map<SymbologyId, SymbologyConstraints>(CONSTRAINTS.map((c) => [c.id, c]))

export function getSymbologyConstraints(id: SymbologyId): SymbologyConstraints | undefined {
  return BY_ID.get(id)
}

export function listSymbologies(): readonly SymbologyConstraints[] {
  return CONSTRAINTS
}

/**
 * Validates a user-supplied payload against its symbology.
 * Returns null when valid, or a human-readable reason when not.
 */
export function validatePayload(id: SymbologyId, payload: string): string | null {
  const spec = BY_ID.get(id)
  if (!spec) return `Unknown symbology "${id}"`

  if (spec.numericOnly && !/^[0-9]+$/.test(payload)) {
    return `${spec.label} accepts digits only`
  }

  const { min, max } = spec.payloadLength
  if (payload.length < min || payload.length > max) {
    const expected = min === max ? `${min}` : `${min}–${max}`
    const suffix = spec.appendsCheckDigit ? ' (the check digit is added for you)' : ''
    return `${spec.label} expects ${expected} characters, received ${payload.length}${suffix}`
  }

  if (spec.valueRange) {
    const value = Number(payload)
    if (value < spec.valueRange.min || value > spec.valueRange.max) {
      return `${spec.label} encodes values from ${spec.valueRange.min} to ${spec.valueRange.max}`
    }
  }

  return null
}
