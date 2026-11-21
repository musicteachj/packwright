import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuditError,
  auditStatus,
  readGhsLabel,
  REFUSAL_REASONS,
  TURNSTILE_HEADER,
  UNAVAILABLE_REASONS,
} from './audit'
import { REFUSAL_COPY } from '../audit/refusalCopy'
import { TURNSTILE_ACTION } from '../audit/turnstile'
import type { LabelPhoto } from '../audit/normalisePhoto'

const PHOTO: LabelPhoto = { mediaType: 'image/jpeg', data: 'AAAA', widthPx: 100, heightPx: 80 }

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body } as unknown as Response)

afterEach(() => vi.unstubAllGlobals())

describe('asking the server to read a label', () => {
  it('sends the photograph and the regime, and nothing else', async () => {
    const fetching = respond({ extraction: { fields: {}, warnings: [] }, model: 'claude-opus-5-5' })
    vi.stubGlobal('fetch', fetching)

    await readGhsLabel(PHOTO, 'eu-clp', null)

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
    const reading = await readGhsLabel(PHOTO, 'eu-clp', null)
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
    await expect(readGhsLabel(PHOTO, 'eu-clp', null)).rejects.toMatchObject({
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
    await expect(readGhsLabel(PHOTO, 'eu-clp', null)).rejects.toMatchObject({
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
    await expect(readGhsLabel(PHOTO, 'eu-clp', null)).rejects.toMatchObject({
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
    await expect(readGhsLabel(PHOTO, 'eu-clp', null)).rejects.toMatchObject({ status: 503 })

    vi.stubGlobal('fetch', respond({ error: 'The image is too large' }, false, 413))
    await expect(readGhsLabel(PHOTO, 'eu-clp', null)).rejects.toMatchObject({ status: 413 })
  })
})

describe('the server status and the bot check', () => {
  it('reads the status the server gives', async () => {
    const fetching = respond({ available: true, reason: null, siteKey: 'site-key' })
    vi.stubGlobal('fetch', fetching)
    expect(await auditStatus()).toEqual({ available: true, reason: null, siteKey: 'site-key' })
    expect(fetching.mock.calls[0]![0]).toBe('/api/audit/status')

    vi.stubGlobal('fetch', respond({ available: false, reason: 'ip', siteKey: null }))
    expect(await auditStatus()).toEqual({ available: false, reason: 'ip', siteKey: null })
  })

  it('answers null where the status cannot be had or makes no sense', async () => {
    // The shape an earlier server gave, which this page no longer reads.
    vi.stubGlobal('fetch', respond({ available: true, keyRequired: false }))
    expect(await auditStatus()).toBeNull()
    vi.stubGlobal('fetch', respond({ available: false, reason: 'tired', siteKey: null }))
    expect(await auditStatus()).toBeNull()
    vi.stubGlobal('fetch', respond({ available: true, reason: null, siteKey: 42 }))
    expect(await auditStatus()).toBeNull()
    vi.stubGlobal('fetch', respond({ available: 'yes', reason: null, siteKey: null }))
    expect(await auditStatus()).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await auditStatus()).toBeNull()
  })

  it('answers null for any answer but a 200, whatever its body says', async () => {
    const good = { available: true, reason: null, siteKey: null }
    // The status limiter's own refusal, and a server error.
    vi.stubGlobal('fetch', respond(good, false, 429))
    expect(await auditStatus()).toBeNull()
    vi.stubGlobal('fetch', respond(good, false, 500))
    expect(await auditStatus()).toBeNull()
    vi.stubGlobal('fetch', respond(good, true, 204))
    expect(await auditStatus()).toBeNull()
  })

  it("sends the bot check's token, and no such header when there is none", async () => {
    const fetching = respond({ extraction: { fields: {}, warnings: [] }, model: 'claude-opus-5-5' })
    vi.stubGlobal('fetch', fetching)

    await readGhsLabel(PHOTO, 'eu-clp', 'tok')
    await readGhsLabel(PHOTO, 'eu-clp', null)

    const headersOf = (call: number) =>
      (fetching.mock.calls[call] as [string, RequestInit])[1].headers as Record<string, string>
    expect(TURNSTILE_HEADER).toBe('X-Turnstile-Token')
    expect(headersOf(0)['X-Turnstile-Token']).toBe('tok')
    expect(Object.keys(headersOf(1))).not.toContain('X-Turnstile-Token')
    for (const call of [0, 1]) {
      expect(Object.keys(headersOf(call)).map((name) => name.toLowerCase())).not.toContain(
        'x-audit-key',
      )
    }
  })

  it('keeps the reason a refusal gives, and only a reason it knows', async () => {
    vi.stubGlobal(
      'fetch',
      respond(
        { error: 'This network has used its live photo reads for now.', reason: 'ip' },
        false,
        429,
      ),
    )
    const refused = await readGhsLabel(PHOTO, 'eu-clp', 'tok').catch((caught: unknown) => caught)
    expect(refused).toBeInstanceOf(AuditError)
    expect(refused).toMatchObject({ status: 429, reason: 'ip' })

    vi.stubGlobal('fetch', respond({ error: 'Something else', reason: 'tired' }, false, 503))
    await expect(readGhsLabel(PHOTO, 'eu-clp', null)).rejects.toMatchObject({
      status: 503,
      reason: null,
    })

    vi.stubGlobal('fetch', respond({ error: 'Reading this image was declined' }, false, 422))
    await expect(readGhsLabel(PHOTO, 'eu-clp', null)).rejects.toMatchObject({ reason: null })
  })

  it("speaks the server's action and refusal reasons, which are copied on purpose", () => {
    // The web app does not import the API, and `label-core` is not the place for
    // its wire format, so these are declared again here (see `api/audit.ts` and
    // `apps/api/src/audit/refusals.ts`). This is the check on that duplication:
    // the action, the copy's keys and the two lists that parse the server's
    // answers, each against the server's names written out here.
    const refusals = ['bot-check', 'budget', 'ip', 'unavailable', 'unconfigured']
    expect(TURNSTILE_ACTION).toBe('audit')
    expect(Object.keys(REFUSAL_COPY).sort()).toEqual(refusals)
    expect([...REFUSAL_REASONS].sort()).toEqual(refusals)
    expect([...UNAVAILABLE_REASONS].sort()).toEqual(['budget', 'ip', 'unconfigured'])
  })
})
