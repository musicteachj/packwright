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
 * **Who may change a label.** There are no accounts. Creating a label hands its
 * creator a secret, the edit token, and changing or deleting the label needs it
 * back; reading stays open to anyone with the link. Before this, any caller
 * could list every label, overwrite one or delete one, and fill the cap so
 * nobody else could save (`docs/security-review-2026-10-18.md`, finding 4, and
 * James's decisions there).
 *
 * Mounted on `/api/labels` alongside the export routes, which do not collide
 * with it: `/:id` is one path segment, `/upc-a/export` is two and POST-only.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type RequestHandler, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { Types, isValidObjectId } from 'mongoose'
import { LABEL_LIFETIME_SECONDS, LabelDocument, serializeLabelDocument } from './labelDocument'
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

/** The header that carries a label's edit token on `PUT` and `DELETE`. */
export const EDIT_TOKEN_HEADER = 'X-Edit-Token'

const sha256 = (value: string) => createHash('sha256').update(value).digest()

/**
 * A new edit token, and what is stored in its place.
 *
 * Thirty-two random bytes, so a token cannot be guessed, only stolen. Only the
 * hash is stored, so a copy of the database is not a copy of anyone's right to
 * edit. A plain SHA-256 rather than a slow password hash: a slow hash defends a
 * secret a person chose, and this one has 256 bits nobody chose.
 */
function newEditToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: sha256(token).toString('hex') }
}

/**
 * Whether a presented token opens a label stored with `storedHash`.
 *
 * Compared as two SHA-256 digests in constant time, for the reason
 * `keyAccepted` in `audit/routes.ts` is: both sides are always 32 bytes, so
 * there is no length to check first and nothing to learn from how long the
 * comparison took. A label with no hash was stored before tokens existed, and
 * nothing opens it.
 */
function tokenOpens(presented: unknown, storedHash: unknown): boolean {
  if (typeof presented !== 'string' || typeof storedHash !== 'string') return false
  const stored = Buffer.from(storedHash, 'hex')
  if (stored.length !== 32) return false
  return timingSafeEqual(sha256(presented), stored)
}

/**
 * A new label's id, from twelve random bytes.
 *
 * **The id is the link, and a link is only private if nobody can work it out.**
 * A default ObjectId is a four-byte timestamp, five bytes fixed for the life of
 * the process and a counter, so one label a caller saved told them the rest of
 * every id the process had minted, short of a timestamp they could bracket by
 * saving another. With the list of every label gone, that was the way back to
 * it: guess ids, 200 at a time, against `?ids=` (high review of #111). Twelve
 * random bytes are 96 bits nobody can guess, still an ObjectId in shape, so
 * every link and URL stays as it was.
 */
const unguessableId = () => new Types.ObjectId(randomBytes(12))

const NOT_YOURS = 'This label can be changed only from the browser that saved it.'

/**
 * 403 rather than 404 for a label that exists: reading is open by link, so
 * whether a label exists is no secret, and "not yours" is the sentence a person
 * holding the link can act on (save their changes as a new label).
 */
const notYours = (response: Response) => response.status(403).json({ error: NOT_YOURS })

/**
 * How many labels the application keeps, in total.
 *
 * Twenty from 2026-10-08, the old `barcode-crud` app's figure, chosen when twenty
 * fitted one page of a list of every label. That list is gone (finding 4 of
 * `docs/security-review-2026-10-18.md`), and with it the reason for twenty.
 * **Two hundred since 2026-10-18**, James's figure, because the cap is shared by
 * everyone and nothing else stopped a stranger filling it. With ten creates an
 * hour from one address, one address needs twenty hours to fill it alone; and
 * every label expires thirty days after its last change, so a filled cap empties
 * again by itself. The worst case it stores is 200 labels at the 256 KB body
 * limit, about 51 MB.
 *
 * **What that leaves:** many addresses together can still fill it, and then
 * nobody new can save until labels expire or their owners delete them. There is
 * still no owner a per-user share could be counted against. `PUT` is not
 * counted: replacing a label adds nothing.
 */
export const LABEL_CAP = 200

/** Said by the 409, and shown by the editor as written. */
const AT_CAP = `There are already ${LABEL_CAP} saved labels, which is as many as this app keeps. Labels are removed ${LABEL_LIFETIME_SECONDS / (24 * 60 * 60)} days after their last change, so try again later, or delete one of yours from Saved labels.`

const atCap = (response: Response) => response.status(409).json({ error: AT_CAP })

