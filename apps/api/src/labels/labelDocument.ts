/**
 * A saved label, as the database holds it.
 *
 * **`data` is `Mixed`, and that is deliberate.** Mongoose gets no say over the
 * shape of a label's fields; Zod does, in `label-core`'s `schema/` module, which
 * is the same description the export routes validate against. Restating three large
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
import { LABEL_TYPES } from '@packwright/label-core'

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
    // The SHA-256 of the secret the label's creator was handed, so a copy of the
    // database is not a copy of anyone's right to edit (`labelDocumentRoutes.ts`).
    // `select: false`, so no read returns it unless it asks by name, and a route
    // added later cannot serve it by forgetting to strip it. Not `required`: a
    // label stored before tokens has none, and no token then opens it.
    editTokenHash: { type: String, select: false },
  },
  // Findings are never stored. `docs/DESIGN.md` settles it, and the reason is
  // the one the application rests on: a finding must reflect the current rule
  // set, and a stored verdict is a verdict that was true once.
  //
  // `versionKey: false` rather than stripping `__v` on the way out, so there is
  // nothing for a route added later to forget to strip.
  { timestamps: true, versionKey: false },
)

/** How long a label is kept after its last change: thirty days, in seconds. */
export const LABEL_LIFETIME_SECONDS = 30 * 24 * 60 * 60

/**
 * Labels expire thirty days after their last change (James's decision,
 * `docs/security-review-2026-10-18.md`, finding 4), so a cap filled by
 * strangers empties again without anyone deleting anything.
 *
 * A TTL index on `updatedAt`, which `PUT` moves (`findOneAndReplace` with
 * `timestamps`), so every save starts the thirty days again. What it does not
 * promise, written down:
 * - Mongo's TTL monitor runs about once a minute, so a label outlives its
 *   thirty days by up to that, and a test cannot wait for it; the index is
 *   asserted instead.
 * - A TTL index must be on one field. The compound `{ updatedAt: -1, _id: -1 }`
 *   it might have shared served the list of every label, which is gone, so that
 *   index is gone too. Mongoose builds indexes and never drops them, so a
 *   development database keeps the old one, unused and harmless; the two key
 *   patterns differ, so they do not conflict.
 * - Changing the figure later is a `collMod` on the live index. Building an
 *   index with the same key and a different `expireAfterSeconds` fails with
 *   `IndexOptionsConflict` (tried against `mongod` on 2026-10-18), which Mongoose
 *   reports as an `index` event nothing here listens to, so the old figure
 *   quietly stays in force.
 * - A label stored before this index existed expires by the same rule, at once
 *   if its last change is already more than thirty days old.
 */
labelDocumentSchema.index({ updatedAt: 1 }, { expireAfterSeconds: LABEL_LIFETIME_SECONDS })

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
