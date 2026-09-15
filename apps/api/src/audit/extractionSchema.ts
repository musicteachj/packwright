/**
 * What a photograph of a GHS label is allowed to say.
 *
 * A **projection** of `GhsLabelData`, not the form schema. `GhsRequest` carries
 * `pictogramSideMm`, `stock` and the type defaults; handing those to a vision
 * model invites it to invent layout it cannot see. Extraction supplies content.
 * Geometry comes from the template, and the few physical facts a photograph
 * cannot show come from the user.
 *
 * **Every field is optional, and absence is the answer for "not visible".** A
 * required field is a field the model has to produce something for, and the one
 * thing worse than a missing value here is a plausible invented one.
 *
 * **The model authors no prose.** No notes, no warnings, no explanations —
 * values and confidences only. Every `ExtractionWarning` in the result is
 * produced by our own code from a deterministic check. This is stricter than
 * `docs/DESIGN.md` requires and the reason is placement: warnings sit beside
 * findings in the interface, and a sentence written by a language model next to
 * a sentence carrying a CFR citation invites exactly the confusion the boundary
 * between the two exists to prevent. "I could not read this" is already sayable
 * — the field is absent, or its confidence is low.
 *
 * Deliberately **not** extracted, each for a reason the model cannot get around:
 *
 * - `regime` — a market decision, not a property of the artwork.
 *   `templates/ghs.ts` puts it plainly: defaulting it means "a label silently
 *   judged against the wrong regulator".
 * - `capacityL` — a property of the package. "A 100 ml bottle and a 2 litre drum
 *   sit in different bands however large a label is wrapped around either."
 * - `hazards` — the classification behind the pictograms, which is not printed.
 *   CLP Article 26 precedence turns on *why* a pictogram is present, so a
 *   classification inferred here would make that rule judge the model's guess
 *   rather than the label.
 * - `smallContainerLabelling` — a feasibility determination under
 *   29 CFR 1910.1200(f)(12)(i), which nothing in a photograph can make.
 * - every geometry field — `pictogramSideMm`, `stock`, the type sizes.
 *
 * **Statement codes are free strings, not an enum**, and for a reason that
 * outlived the one this note used to give. `US_OSHA_HAZARD_STATEMENTS` is empty,
 * so a regime-correct closed set on a US label would have no members at all, and
 * the EU set on a US label is a foreign list the model would be pushed to choose
 * from. Codes are transcribed as printed and classified in `extract.ts`; an
 * unknown one becomes a warning and is still shown to the user, which is what
 * the layout engine already does with the same input.
 *
 * This used to add that `GhsRequest` keyed its own codes to
 * `knownHazardStatementCodes('eu-clp')` whatever the regime said. It no longer
 * does — that was a defect, and it is fixed. Both schemas now take free strings
 * and ask the table; the difference is what they do with a code it cannot
 * answer for, and that difference is deliberate. Here it is a warning, because
 * refusing a reading makes the photograph wrong instead of this build
 * incomplete. There it is a rejection, because a label is about to be stored.
 *
 * One thing the JSON Schema below does **not** do, and it is the reason
 * `extract.ts` re-validates rather than trusting the response: `zodOutputFormat`
 * keeps only `type`, `description`, `title`, `format`, `items`, `required` and a
 * forced `additionalProperties: false`. Enums and numeric bounds are appended to
 * the description as prose. So `confidence` is advised to sit in 0–1 and is
 * *enforced* only when this schema parses the reply.
 */

import { GHS_PICTOGRAM_CODES, GHS_SIGNAL_WORDS, type GhsLabelData } from '@packwright/label-core'
import { z } from 'zod'

/**
 * One reading off the label: what it says, and how sure the model is.
 *
 * Mirrors `ExtractedField` from `label-core` minus `sourceRegion`, which is not
 * requested — that type measures in millimetres on a stock, and a vision region
 * is pixels on a photograph.
 */
const observed = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      value,
      /** 0–1. Surfaced to the user; never used to auto-accept a value. */
      confidence: z.number().min(0).max(1),
    })
    .optional()

export const GhsSupplierObservation = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  telephone: z.string().min(1).optional(),
})

/**
 * Both closed sets come from `label-core` rather than being restated here, for
 * the reason `GhsRequest` gives: a signal word or pictogram code that exists on
 * one side and not the other is drift no test would catch.
 */
export const GhsExtraction = z.object({
  productIdentifier: observed(z.string().min(1)),
  signalWords: observed(z.array(z.enum(GHS_SIGNAL_WORDS))),
  pictograms: observed(z.array(z.enum(GHS_PICTOGRAM_CODES))),
  hazardStatementCodes: observed(z.array(z.string().min(1))),
  precautionaryStatementCodes: observed(z.array(z.string().min(1))),
  supplier: observed(GhsSupplierObservation),
  outerPackageStatement: observed(z.string().min(1)),
})

export type GhsExtraction = z.infer<typeof GhsExtraction>

/**
 * The fields this schema can report, for the prompt and for the tests.
 *
 * Typed against **both** sides on purpose. A name here that is not a key of
 * `GhsExtraction` would be prompted for and never parsed; a name that is not a
 * key of `GhsLabelData` would be parsed and could never be confirmed into a
 * label. Either way the failure is silent at runtime, so it is made a
 * compile error instead.
 */
export const EXTRACTED_FIELDS = [
  'productIdentifier',
  'signalWords',
  'pictograms',
  'hazardStatementCodes',
  'precautionaryStatementCodes',
  'supplier',
  'outerPackageStatement',
] as const satisfies readonly (keyof GhsExtraction & keyof GhsLabelData)[]
