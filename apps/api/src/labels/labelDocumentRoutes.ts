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
import { isValidObjectId } from 'mongoose'
import { LabelDocument, serializeLabelDocument } from './labelDocument'
import { LabelDocumentInput } from './schemas'

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

export function createLabelDocumentRouter(): Router {
  const router = Router()

  router.get('/', async (_request: Request, response: Response) => {
    // Newest first: the thing most recently worked on is the thing most likely
    // to be wanted next. `data` is excluded in the query rather than stripped
    // afterwards, so the cost of listing does not grow with the size of the
    // labels in it.
    const documents = await LabelDocument.find({}, 'name labelType createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean()
    response.json(
      documents.map((document) => ({
        id: String(document._id),
        name: document.name,
        labelType: document.labelType,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })),
    )
  })

  router.post('/', async (request: Request, response: Response) => {
    const parsed = LabelDocumentInput.safeParse(request.body)
    if (!parsed.success) return badRequest(response, parsed.error.issues)
    const created = await LabelDocument.create(parsed.data)
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
