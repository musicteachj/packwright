export {
  GS1_KEY_LENGTHS,
  Gs1FormatError,
  appendCheckDigit,
  calculateCheckDigit,
  isKnownKeyLength,
  isValidCheckDigit,
  normaliseToGtin14,
} from './checkDigit'
export type { Gs1KeyKind } from './checkDigit'

export {
  FNC1_SEPARATOR,
  getAiSpec,
  hasPredefinedLength,
  listAiSpecs,
  validateAiValue,
} from './applicationIdentifiers'
export type { AiSpec } from './applicationIdentifiers'

export {
  Gs1ElementStringError,
  encodeElementString,
  formatHumanReadable,
  parseHumanReadable,
} from './elementString'
export type { Gs1Element } from './elementString'

export { normaliseScannedGtin } from './scan'
export type { ScannedGtin } from './scan'

export { DigitalLinkError, buildDigitalLinkUri } from './digitalLink'
export type { DigitalLinkInput } from './digitalLink'
