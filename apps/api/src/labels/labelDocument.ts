/**
 * A saved label, as the database holds it.
 *
 * **`data` is `Mixed`, and that is deliberate.** Mongoose gets no say over the
 * shape of a label's fields; Zod does, in `schemas.ts`, which is the same
 * description the export routes validate against. Restating three large
 * label-data shapes in a second schema language would be a second source of
 * truth for one set of facts — the drift `getSymbologyConstraints` was
 * introduced into `routes.ts` to stop having to manage.
 *
 * The trade is real and taken knowingly: nothing at the database level stops a
 * malformed `data` being written. The API is the only writer, it validates every
 * write, and `labelDocumentRoutes.ts` validates every read as well, on the
 * grounds that a stored document is untrusted input the moment the schema moves.
 */
import { Schema, model } from 'mongoose'
import { LABEL_TYPES } from './schemas'

export interface SerializedLabelDocument {
  readonly id: string
  readonly name: string
  readonly labelType: string
  readonly stock: { widthMm: number; heightMm: number; marginMm: number }
  readonly data: unknown
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * A sub-schema rather than a bare nested path, so `stock` is required as a
 * whole and not merely field by field.
 *
 * Declared inline, Mongoose treats the three measurements as required and the
 * object containing them as optional — which types as `stock: {...} | null` and
 * means a document could exist with no stock at all. `_id: false` because a
 * measurement triple is not a thing with an identity.
 */
const stockSchema = new Schema(
  {
    widthMm: { type: Number, required: true },
    heightMm: { type: Number, required: true },
    marginMm: { type: Number, required: true },
  },
  { _id: false },
)

const labelDocumentSchema = new Schema(
  {
    // Not unique. Two drafts of the same product is a normal thing to want, and
    // a uniqueness index refuses it with a database error rather than with a
    // sentence anyone can act on.
    name: { type: String, required: true, trim: true, maxlength: 120 },
    labelType: { type: String, required: true, enum: LABEL_TYPES },
    stock: { type: stockSchema, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  // Findings are never stored. `docs/DESIGN.md` settles it, and the reason is
  // the one the application rests on: a finding must reflect the current rule
  // set, and a stored verdict is a verdict that was true once.
  //
  // `versionKey: false` rather than stripping `__v` on the way out, so there is
  // nothing for a route added later to forget to strip.
  { timestamps: true, versionKey: false },
)

// The list sorts on both, and an unindexed sort is done in memory against a
// 32 MB ceiling — which is a long way off for a label collection, and a 500 with
// no obvious cause when it arrives.
//
// **Compound because the sort is.** `_id` joined it when the list gained a cursor:
// `updatedAt` alone is not unique, so paging on it silently skipped labels that
// tied. This index was left at one key in that change, which quietly cost the
// thing it exists for — the planner stopped matching it and went back to a
// collection scan and an in-memory sort, on a list that had just been made
// cheaper to fetch. Caught by review; the prose describing that change said the
// existing index still served it, and it did not.
labelDocumentSchema.index({ updatedAt: -1, _id: -1 })

export const LabelDocument = model('LabelDocument', labelDocumentSchema)

/**
 * What a client is given.
 *
 * `_id` becomes a string `id`, because an `ObjectId` is a database detail and a
 * client handed one starts depending on its shape.
 */
export function serializeLabelDocument(document: {
  _id: unknown
  name: string
  labelType: string
  stock: { widthMm: number; heightMm: number; marginMm: number }
  data: unknown
  createdAt: Date
  updatedAt: Date
}): SerializedLabelDocument {
  return {
    id: String(document._id),
    name: document.name,
    labelType: document.labelType,
    stock: document.stock,
    data: document.data,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}
