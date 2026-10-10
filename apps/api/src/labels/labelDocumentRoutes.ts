/**
 * Saved labels.
 *
 * Every write is parsed by `LabelDocumentInput` before it reaches the database,
 * and every read of a full document is parsed by it again on the way back out.
 * The second is the one worth explaining: a stored document is untrusted input
 * the moment the schema moves, and a label saved under an older shape that
 * silently deserializes into something the engine mis-draws — or that a rule
 * then judges — is the class of defect this project keeps finding by review and
 * never by its suite.
 *
 * Mounted on `/api/labels` alongside the export routes, which do not collide
 * with it: `/:id` is one path segment, `/upc-a/export` is two and POST-only.
 */
import { Router, type Request, type Response } from 'express'
import { Types, isValidObjectId } from 'mongoose'
import { LabelDocument, serializeLabelDocument } from './labelDocument'
import { LabelDocumentInput } from '@packwright/label-core/schema'

/** The export routes' error shape, reused so the API has one contract for a bad body. */
const badRequest = (
  response: Response,
  issues: readonly { path: PropertyKey[]; message: string }[],
) =>
  response.status(400).json({
    error: 'Invalid label document',
    detail: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  })

const notFound = (response: Response) => response.status(404).json({ error: 'Not found' })

/**
 * A cursor as the client hands it back, or a refusal.
 *
 * `undefined` for the first page, `'malformed'` for something that cannot be
 * read — which is answered with a 400 rather than ignored, because silently
 * treating a corrupt cursor as "start again" makes a client loop over the head
 * of the list forever with nothing to tell it why.
 */
function readCursor(
  raw: unknown,
): { updatedAt: Date; id: Types.ObjectId } | undefined | 'malformed' {
  if (raw === undefined) return undefined
  // Anything present but not a string is malformed rather than absent. Express
  // parses a repeated `?before=` into an array, and reading that as "no cursor"
  // answers page one carrying the same `nextBefore` the caller just sent — which
  // is the loop the 400 below exists to stop, reached by a different door.
  if (typeof raw !== 'string') return 'malformed'
  if (raw === '') return undefined
  const split = raw.lastIndexOf('_')
  if (split === -1) return 'malformed'
  const updatedAt = new Date(raw.slice(0, split))
  const id = raw.slice(split + 1)
  if (Number.isNaN(updatedAt.getTime()) || !isValidObjectId(id)) return 'malformed'
  return { updatedAt, id: new Types.ObjectId(id) }
}

/** How many saved labels a page carries when the caller does not say. */
const DEFAULT_PAGE = 50
/** The most it will carry however large a number is asked for. */
const MAX_PAGE = 200

/**
 * How many labels the application keeps, in total.
 *
 * Decided on 2026-10-08: twenty, across the whole collection, refusing the
 * twenty-first. There is no owner concept in this API, so a per-user cap would
 * be a cap on nobody. The figure is the old `barcode-crud` app's. Twenty fits
 * one page, so a client can fetch the list once and know from `count` whether
 * that was all of it, rather than walking the cursor. `PUT` is not counted:
 * replacing a label adds nothing.
 */
export const LABEL_CAP = 20

/** Said by the 409, and shown by the editor as written. */
const AT_CAP = `There are already ${LABEL_CAP} saved labels, which is as many as this app keeps. Delete one from Saved labels before saving another.`

const atCap = (response: Response) => response.status(409).json({ error: AT_CAP })

