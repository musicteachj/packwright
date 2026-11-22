/**
 * The saved-labels API, in one place.
 *
 * The editor already reaches the server with a bare `fetch` to export a PDF, and
 * a second set of call sites doing the same would spread the id-to-URL shape and
 * the error handling across every component that saves. There is one of each
 * here instead.
 *
 * Nothing in this module knows what a label *is* — it moves whatever the server
 * describes. The shape of a label is decided by `label-core`'s `schema/` module
 * on the server and by `label-core`'s engine in the browser, and a third opinion
 * here would be the drift this project keeps closing.
 *
 * **It does know whose a label is.** Creating one hands back an edit token,
 * which this module keeps (`heldLabels.ts`) and sends again to change or delete
 * that label; the list is of the labels this browser holds tokens for.
 */
import { editTokenFor, forgetLabels, heldLabels, holdLabel } from './heldLabels'

export interface SavedLabelSummary {
  readonly id: string
  readonly name: string
  readonly labelType: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SavedLabel extends SavedLabelSummary {
  readonly stock: { widthMm: number; heightMm: number; marginMm: number }
  readonly data: unknown
}

/** What a client sends. `id` and the timestamps are the server's to set. */
export interface SavedLabelInput {
  readonly name: string
  readonly labelType: string
  readonly stock: { widthMm: number; heightMm: number; marginMm: number }
  readonly data: unknown
}

/**
 * A request the server refused, carrying what it said about why.
 *
 * The `detail` array is the same shape the export routes return — `path` and
 * `message` per issue — so a caller can point at the field rather than showing a
 * user "Invalid label document" and leaving them to guess.
 */
export class SavedLabelError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: readonly { path: string; message: string }[] = [],
  ) {
    super(message)
    this.name = 'SavedLabelError'
  }

  /** A label that is gone, as distinct from a request the server could not read. */
  get isMissing(): boolean {
    return this.status === 404
  }

  /** A new label refused because the application already keeps as many as it will. */
  get isAtCap(): boolean {
    return this.status === 409
  }

  /** A change refused because this browser does not hold the label's edit token. */
  get isNotYours(): boolean {
    return this.status === 403
  }
}

const BASE = '/api/labels'

/** The header the server reads a label's edit token from. */
export const EDIT_TOKEN_HEADER = 'X-Edit-Token'

async function request(
  path: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })

  if (response.ok) return response.status === 204 ? undefined : await response.json()

  // The body is the server's account of the refusal and is worth more than the
  // status alone — but an error page or a proxy will not have sent JSON, and
  // failing to parse one must not replace the real failure with a parse error.
  let detail: readonly { path: string; message: string }[] = []
  let message = `The server refused the request (${response.status}).`
  try {
    const body = (await response.json()) as { error?: string; detail?: typeof detail }
    if (typeof body.error === 'string') message = body.error
    if (Array.isArray(body.detail)) detail = body.detail
  } catch {
    // Left as the status-only message above.
  }
  throw new SavedLabelError(message, response.status, detail)
}

/** How many labels the application keeps, and how many it holds now. */
export interface LabelCount {
  readonly cap: number
  readonly count: number
}

export interface LabelList {
  /** The labels this browser holds, newest first. */
  readonly labels: SavedLabelSummary[]
  /** `null` where the server did not say; nothing then shows a figure it lacks. */
  readonly counted: LabelCount | null
}

/**
 * The most ids one request asks about: the server's `MAX_IDS_PER_LIST`, which is
 * no longer the cap. The app keeps 1,000 labels, and a URL naming that many ids
 * is past the header size Node accepts, so a browser holding more than this asks
 * in turns.
 */
const MOST_IDS = 200

/** What the server reads as a label id: an ObjectId's 24 hex digits. */
const OBJECT_ID = /^[0-9a-f]{24}$/

/**
 * The cap and count from a list response, or `null` where the body does not
 * carry them: an older server, or something in front of it answering instead.
 */
const countIn = (answer: { cap?: unknown; count?: unknown }): LabelCount | null =>
  typeof answer.cap === 'number' && typeof answer.count === 'number'
    ? { cap: answer.cap, count: answer.count }
    : null

/**
 * Newest first, as the server sorts one answer: last changed, then id. Applied
 * again to answers joined, since each is sorted only within itself. Both are
 * compared as strings: an ISO date in UTC sorts as its text does, and an id is
 * 24 lowercase hex digits, which sort as the ObjectId does.
 */
const descending = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0)
const newestFirst = (a: SavedLabelSummary, b: SavedLabelSummary): number =>
  descending(a.updatedAt, b.updatedAt) || descending(a.id, b.id)

