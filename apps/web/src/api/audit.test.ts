import { afterEach, describe, expect, it, vi } from 'vitest'
import { readGhsLabel } from './audit'
import type { LabelPhoto } from '../audit/normalisePhoto'

const PHOTO: LabelPhoto = { mediaType: 'image/jpeg', data: 'AAAA', widthPx: 100, heightPx: 80 }

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body } as unknown as Response)

afterEach(() => vi.unstubAllGlobals())

describe('asking the server to read a label', () => {
  it('sends the photograph and the regime, and nothing else', async () => {
    const fetching = respond({ extraction: { fields: {}, warnings: [] }, model: 'claude-opus-5' })
    vi.stubGlobal('fetch', fetching)

    await readGhsLabel(PHOTO, 'eu-clp')

    const [, init] = fetching.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      regime: 'eu-clp',
      image: { mediaType: 'image/jpeg', data: 'AAAA' },
    })
    // The pixel dimensions stay on this side. The server has no use for them
    // and sending them would invite something to start trusting them.
    expect(init.body).not.toContain('widthPx')
  })

  it('returns the reading and the model that answered', async () => {
    vi.stubGlobal(
      'fetch',
      respond({ extraction: { fields: {}, warnings: [] }, model: 'some-other-model' }),
    )
    const reading = await readGhsLabel(PHOTO, 'eu-clp')
    expect(reading.model).toBe('some-other-model')
  })

  it("keeps the server's account of a refusal rather than reducing it to a status", async () => {
    vi.stubGlobal(
      'fetch',
      respond(
        { error: 'Reading this image was declined', detail: ['No reason was given.'] },
        false,
        422,
      ),
    )
    await expect(readGhsLabel(PHOTO, 'eu-clp')).rejects.toMatchObject({
      message: 'Reading this image was declined',
      status: 422,
      detail: ['No reason was given.'],
    })
  })

  it('flattens the two shapes of detail the endpoint sends into one', async () => {
    // Zod issues arrive as `{ path, message }` for a bad body and plain strings
    // for everything else. One shape reaches the screen.
    vi.stubGlobal(
      'fetch',
      respond(
        {
          error: 'Invalid audit request',
          detail: [{ path: 'image.mediaType', message: 'Invalid option' }],
        },
        false,
        400,
      ),
    )
    await expect(readGhsLabel(PHOTO, 'eu-clp')).rejects.toMatchObject({
      detail: ['image.mediaType Invalid option'],
    })
  })

  it('survives a refusal that is not JSON at all', async () => {
    // A proxy or an error page. Failing to parse one must not replace the real
    // failure with a parse error.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <')
        },
      } as unknown as Response),
    )
    await expect(readGhsLabel(PHOTO, 'eu-clp')).rejects.toMatchObject({
      status: 502,
      message: 'The server refused the request (502).',
    })
  })

  it('carries the status through, so a caller can tell the refusals apart', async () => {
    // It used to expose `isUnconfigured`, reading 503 as "no key on the server".
    // The route also returns 503 when the vision service is rate limited, so the
    // getter was wrong half the time and had no caller to be wrong for. The
    // status is the fact; what it means is the server's sentence to tell.
    vi.stubGlobal('fetch', respond({ error: 'Vision extraction is not configured' }, false, 503))
    await expect(readGhsLabel(PHOTO, 'eu-clp')).rejects.toMatchObject({ status: 503 })

    vi.stubGlobal('fetch', respond({ error: 'The image is too large' }, false, 413))
    await expect(readGhsLabel(PHOTO, 'eu-clp')).rejects.toMatchObject({ status: 413 })
  })
})
