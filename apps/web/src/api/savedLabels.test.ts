import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editTokenFor, forgetLabels, heldLabels, holdLabel } from './heldLabels'
import {
  EDIT_TOKEN_HEADER,
  SavedLabelError,
  createLabel,
  deleteLabel,
  listLabels,
  readLabel,
  readLabelCount,
  replaceLabel,
} from './savedLabels'

const respond = (status: number, body?: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('not JSON')
      return body
    },
  } as unknown as Response)

/** Label ids as the server mints them: an ObjectId's 24 hex digits. */
const OLDER = '64b7f0000000000000000001'
const NEWER = '64b7f0000000000000000002'
const A_LABEL = { id: OLDER, name: 'X', labelType: 'gs1-retail', createdAt: 'a', updatedAt: 'b' }
const AN_INPUT = {
  name: 'X',
  labelType: 'gs1-retail',
  stock: { widthMm: 1, heightMm: 1, marginMm: 0 },
  data: {},
}

/** The headers a call to `fetch` sent, as a plain record. */
const headersOf = (call: unknown[] | undefined): Record<string, string> =>
  ((call?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>

/**
 * The error a call rejected with, and a failure if it did not reject at all.
 *
 * `.catch(e => e)` alone types as the union and, worse, passes quietly when the
 * call succeeds — which is the one outcome these cases exist to rule out.
 */
const rejection = (promise: Promise<unknown>): Promise<SavedLabelError> =>
  promise.then(
    () => {
      throw new Error('expected the call to reject, and it resolved')
    },
    (error: unknown) => error as SavedLabelError,
  )

afterEach(() => vi.unstubAllGlobals())
// jsdom's own storage, emptied so no test holds a label another one saved. The
// module's in-memory copy is emptied by forgetting what it holds.
beforeEach(() => {
  localStorage.clear()
  forgetLabels(heldLabels().map((label) => label.id))
})

describe('the saved-labels client', () => {
  it('asks about the labels this browser holds, in one request', async () => {
    // The server used to be asked for every label there was, which published
    // every link (`docs/security-review-2026-10-18.md`, finding 4).
    holdLabel(OLDER, 't1')
    holdLabel(NEWER, 't2')
    const fetchMock = respond(200, { labels: [A_LABEL], cap: 200, count: 7 })
    vi.stubGlobal('fetch', fetchMock)

    const list = await listLabels()

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/labels?ids=${NEWER},${OLDER}`,
    ])
    expect(list.counted).toEqual({ cap: 200, count: 7 })
  })

  it('asks about no label at all where this browser holds none', async () => {
    const fetchMock = respond(200, { labels: [], cap: 200, count: 7 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await listLabels()).toEqual({ labels: [], counted: { cap: 200, count: 7 } })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/labels')
  })

  it('lets go of a label the server no longer has', async () => {
    // Expired, or deleted from another tab: the server leaves it out of the
    // answer, and holding its token any longer would list nothing forever.
    holdLabel(NEWER, 't1')
    holdLabel(OLDER, 't2')
    vi.stubGlobal('fetch', respond(200, { labels: [A_LABEL], cap: 200, count: 1 }))
    await listLabels()
    expect(heldLabels().map((label) => label.id)).toEqual([OLDER])
  })

  it('lets go of nothing when the list could not be read', async () => {
    holdLabel(OLDER, 't1')
    vi.stubGlobal('fetch', respond(500, { error: 'The database is not answering.' }))
    await rejection(listLabels())
    expect(heldLabels().map((label) => label.id)).toEqual([OLDER])
  })

  it('lets go of nothing when an answer that succeeded lists nothing at all', async () => {
    // A 200 with no `labels` (an older server, or something in front of it
    // answering) is not a server saying every label is gone. Read as an empty
    // list, it let go of every token this browser held. Found by review.
    holdLabel(OLDER, 't1')
    vi.stubGlobal('fetch', respond(200, { cap: 200, count: 1 }))
    await listLabels()
    expect(heldLabels().map((label) => label.id)).toEqual([OLDER])
  })

  it('leaves out an id the server could not read, rather than fail every list', async () => {
    // The server refuses a whole list over one id it cannot read, so one bad
    // entry in storage failed the page on every visit. Found by review.
    holdLabel('not-an-object-id', 't1')
    holdLabel(OLDER, 't2')
    const fetchMock = respond(200, { labels: [A_LABEL], cap: 200, count: 1 })
    vi.stubGlobal('fetch', fetchMock)
    await listLabels()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`/api/labels?ids=${OLDER}`)
  })

  it('treats an answer with no labels as an empty list rather than as a failure', async () => {
    vi.stubGlobal('fetch', respond(200, {}))
    // And invents no figures the server did not give.
    expect(await listLabels()).toEqual({ labels: [], counted: null })
  })

  it('reads the cap and the count without naming a label', async () => {
    const fetchMock = respond(200, { labels: [], cap: 200, count: 200 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await readLabelCount()).toEqual({ cap: 200, count: 200 })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/labels')
  })

  it('has no count to give where the server did not send one', async () => {
    vi.stubGlobal('fetch', respond(200, { labels: [] }))
    expect(await readLabelCount()).toBeNull()
  })

  it('tells a refusal at the cap from any other', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'There are already 200 saved labels.' }))
    const error = await rejection(createLabel(AN_INPUT))
    expect(error.isAtCap).toBe(true)
    expect(error.message, 'the server’s sentence, as written').toBe(
      'There are already 200 saved labels.',
    )
    expect(new SavedLabelError('x', 400).isAtCap).toBe(false)
  })

  it('reads, creates, replaces and deletes against the right method and path', async () => {
    const fetchMock = respond(200, A_LABEL)
    vi.stubGlobal('fetch', fetchMock)

    await readLabel('abc')
    await createLabel(AN_INPUT)
    await replaceLabel('abc', AN_INPUT)
    await deleteLabel('abc')

    expect(
      fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${url}`),
    ).toEqual([
      'GET /api/labels/abc',
      'POST /api/labels',
      'PUT /api/labels/abc',
      'DELETE /api/labels/abc',
    ])
  })

  describe('the edit token', () => {
    it('is kept when a label is created, and not handed to the caller', async () => {
      vi.stubGlobal('fetch', respond(201, { ...A_LABEL, id: 'new', editToken: 'the-token' }))
      const created = await createLabel(AN_INPUT)
      expect(editTokenFor('new')).toBe('the-token')
      expect(created).not.toHaveProperty('editToken')
      expect(localStorage.getItem('packwright.savedLabels')).toContain('the-token')
    })

    it('is sent with a replace and a delete of that label', async () => {
      holdLabel('abc', 'the-token')
      const fetchMock = respond(200, A_LABEL)
      vi.stubGlobal('fetch', fetchMock)
      await replaceLabel('abc', AN_INPUT)
      await deleteLabel('abc')
      expect(headersOf(fetchMock.mock.calls[0])[EDIT_TOKEN_HEADER]).toBe('the-token')
      expect(headersOf(fetchMock.mock.calls[1])[EDIT_TOKEN_HEADER]).toBe('the-token')
      expect(headersOf(fetchMock.mock.calls[0])['Content-Type']).toBe('application/json')
    })

    it('is not sent with a read, and no other label’s is sent with a change', async () => {
      holdLabel('mine', 'the-token')
      const fetchMock = respond(200, A_LABEL)
      vi.stubGlobal('fetch', fetchMock)
      await readLabel('mine')
      await replaceLabel('theirs', AN_INPUT)
      expect(headersOf(fetchMock.mock.calls[0])).not.toHaveProperty(EDIT_TOKEN_HEADER)
      expect(headersOf(fetchMock.mock.calls[1])).not.toHaveProperty(EDIT_TOKEN_HEADER)
    })

    it('is let go once its label is deleted, or found already gone', async () => {
      holdLabel('deleted', 't1')
      holdLabel('missing', 't2')
      vi.stubGlobal('fetch', respond(204))
      await deleteLabel('deleted')
      vi.stubGlobal('fetch', respond(404, { error: 'Not found' }))
      await rejection(deleteLabel('missing'))
      expect(heldLabels()).toEqual([])
    })

    it('is kept when a delete is refused for any other reason', async () => {
      holdLabel('abc', 't1')
      vi.stubGlobal('fetch', respond(429, { error: 'Too many deletions.' }))
      await rejection(deleteLabel('abc'))
      expect(editTokenFor('abc')).toBe('t1')
    })

    it('tells a refusal for want of the token from any other', async () => {
      vi.stubGlobal(
        'fetch',
        respond(403, { error: 'This label can be changed only from the browser that saved it.' }),
      )
      const error = await rejection(replaceLabel('abc', AN_INPUT))
      expect(error.isNotYours).toBe(true)
      expect(error.message).toBe('This label can be changed only from the browser that saved it.')
    })
  })

  it('surfaces what the server said about a refusal', async () => {
    // The `detail` array is the same shape the export routes return, so a caller
    // can point at the offending field rather than showing "Invalid label
    // document" and leaving the user to guess which one.
    vi.stubGlobal(
      'fetch',
      respond(400, {
        error: 'Invalid label document',
        detail: [{ path: 'data.gtin', message: 'A GTIN-12 is exactly 12 digits' }],
      }),
    )

    const error = await createLabel(AN_INPUT).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SavedLabelError)
    expect((error as SavedLabelError).detail[0]?.path).toBe('data.gtin')
    expect((error as SavedLabelError).message).toBe('Invalid label document')
  })

  it('tells a label that is gone from a request the server could not read', async () => {
    vi.stubGlobal('fetch', respond(404, { error: 'Not found' }))
    expect((await rejection(readLabel('abc'))).isMissing).toBe(true)

    vi.stubGlobal('fetch', respond(500, { error: 'Internal server error' }))
    expect((await rejection(readLabel('abc'))).isMissing).toBe(false)
  })

  it('keeps the real failure when the body is not JSON', async () => {
    // A proxy or an error page does not send JSON, and failing to parse one must
    // not replace a 502 with a SyntaxError about an unexpected token.
    vi.stubGlobal('fetch', respond(502))
    const error = await rejection(listLabels())
    expect(error).toBeInstanceOf(SavedLabelError)
    expect(error.status).toBe(502)
    expect(error.message).toContain('502')
  })

  it('does not try to read a body from a 204', async () => {
    // `DELETE` answers 204 with nothing at all; asking for JSON throws.
    vi.stubGlobal('fetch', respond(204))
    await expect(deleteLabel('abc')).resolves.toBeUndefined()
  })
})