/**
 * The labels this browser saved, newest first, `MOST_IDS` ids to a request.
 *
 * The server no longer lists every label, because that list published every
 * link (`docs/security-review-2026-10-18.md`, finding 4); it answers for the ids
 * it is given. An id it leaves out names a label that was deleted or has expired,
 * so this browser lets go of it, and only on an answer that succeeded: a failed
 * request says nothing about which labels exist.
 *
 * **Every held id is asked about.** This used to keep the newest `MOST_IDS` and
 * leave the rest out of the request, which cost nothing while that was also the
 * cap; at 1,000, the labels past the first 200 could not be listed, opened or
 * deleted from this browser. The requests go one after another, so a browser
 * holding many labels never sends the server a burst, and if any of them fails
 * the whole list fails and nothing is let go of.
 */
export const listLabels = async (): Promise<LabelList> => {
  // Only ids the server can read. It refuses a whole list over one it cannot,
  // so a single bad entry (edited by hand, or written by some other build) failed
  // the Saved labels page on every visit, with no way out but clearing storage
  // and every good token with it. Found by review.
  const ids = heldLabels()
    .map((label) => label.id)
    .filter((id) => OBJECT_ID.test(id))
  const chunks: string[][] = []
  for (let start = 0; start < ids.length; start += MOST_IDS) {
    chunks.push(ids.slice(start, start + MOST_IDS))
  }
  // With nothing held, one request still asks for the cap and the count.
  if (chunks.length === 0) chunks.push([])

  const labels: SavedLabelSummary[] = []
  const gone: string[] = []
  let anyListed = false
  let counted: LabelCount | null = null
  for (const chunk of chunks) {
    const answer = (await request(
      chunk.length === 0 ? BASE : `${BASE}?ids=${chunk.join(',')}`,
    )) as { labels?: SavedLabelSummary[]; cap?: unknown; count?: unknown }
    // The latest answer's figures, since each request reads them afresh.
    counted = countIn(answer)
    // **Only an answer that lists anything can say a label is gone.** Read as an
    // empty list, a body with no `labels` (an older server, or something in
    // front of it answering) let go of every token this browser held, for good.
    // Found by review.
    if (!Array.isArray(answer.labels)) continue
    anyListed = true
    labels.push(...answer.labels)
    const listed = new Set(answer.labels.map((label) => label.id))
    gone.push(...chunk.filter((id) => !listed.has(id)))
  }
  if (!anyListed) return { labels: [], counted }
  forgetLabels(gone)
  // One answer is already in the server's order, and is kept as it came.
  return { labels: chunks.length > 1 ? labels.sort(newestFirst) : labels, counted }
}

/**
 * The cap and the count alone, for the editor to know before it offers to save
 * a new label.
 *
 * `null` where the server did not say, and the caller then offers the save and
 * lets the server refuse it: the server is the authority, and a guess here could
 * only ever disable a button that would have worked.
 */
export const readLabelCount = async (): Promise<LabelCount | null> =>
  countIn((await request(BASE)) as { cap?: unknown; count?: unknown })

export const readLabel = (id: string) => request(`${BASE}/${id}`) as Promise<SavedLabel>

/** Whether this browser can change label `id`: it saved it, and still holds its token. */
export const canChangeLabel = (id: string): boolean => editTokenFor(id) !== undefined

/** The header that opens label `id` for changes, or none, which the server refuses. */
const tokenHeader = (id: string): Record<string, string> => {
  const token = editTokenFor(id)
  return token === undefined ? {} : { [EDIT_TOKEN_HEADER]: token }
}

/** Creates a label and keeps its edit token, which is handed back this once. */
export const createLabel = async (input: SavedLabelInput): Promise<SavedLabel> => {
  const { editToken, ...created } = (await request(BASE, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as SavedLabel & { editToken?: unknown }
  if (typeof editToken === 'string') holdLabel(created.id, editToken)
  return created
}

export const replaceLabel = (id: string, input: SavedLabelInput) =>
  request(`${BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    headers: tokenHeader(id),
  }) as Promise<SavedLabel>

/** Deletes a label, and lets go of its token once it is gone, however it went. */
export const deleteLabel = async (id: string): Promise<void> => {
  try {
    await request(`${BASE}/${id}`, { method: 'DELETE', headers: tokenHeader(id) })
  } catch (caught) {
    if (caught instanceof SavedLabelError && caught.isMissing) forgetLabels([id])
    throw caught
  }
  forgetLabels([id])
}
