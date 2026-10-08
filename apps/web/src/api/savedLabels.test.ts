import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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

const A_LABEL = { id: '1', name: 'X', labelType: 'gs1-retail', createdAt: 'a', updatedAt: 'b' }

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

describe('the saved-labels client', () => {
  it('fetches the list once, a page as large as the cap', async () => {
    // It used to follow the cursor to the end, up to forty serial requests. The
    // application keeps at most twenty labels now, so one page is all of them.
    const fetchMock = respond(200, { labels: [A_LABEL], cap: 20, count: 1 })
    vi.stubGlobal('fetch', fetchMock)

    expect(await listLabels()).toEqual({
      labels: [A_LABEL],
      counted: { cap: 20, count: 1 },
      truncated: false,
    })
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/labels?limit=20'])
  })

  it('says the list was cut short when the server had another page', async () => {
    // Only a database from before the cap can hold more than a page. The walk
    // would have fetched it; one request reports it instead, and does not follow.
    const fetchMock = respond(200, {
      labels: [A_LABEL],
      cap: 20,
      count: 25,
      nextBefore: '2026-09-18T00:00:00.000Z_abc',
    })
    vi.stubGlobal('fetch', fetchMock)

    const list = await listLabels()
    expect(list.truncated).toBe(true)
    expect(list.counted).toEqual({ cap: 20, count: 25 })
    expect(fetchMock.mock.calls, 'and does not go after the rest').toHaveLength(1)
  })

  it('treats a page with no labels as an empty list rather than as a failure', async () => {
    vi.stubGlobal('fetch', respond(200, {}))
    // And invents no figures the server did not give.
    expect(await listLabels()).toEqual({ labels: [], counted: null, truncated: false })
  })

  it('reads the cap and the count from a one-row page', async () => {
    const fetchMock = respond(200, { labels: [A_LABEL], cap: 20, count: 20 })
    vi.stubGlobal('fetch', fetchMock)
    expect(await readLabelCount()).toEqual({ cap: 20, count: 20 })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/labels?limit=1')
  })

  it('has no count to give where the server did not send one', async () => {
    vi.stubGlobal('fetch', respond(200, { labels: [] }))
    expect(await readLabelCount()).toBeNull()
  })

  it('tells a refusal at the cap from any other', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'There are already 20 saved labels.' }))
    const error = await rejection(
      createLabel({
        name: 'X',
        labelType: 'gs1-retail',
        stock: { widthMm: 1, heightMm: 1, marginMm: 0 },
        data: {},
      }),
    )
    expect(error.isAtCap).toBe(true)
    expect(error.message, 'the server’s sentence, as written').toBe(
      'There are already 20 saved labels.',
    )
    expect(new SavedLabelError('x', 400).isAtCap).toBe(false)
  })

  it('lists, reads, creates, replaces and deletes against the right method and path', async () => {
    const fetchMock = respond(200, [A_LABEL])
    vi.stubGlobal('fetch', fetchMock)

    await listLabels()
    await readLabel('abc')
    await createLabel({
      name: 'X',
      labelType: 'gs1-retail',
      stock: { widthMm: 1, heightMm: 1, marginMm: 0 },
      data: {},
    })
    await replaceLabel('abc', {
      name: 'X',
      labelType: 'gs1-retail',
      stock: { widthMm: 1, heightMm: 1, marginMm: 0 },
      data: {},
    })

    expect(
      fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${url}`),
    ).toEqual([
      'GET /api/labels?limit=20',
      'GET /api/labels/abc',
      'POST /api/labels',
      'PUT /api/labels/abc',
    ])
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

    const error = await createLabel({
      name: 'X',
      labelType: 'gs1-retail',
      stock: { widthMm: 1, heightMm: 1, marginMm: 0 },
      data: {},
    }).catch((e: unknown) => e)
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
