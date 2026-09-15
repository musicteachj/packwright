/**
 * The saved-labels API, in one place.
 *
 * The editor already reaches the server with a bare `fetch` to export a PDF, and
 * a second set of call sites doing the same would spread the id-to-URL shape and
 * the error handling across every component that saves. There is one of each
 * here instead.
 *
 * Nothing in this module knows what a label *is* — it moves whatever the server
 * describes. The shape of a label is decided by `schemas.ts` on the server and by
 * `label-core` in the browser, and a third opinion here would be the drift this
 * project keeps closing.
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

export const listLabels = () => request(BASE) as Promise<SavedLabelSummary[]>

export const readLabel = (id: string) => request(`${BASE}/${id}`) as Promise<SavedLabel>

export const createLabel = (input: SavedLabelInput) =>
  request(BASE, { method: 'POST', body: JSON.stringify(input) }) as Promise<SavedLabel>

export const replaceLabel = (id: string, input: SavedLabelInput) =>
  request(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<SavedLabel>

export const deleteLabel = async (id: string): Promise<void> => {
  await request(`${BASE}/${id}`, { method: 'DELETE' })
}
