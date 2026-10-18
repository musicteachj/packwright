import { describe, expect, it } from 'vitest'
import { fuzzStrings } from '../testing/fuzz'
import { FILENAME_MAX_CHARACTERS, labelFilename } from './filename'

/** What `labelFilename` did before the cap and the linear trim, kept as the oracle. */
const byPattern = (identifier: string, extension = 'pdf'): string => {
  const safe = identifier.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${safe === '' ? 'label' : safe}.${extension}`
}

describe('labelFilename', () => {
  it('names a file as the pattern it replaced did, for any name within the cap', () => {
    // The trim was `/^-+|-+$/g`, quadratic in a run of hyphens inside the name
    // (`docs/security-review-2026-10-18.md`, finding 1).
    for (const identifier of fuzzStrings(['a', 'Z', '7', '-', '-', '.', '_', ' ', '/', 'é', '"'])) {
      expect(labelFilename(identifier), JSON.stringify(identifier)).toBe(byPattern(identifier))
    }
    expect(labelFilename('Rolled oats')).toBe('Rolled-oats.pdf')
    expect(labelFilename('   ')).toBe('label.pdf')
  })

  it('cuts a long name at FILENAME_MAX_CHARACTERS, without a trailing hyphen', () => {
    // The `Content-Disposition` header grew with the name: 40 KB was produced, and at
    // 50 KB the client refused the response (finding 1 of the review above).
    const name = labelFilename('Acetone '.repeat(5_000))
    expect(name.length).toBeLessThanOrEqual(FILENAME_MAX_CHARACTERS + '.pdf'.length)
    expect(name).toMatch(/^Acetone-Acetone.*[a-z]\.pdf$/)
    expect(labelFilename('a'.repeat(99) + ' b')).toBe(`${'a'.repeat(99)}.pdf`)
    expect(labelFilename(`a${'-'.repeat(100_000)}a`)).toBe(`a.pdf`)
  })
})