/**
 * The ids a list asks about, or a refusal.
 *
 * A comma-separated `ids`, at most as many as the cap, since a browser cannot
 * hold more live labels than the application keeps. Anything else present is
 * refused rather than ignored: a repeated parameter, which Express hands over as
 * an array, an empty entry, or an id that is not an ObjectId.
 */
function readIds(raw: unknown): Types.ObjectId[] | 'malformed' {
  if (raw === undefined) return []
  if (typeof raw !== 'string') return 'malformed'
  if (raw === '') return []
  const ids = raw.split(',')
  if (ids.length > LABEL_CAP || !ids.every((id) => isValidObjectId(id) && id.length === 24)) {
    return 'malformed'
  }
  return ids.map((id) => new Types.ObjectId(id))
}

/**
 * What one client may write in an hour, by kind.
 *
 * Nothing limited writes before (`docs/security-review-2026-10-18.md`, finding
 * 4), so one caller could fill the cap in seconds. Each kind is counted apart,
 * so editing never spends the allowance for starting a label, and a refused
 * request is counted like any other, which also gives a token guesser a price.
 */
export interface LabelWriteLimits {
  /**
   * `POST`. Ten, James's figure: a person starts a few labels in an hour, and at
   * ten one address needs twenty hours to fill the cap.
   */
  createsPerHour: number
  /**
   * `PUT`. Three hundred: the editor saves when the Save button is pressed, never
   * on its own, so this is one save every twelve seconds for a whole hour, which
   * ordinary editing does not reach. A script is held to 300 validations and
   * writes of a label, and can only rewrite labels whose tokens it holds. Not to
   * 300 reads of a body: `app.ts` parses every JSON body, up to 256 KB, before
   * any route's limiter runs, as it does for every route but the audit.
   */
  replacesPerHour: number
  /**
   * `DELETE`. Two hundred, the cap: enough to clear every label the application
   * can hold in one sitting.
   */
  deletesPerHour: number
}

export const DEFAULT_LABEL_WRITE_LIMITS: LabelWriteLimits = {
  createsPerHour: 10,
  replacesPerHour: 300,
  deletesPerHour: 200,
}

const HOUR_MS = 60 * 60 * 1000