export function createLabelDocumentRouter(): Router {
  const router = Router()

  router.get('/', async (request: Request, response: Response) => {
    // Newest first: the thing most recently worked on is the thing most likely
    // to be wanted next. `data` is excluded in the query rather than stripped
    // afterwards, so the cost of listing does not grow with the size of the
    // labels in it — but it did grow with the *number* of them, without bound,
    // which is the half that is fixed here.
    //
    // A page over a cursor rather than a skip. `skip` re-reads and discards
    // everything before the offset, so the last page of a long list is the most
    // expensive one to fetch; a cursor on `updatedAt` reads from where the last
    // page stopped, and `labelDocumentSchema` already indexes it descending.
    const asked = Number(request.query.limit)
    const limit =
      Number.isFinite(asked) && asked >= 1 ? Math.min(Math.trunc(asked), MAX_PAGE) : DEFAULT_PAGE

    // **Compound, because `updatedAt` alone is not unique.** Mongo stores
    // milliseconds and two labels saved inside one of them tie; a cursor of
    // `updatedAt < boundary` then steps over every one of its neighbours, and the
    // list reports itself finished having silently skipped them. Four labels
    // sharing a timestamp returned two and stopped. Ordering and seeking on
    // `(updatedAt, _id)` breaks the tie by something that cannot repeat — and
    // `labelDocument.ts` indexes both, which it did not when this was first
    // written, so for one commit the sort was planned as a collection scan.
    const cursor = readCursor(request.query.before)
    if (cursor === 'malformed') {
      response.status(400).json({
        error: 'Invalid cursor',
        detail: ['`before` must be the `nextBefore` value from a previous page.'],
      })
      return
    }

    const found = await LabelDocument.find(
      cursor === undefined
        ? {}
        : {
            $or: [
              { updatedAt: { $lt: cursor.updatedAt } },
              { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
            ],
          },
      'name labelType createdAt updatedAt',
    )
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
    const page = found.slice(0, limit)
    const last = page[page.length - 1]

    response.json({
      // The whole collection, not this page, so a list can say "n of 20" and
      // tell a page that is everything from one that was cut short.
      cap: LABEL_CAP,
      count: await LabelDocument.countDocuments({}),
      labels: page.map((document) => ({
        id: String(document._id),
        name: document.name,
        labelType: document.labelType,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })),
      // The value to pass back as `before`, or nothing where this is the end.
      ...(found.length > limit && last !== undefined
        ? { nextBefore: `${last.updatedAt.toISOString()}_${String(last._id)}` }
        : {}),
    })
  })

  router.post('/', async (request: Request, response: Response) => {
    const parsed = LabelDocumentInput.safeParse(request.body)
    if (!parsed.success) return badRequest(response, parsed.error.issues)
    if ((await LabelDocument.countDocuments({})) >= LABEL_CAP) return atCap(response)
    const created = await LabelDocument.create(parsed.data)
    // **Counted again once the label exists**, because the count above can be
    // stale by the time the insert lands: two saves at nineteen both read
    // nineteen and both insert. Whoever finds the collection over the cap takes
    // their own label back out, so it cannot overshoot. The cost is that two
    // saves racing for the last place can both find twenty-one and both
    // withdraw — a refusal the user can retry, rather than a twenty-first label.
    // A transaction would settle it exactly, and needs a replica set the
    // development database is not. If the withdrawing delete itself fails, the
    // save answers 500 and a twenty-first label stays; that is as far as it can
    // go, because every later save is refused by the count above.
    if ((await LabelDocument.countDocuments({})) > LABEL_CAP) {
      await LabelDocument.deleteOne({ _id: created._id })
      return atCap(response)
    }
    response.status(201).json(serializeLabelDocument(created))
  })

  router.get('/:id', async (request: Request, response: Response) => {
    const { id } = request.params
    // A malformed id is a request for a label that does not exist, which is what
    // 404 means. Letting Mongoose's cast error become a 500 reports a server
    // fault for a client's typo.
    if (!isValidObjectId(id)) return notFound(response)
    const document = await LabelDocument.findById(id).lean()
    if (document === null) return notFound(response)

    const parsed = LabelDocumentInput.safeParse({
      name: document.name,
      labelType: document.labelType,
      stock: document.stock,
      data: document.data,
    })
    if (!parsed.success) {
      // 500 is the honest code: the request was fine and the server's own data
      // is not. The id is named because finding the offending document is the
      // first thing anyone reading this will need to do.
      return response.status(500).json({
        error: `Saved label ${id} no longer matches the schema it was written with`,
        detail: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
    // **What was validated is what is served.** Parsing into `parsed` and then
    // sending the raw document checks nothing a client can see: zod strips keys
    // it does not know, so a `data.gtin` left on a us-food label by an older
    // shape parses clean and the unsanitised original goes out anyway. That is
    // the same defect the replace on `PUT` exists to prevent, on the way back.
    //
    // `_id` and the timestamps come from the document because they are not part
    // of what the schema describes.
    response.json(
      serializeLabelDocument({
        _id: document._id,
        ...parsed.data,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      }),
    )
  })

  router.put('/:id', async (request: Request, response: Response) => {
    const { id } = request.params
    if (!isValidObjectId(id)) return notFound(response)
    const parsed = LabelDocumentInput.safeParse(request.body)
    if (!parsed.success) return badRequest(response, parsed.error.issues)

    // Replaced, not merged. The body is the whole document, because merging a
    // *partial* update into a discriminated union is where a `us-food` label
    // still carrying a `gtin` comes from — and a replace is what clears a field
    // an older shape left behind, which `$set` of the known fields does not.
    //
    // `createdAt` is carried across rather than left to mongoose. A replacement
    // body has none, so its replace branch writes the current time and every
    // edit re-dated the label it was editing. The date a label was created is
    // not the caller's to set, and not the edit's to move.
    const existing = await LabelDocument.findById(id).lean()
    if (existing === null) return notFound(response)

    const updated = await LabelDocument.findOneAndReplace(
      { _id: id },
      { ...parsed.data, createdAt: existing.createdAt },
      { new: true, timestamps: true, runValidators: true },
    )
    if (updated === null) return notFound(response)
    response.json(serializeLabelDocument(updated))
  })

  router.delete('/:id', async (request: Request, response: Response) => {
    const { id } = request.params
    if (!isValidObjectId(id)) return notFound(response)
    const deleted = await LabelDocument.findByIdAndDelete(id)
    if (deleted === null) return notFound(response)
    response.status(204).end()
  })

  return router
}
