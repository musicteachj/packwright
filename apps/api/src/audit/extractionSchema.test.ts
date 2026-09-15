import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { describe, expect, it } from 'vitest'
import { EXTRACTED_FIELDS, GhsExtraction } from './extractionSchema'

const reading = <T>(value: T, confidence = 0.9) => ({ value, confidence })

describe('the GHS extraction schema', () => {
  it('lets a photograph say nothing at all', () => {
    // The honest answer for a blank or unreadable image, and the one a required
    // field would make unsayable. A live call against a 1x1 image returned
    // exactly this.
    expect(GhsExtraction.safeParse({}).success).toBe(true)
  })

  it('names the same fields the constant advertises', () => {
    // `satisfies` proves every name in the list is a real key. It cannot prove
    // the list is complete, so a field added to the schema and forgotten here
    // would be parsed and never prompted for.
    expect([...EXTRACTED_FIELDS].sort()).toEqual(Object.keys(GhsExtraction.shape).sort())
  })

  it('bounds confidence at both ends', () => {
    expect(GhsExtraction.safeParse({ productIdentifier: reading('Acetone', 0) }).success).toBe(true)
    expect(GhsExtraction.safeParse({ productIdentifier: reading('Acetone', 1) }).success).toBe(true)
    expect(GhsExtraction.safeParse({ productIdentifier: reading('Acetone', 1.4) }).success).toBe(
      false,
    )
    expect(GhsExtraction.safeParse({ productIdentifier: reading('Acetone', -0.1) }).success).toBe(
      false,
    )
  })

  it('requires a confidence beside every value', () => {
    // A value with no confidence is a value presented as certain, which is the
    // one thing this contract exists to prevent.
    const parsed = GhsExtraction.safeParse({ productIdentifier: { value: 'Acetone' } })
    expect(parsed.success).toBe(false)
  })

  it('takes a statement code as printed, whether or not this build knows it', () => {
    // Deliberate, and the reason is in the module note: the OSHA tables are
    // empty and `GhsRequest` keys its own enum to eu-clp whatever the regime
    // says, so a closed set here would leave a US label with no valid code at
    // all. `extract.ts` classifies; the schema transcribes. Tightening this to
    // an enum would make the model substitute a code it can see for one it
    // cannot, which is the failure the free string exists to avoid.
    const parsed = GhsExtraction.safeParse({ hazardStatementCodes: reading(['H225', 'H999']) })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.hazardStatementCodes?.value).toEqual(['H225', 'H999'])
  })

  it('rejects a signal word that is not one of the two', () => {
    expect(GhsExtraction.safeParse({ signalWords: reading(['Caution']) }).success).toBe(false)
    expect(GhsExtraction.safeParse({ signalWords: reading(['Danger', 'Warning']) }).success).toBe(
      true,
    )
  })

  it('drops a key nobody asked for rather than refusing the whole reading', () => {
    // Zod's default, and load-bearing on the read path for the same reason
    // `labelDocumentRoutes.ts` relies on it: what was validated is what is
    // served. One surplus key must not cost the six fields that parsed.
    const parsed = GhsExtraction.safeParse({
      productIdentifier: reading('Acetone'),
      complianceVerdict: 'non-compliant',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'complianceVerdict' in parsed.data).toBe(false)
  })

  describe('the JSON schema the API is sent', () => {
    const format = zodOutputFormat(GhsExtraction)
    const schema = format.schema as {
      required?: string[]
      properties: Record<string, { properties: { value: Record<string, unknown> } }>
    }

    it('marks nothing as required, so an unreadable field can simply be absent', () => {
      expect(schema.required ?? []).toEqual([])
    })

    it('carries the signal words where the model can read them, since they are not enforced', () => {
      // `zodOutputFormat` keeps type, description, title, format, items,
      // required and a forced `additionalProperties: false`; an enum is demoted
      // into the description. Established by running it, and it is why
      // `extract.ts` re-validates rather than trusting the reply. If a future
      // SDK starts emitting `enum` properly this test is the one that notices.
      expect(JSON.stringify(schema.properties.signalWords)).toContain('Danger')
    })
  })
})