export function createLabelDocumentRouter(
  options: { limits?: LabelWriteLimits | false | undefined } = {},
): Router {
  const router = Router()
  const { limits } = options

  // Stated rather than defaulted, as the export and audit quotas are and for the
  // same reason: `createApp` builds the same application every time it is
  // called. One limiter per kind, each with its own count, attached to its route
  // rather than `router.use`d, so a request for some other path spends nothing.
  // `express-rate-limit` writes its own 429 rather than passing an error along,
  // which `app.ts`'s handler would answer as 500.
  const guard = (perHour: (set: LabelWriteLimits) => number, what: string): RequestHandler[] =>
    limits === false || limits === undefined
      ? []
      : [
          rateLimit({
            windowMs: HOUR_MS,
            limit: perHour(limits),
            standardHeaders: 'draft-7',
            legacyHeaders: false,
            message: { error: `Too many ${what} from this address. Try again in an hour.` },
          }),
        ]
  const creates = guard((set) => set.createsPerHour, 'new labels')
  const replaces = guard((set) => set.replacesPerHour, 'saves')
  const deletes = guard((set) => set.deletesPerHour, 'deletions')

  router.get('/', async (request: Request, response: Response) => {
    // **Only the labels the caller names.** This used to answer every label in
    // the collection, newest first, so anyone could read off every link and,
    // through it, every label (`docs/security-review-2026-10-18.md`, finding 4).
    // A browser now keeps the ids it saved and asks about those; an id is
    // already a link to its label, so answering for it publishes nothing new.
    // Without `ids`, the answer is the cap and the count alone, which is what
    // the editor reads before it offers to save.
    const ids = readIds(request.query.ids)
    if (ids === 'malformed') {
      response.status(400).json({
        error: 'Invalid label list',
        detail: [`\`ids\` must be up to ${LABEL_CAP} label ids, separated by commas.`],
      })
      return
    }

    // `data` is excluded in the query rather than stripped afterwards, so the
    // cost of a list does not grow with the size of the labels in it. At most
    // `LABEL_CAP` rows, found by `_id`'s own index, so the sort is in memory and
    // small.
    const found =
      ids.length === 0
        ? []
        : await LabelDocument.find({ _id: { $in: ids } }, 'name labelType createdAt updatedAt')
            .sort({ updatedAt: -1, _id: -1 })
            .lean()

    response.json({
      // The whole collection, not this answer, so the editor can say the app is
      // full before a save is refused.
      cap: LABEL_CAP,
      count: await LabelDocument.countDocuments({}),
      // Newest first. An id that names nothing, expired or deleted, is left out,
      // which is how a browser learns to forget it.
      labels: found.map((document) => ({
        id: String(document._id),
        name: document.name,
        labelType: document.labelType,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })),
    })
  })

  router.post('/', ...creates, async (request: Request, response: Response) => {
    const parsed = LabelDocumentInput.safeParse(request.body)
    if (!parsed.success) return badRequest(response, parsed.error.issues)
    if ((await LabelDocument.countDocuments({})) >= LABEL_CAP) return atCap(response)
    const { token, hash } = newEditToken()
    const created = await LabelDocument.create({
      _id: unguessableId(),
      ...parsed.data,
      editTokenHash: hash,
    })
    // **Counted again once the label exists**, because the count above can be
    // stale by the time the insert lands: two saves with one place left both
    // read one place left and both insert. Whoever finds the collection over the
    // cap takes their own label back out, so it cannot overshoot. The cost is
    // that two saves racing for the last place can both find one too many and
    // both withdraw: a refusal the user can retry, rather than a label past the
    // cap. A transaction would settle it exactly, and needs a replica set the
    // development database is not. If the withdrawing delete itself fails, the
    // save answers 500 and the extra label stays; that is as far as it can go,
    // because every later save is refused by the count above.
    if ((await LabelDocument.countDocuments({})) > LABEL_CAP) {
      await LabelDocument.deleteOne({ _id: created._id })
      return atCap(response)
    }
    // The one response that ever carries the token. It is not stored, so it
    // cannot be sent again: a browser that loses it has lost the right to edit.
    response.status(201).json({ ...serializeLabelDocument(created), editToken: token })
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

  /**
   * The label `id` names, if the request carries its token.
   *
   * Answers for itself and gives back nothing where the label is missing (404)
   * or the token does not open it (403). Hands back the stored hash, so the
   * write that follows is filtered on the hash it was checked against as well as
   * on the id, and the check and the write cannot be about two different states
   * of the label.
   */
  async function opened(
    request: Request,
    response: Response,
  ): Promise<{ createdAt: Date; editTokenHash: string } | undefined> {
    const { id } = request.params
    if (typeof id !== 'string' || !isValidObjectId(id)) {
      notFound(response)
      return undefined
    }
    const existing = await LabelDocument.findById(id, 'createdAt +editTokenHash').lean()
    if (existing === null) {
      notFound(response)
      return undefined
    }
    if (!tokenOpens(request.get(EDIT_TOKEN_HEADER), existing.editTokenHash)) {
      notYours(response)
      return undefined
    }
    return { createdAt: existing.createdAt, editTokenHash: existing.editTokenHash as string }
  }

  router.put('/:id', ...replaces, async (request: Request, response: Response) => {
    const { id } = request.params
    if (!isValidObjectId(id)) return notFound(response)
    const parsed = LabelDocumentInput.safeParse(request.body)
    if (!parsed.success) return badRequest(response, parsed.error.issues)

    const existing = await opened(request, response)
    if (existing === undefined) return

    // Replaced, not merged. The body is the whole document, because merging a
    // *partial* update into a discriminated union is where a `us-food` label
    // still carrying a `gtin` comes from — and a replace is what clears a field
    // an older shape left behind, which `$set` of the known fields does not.
    //
    // **What the body cannot carry is carried across.** A replace writes exactly
    // the fields it names. `createdAt`: a replacement body has none, so mongoose
    // wrote the current time and every edit re-dated the label it was editing.
    // `editTokenHash`: left out, the first edit would have made the label
    // uneditable by the browser that had just saved it.
    const updated = await LabelDocument.findOneAndReplace(
      { _id: id, editTokenHash: existing.editTokenHash },
      { ...parsed.data, createdAt: existing.createdAt, editTokenHash: existing.editTokenHash },
      { new: true, timestamps: true, runValidators: true },
    )
    if (updated === null) return notFound(response)
    response.json(serializeLabelDocument(updated))
  })

  router.delete('/:id', ...deletes, async (request: Request, response: Response) => {
    const existing = await opened(request, response)
    if (existing === undefined) return
    const { deletedCount } = await LabelDocument.deleteOne({
      _id: request.params.id,
      editTokenHash: existing.editTokenHash,
    })
    if (deletedCount === 0) return notFound(response)
    response.status(204).end()
  })

  return router
}
