import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_TOKEN_LENGTH,
  SITEVERIFY_URL,
  TEST_SECRET_FAILS,
  TEST_SECRET_PASSES,
  siteverify,
} from './turnstile'

const SECRET = 'real-looking-secret-value'
const TOKEN = 'a-token-the-widget-issued'
const HOSTS = ['packwright.example']

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const verifierWith = (fetchImpl: typeof fetch, timeoutMs?: number) =>
  siteverify({
    secretKey: SECRET,
    hostnames: HOSTS,
    fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })

const okBody = { success: true, hostname: 'packwright.example', action: 'audit' }

afterEach(() => vi.restoreAllMocks())

describe('siteverify', () => {
  it('passes a token Cloudflare accepts for this host and action', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => reply(okBody))
    const outcome = await verifierWith(fetchImpl)({
      token: TOKEN,
      remoteIp: '203.0.113.9',
    })
    expect(outcome).toBe('passed')
    const [url, init] = fetchImpl.mock.calls[0]!
    if (init === undefined) throw new Error('no request init')
    expect(url).toBe(SITEVERIFY_URL)
    expect(init.method).toBe('POST')
    const form = new URLSearchParams(String(init.body))
    expect(form.get('secret')).toBe(SECRET)
    expect(form.get('response')).toBe(TOKEN)
    expect(form.get('remoteip')).toBe('203.0.113.9')
  })

  it('sends no remoteip when the address is unknown', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => reply(okBody))
    await verifierWith(fetchImpl)({ token: TOKEN, remoteIp: undefined })
    const init = fetchImpl.mock.calls[0]![1]
    expect(new URLSearchParams(String(init?.body)).has('remoteip')).toBe(false)
  })

  it('fails a token for another host', async () => {
    const fetchImpl = vi.fn(async () => reply({ ...okBody, hostname: 'opendoor.example' }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await verifierWith(fetchImpl as unknown as typeof fetch)({
        token: TOKEN,
        remoteIp: undefined,
      }),
    ).toBe('failed')
  })

  it('fails a token for another action', async () => {
    const fetchImpl = vi.fn(async () => reply({ ...okBody, action: 'sandbox' }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await verifierWith(fetchImpl as unknown as typeof fetch)({
        token: TOKEN,
        remoteIp: undefined,
      }),
    ).toBe('failed')
  })

  it('fails a refused token', async () => {
    const fetchImpl = vi.fn(async () =>
      reply({ success: false, 'error-codes': ['invalid-input-response'] }),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await verifierWith(fetchImpl as unknown as typeof fetch)({
        token: TOKEN,
        remoteIp: undefined,
      }),
    ).toBe('failed')
  })

  it('a token siteverify calls a duplicate fails', async () => {
    const fetchImpl = vi.fn(async () =>
      reply({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      await verifierWith(fetchImpl as unknown as typeof fetch)({
        token: TOKEN,
        remoteIp: undefined,
      }),
    ).toBe('failed')
  })

  describe("reads a fault on this server's side, or Cloudflare's, as unavailable", () => {
    const check = { token: TOKEN, remoteIp: undefined }

    it.each(['invalid-input-secret', 'missing-input-secret', 'internal-error', 'bad-request'])(
      '%s is unavailable and logged as an error',
      async (code) => {
        const fetchImpl = vi.fn(async () => reply({ success: false, 'error-codes': [code] }))
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('unavailable')
        expect(error).toHaveBeenCalledTimes(1)
        expect(String(error.mock.calls[0]![0])).toContain(code)
        expect(warn).not.toHaveBeenCalled()
        const logged = JSON.stringify(error.mock.calls)
        expect(logged).not.toContain(TOKEN)
        expect(logged).not.toContain(SECRET)
      },
    )

    it('is unavailable when a server code arrives beside an ordinary one', async () => {
      const fetchImpl = vi.fn(async () =>
        reply({ success: false, 'error-codes': ['invalid-input-response', 'internal-error'] }),
      )
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('unavailable')
      expect(error).toHaveBeenCalledTimes(1)
    })

    it.each(['invalid-input-response', 'timeout-or-duplicate'])(
      'an ordinary code (%s) is still failed and logged as a warning',
      async (code) => {
        const fetchImpl = vi.fn(async () => reply({ success: false, 'error-codes': [code] }))
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('failed')
        expect(warn).toHaveBeenCalledTimes(1)
        expect(error).not.toHaveBeenCalled()
      },
    )

    it.each([
      ['a string', 'internal-error'],
      ['an object', { code: 'invalid-input-secret' }],
      ['a number', 7],
      ['null', null],
    ])('a malformed error-codes (%s) does not throw and is failed', async (_name, codes) => {
      const fetchImpl = vi.fn(async () => reply({ success: false, 'error-codes': codes }))
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('failed')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(error).not.toHaveBeenCalled()
    })

    it('a reply with success true keeps its handling whatever its codes say', async () => {
      const passes = vi.fn(async () => reply({ ...okBody, 'error-codes': ['internal-error'] }))
      expect(await verifierWith(passes as unknown as typeof fetch)(check)).toBe('passed')

      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const otherHost = vi.fn(async () =>
        reply({ ...okBody, hostname: 'opendoor.example', 'error-codes': ['internal-error'] }),
      )
      expect(await verifierWith(otherHost as unknown as typeof fetch)(check)).toBe('failed')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(error).not.toHaveBeenCalled()
    })
  })

  it('fails an empty or oversized token without asking', async () => {
    const fetchImpl = vi.fn(async () => reply(okBody))
    const verify = verifierWith(fetchImpl as unknown as typeof fetch)
    expect(await verify({ token: '', remoteIp: undefined })).toBe('failed')
    expect(await verify({ token: 'x'.repeat(MAX_TOKEN_LENGTH + 1), remoteIp: undefined })).toBe(
      'failed',
    )
    expect(MAX_TOKEN_LENGTH + 1).toBe(2049)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("answers Cloudflare's test secrets itself, without a network call", async () => {
    const fetchImpl = vi.fn(async () => reply(okBody))
    const dummy = 'XXXX.DUMMY.TOKEN.XXXX'
    const passes = siteverify({
      secretKey: TEST_SECRET_PASSES,
      hostnames: HOSTS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const fails = siteverify({
      secretKey: TEST_SECRET_FAILS,
      hostnames: HOSTS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(await passes({ token: dummy, remoteIp: undefined })).toBe('passed')
    expect(await fails({ token: dummy, remoteIp: undefined })).toBe('failed')
    expect(await passes({ token: '', remoteIp: undefined })).toBe('failed')
    expect(await passes({ token: 'x'.repeat(MAX_TOKEN_LENGTH + 1), remoteIp: undefined })).toBe(
      'failed',
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  describe('fails closed when Cloudflare cannot be asked', () => {
    const check = { token: TOKEN, remoteIp: undefined }

    it('when the request rejects', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('network down')
      })
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('unavailable')
    })

    it('when Cloudflare answers 500', async () => {
      const fetchImpl = vi.fn(async () => reply({ success: true }, 500))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('unavailable')
    })

    it('when the answer is not JSON', async () => {
      const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 200 }))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('unavailable')
    })

    it.each([
      ['null', null],
      ['a string', 'ok'],
      ['an array', []],
    ])('when the answer is JSON but not an object (%s)', async (_name, body) => {
      const fetchImpl = vi.fn(async () => reply(body))
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await verifierWith(fetchImpl as unknown as typeof fetch)(check)).toBe('unavailable')
    })

    it('when it takes longer than timeoutMs', async () => {
      const fetchImpl = vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
          }),
      )
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await verifierWith(fetchImpl as unknown as typeof fetch, 50)(check)).toBe(
        'unavailable',
      )
    })
  })

  it('never logs the token or the secret', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bodies = [
      reply({ success: false, 'error-codes': ['invalid-input-response'] }),
      reply({}, 500),
      new Response('nope'),
    ]
    for (const body of bodies) {
      await verifierWith((async () => body) as unknown as typeof fetch)({
        token: TOKEN,
        remoteIp: undefined,
      })
    }
    await verifierWith((async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch)({ token: TOKEN, remoteIp: undefined })
    const logged = JSON.stringify(warn.mock.calls)
    expect(warn.mock.calls.length).toBeGreaterThan(0)
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain(SECRET)
  })
})
