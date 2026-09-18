import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SavedLabelError,
  createLabel,
  deleteLabel,
  listLabels,
  readLabel,
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
  it('follows the cursor to the end rather than stopping at the first page', async () => {
    // The list view is the only way to open a saved label, so stopping at the
    // first page would make the fifty-first unreachable with nothing on screen
    // to say the list had been cut short.
    const second = { ...A_LABEL, id: 'second' }
    const pages = [
      { labels: [A_LABEL], nextBefore: '2026-09-18T00:00:00.000Z_abc' },
      { labels: [second] },
    ]
    const fetchMock = vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => pages.shift() }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await listLabels()).toEqual([A_LABEL, second])
    expect(fetchMock.mock.calls).toHaveLength(2)
    // The cursor goes back as `before`, encoded, on the second call only.
    expect(String(fetchMock.mock.calls[1]![0])).toContain('before=')
  })

  it('treats a page with no labels as an empty list rather than as a failure', async () => {
    vi.stubGlobal('fetch', respond(200, {}))
    expect(await listLabels()).toEqual([])
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
    ).toEqual(['GET /api/labels', 'GET /api/labels/abc', 'POST /api/labels', 'PUT /api/labels/abc'])
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
