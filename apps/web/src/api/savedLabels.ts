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
 */

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
}

const BASE = '/api/labels'

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body === undefined ? {} : { 'Content-Type': 'application/json' },
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
  /** Newest first. */
  readonly labels: SavedLabelSummary[]
  /** `null` where the server did not say; nothing then shows a figure it lacks. */
  readonly counted: LabelCount | null
  /** The server had more than one page to give, so `labels` is not all of them. */
  readonly truncated: boolean
}

/** As many as the cap, so one page is the whole list. */
const LIST_LIMIT = 20

/**
 * The cap and count from a list response, or `null` where the body does not
 * carry them — an older server, or something in front of it answering instead.
 */
const countIn = (answer: { cap?: unknown; count?: unknown }): LabelCount | null =>
  typeof answer.cap === 'number' && typeof answer.count === 'number'
    ? { cap: answer.cap, count: answer.count }
    : null

/**
 * The saved labels, newest first, in **one** request.
 *
 * The client used to follow the cursor to the end, up to forty serial round
 * trips, because stopping at the first page would have made the fifty-first
 * label unreachable with nothing to say so. The application now keeps at most
 * twenty, so the first page is everything there is — and if it ever is not,
 * `truncated` says so and the list view says it aloud, rather than the
 * walk carrying on in silence. A database from before the cap is the one case
 * that reaches it.
 *
 * One request also closes a hole the walk had: a label saved between two of its
 * page fetches sorted above the cursor and appeared on neither.
 */
export const listLabels = async (): Promise<LabelList> => {
  const answer = (await request(`${BASE}?limit=${LIST_LIMIT}`)) as {
    labels?: SavedLabelSummary[]
    nextBefore?: string
    cap?: unknown
    count?: unknown
  }
  return {
    labels: answer.labels ?? [],
    counted: countIn(answer),
    truncated: answer.nextBefore !== undefined,
  }
}

/**
 * The cap and the count alone, for the editor to know before it offers to save
 * a new label. A one-row page, since the figures come with every page.
 *
 * `null` where the server did not say, and the caller then offers the save and
 * lets the server refuse it: the server is the authority, and a guess here could
 * only ever disable a button that would have worked.
 */
export const readLabelCount = async (): Promise<LabelCount | null> =>
  countIn((await request(`${BASE}?limit=1`)) as { cap?: unknown; count?: unknown })

export const readLabel = (id: string) => request(`${BASE}/${id}`) as Promise<SavedLabel>

export const createLabel = (input: SavedLabelInput) =>
  request(BASE, { method: 'POST', body: JSON.stringify(input) }) as Promise<SavedLabel>

export const replaceLabel = (id: string, input: SavedLabelInput) =>
  request(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<SavedLabel>

export const deleteLabel = async (id: string): Promise<void> => {
  await request(`${BASE}/${id}`, { method: 'DELETE' })
}
