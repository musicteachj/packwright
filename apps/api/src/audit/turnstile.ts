/**
 * Server-side verification of a Cloudflare Turnstile token, the bot check in front of the public
 * photo audit.
 *
 * **Sources: Cloudflare, "Validate the token" (developers.cloudflare.com/turnstile/get-started/
 * server-side-validation/) and "Testing" (developers.cloudflare.com/turnstile/troubleshooting/
 * testing/), both read on 2026-11-21.** The first gives the endpoint, `POST
 * https://challenges.cloudflare.com/turnstile/v0/siteverify`; the request fields `secret` and
 * `response` (both required) and `remoteip` (optional, "The visitor's IP address"); a token's
 * "Maximum length: 2048 characters" and its 300 seconds of validity; and the reply fields
 * `success`, `hostname` ("Hostname where the challenge was served"), `action` ("Custom action
 * identifier from client-side") and `error-codes`. A replayed or expired token is rejected with
 * `timeout-or-duplicate`. The second gives the always-passing test site key
 * `1x00000000000000000000AA`, the always-passing secret `1x0000000000000000000000000000000AA`
 * and the always-failing secret `2x0000000000000000000000000000000AA`; a test site key makes the
 * widget issue the token `XXXX.DUMMY.TOKEN.XXXX`.
 *
 * **Three outcomes, and only one lets a request through.** `failed` is a token that is wrong
 * (refused, for another host or action, empty, oversized); `unavailable` is Cloudflare that could
 * not be asked (a network error, a non-2xx status, an unreadable reply, a timeout). A caller
 * refuses both, and tells them apart only in what it says to the visitor. There is no outcome in
 * which a failure to ask is read as a pass.
 *
 * **The test secrets are answered here, with no request.** Cloudflare answers them itself, but a
 * development machine and the test suite should never depend on reaching it. Production refuses
 * these keys except on a local host: `apps/api/src/env.ts` accepts them in production only when
 * every `TURNSTILE_HOSTNAMES` entry is localhost or 127.0.0.1.
 *
 * **The local answer is looser than Cloudflare's own.** Its testing page says "Test secret keys:
 * Only accept the dummy token, reject real tokens." This module passes any token within the
 * length limit under the always-pass secret. Cloudflare's third test secret
 * (`3x0000000000000000000000000000000AA`, 'Returns "token already spent" error') is not answered
 * here and would reach Cloudflare, which still fails closed.
 *
 * **Nothing secret is logged.** A failure logs the error codes, hostname and action Cloudflare
 * reported, which describe the check and not the visitor's token or this server's secret.
 */

/** The request header the web app sends the widget's token in. */
export const TURNSTILE_HEADER = 'x-turnstile-token'

/**
 * The action the widget declares and siteverify must echo back. The web app declares the same
 * value in `apps/web/src/audit/turnstile.ts` on purpose: `label-core` is not the place for it and
 * the web app does not import the API, so a web test pins the client's copy to `'audit'`.
 */
export const TURNSTILE_ACTION = 'audit'

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Cloudflare's stated maximum token length. */
export const MAX_TOKEN_LENGTH = 2048

/** Cloudflare's published test keys (see the module note). */
export const TEST_SITE_KEY = '1x00000000000000000000AA'
export const TEST_SECRET_PASSES = '1x0000000000000000000000000000000AA'
export const TEST_SECRET_FAILS = '2x0000000000000000000000000000000AA'

const DEFAULT_TIMEOUT_MS = 5_000

export type TurnstileOutcome = 'passed' | 'failed' | 'unavailable'

export type VerifyTurnstile = (check: {
  token: string
  remoteIp: string | undefined
}) => Promise<TurnstileOutcome>

interface SiteverifyReply {
  success?: unknown
  hostname?: unknown
  action?: unknown
  'error-codes'?: unknown
}

export function siteverify(options: {
  secretKey: string
  hostnames: readonly string[]
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): VerifyTurnstile {
  const { secretKey, hostnames } = options
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch

  return async ({ token, remoteIp }) => {
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return 'failed'

    if (secretKey === TEST_SECRET_PASSES) return 'passed'
    if (secretKey === TEST_SECRET_FAILS) return 'failed'

    const form = new URLSearchParams({ secret: secretKey, response: token })
    if (remoteIp !== undefined) form.set('remoteip', remoteIp)

    let reply: SiteverifyReply
    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        console.warn(`turnstile: siteverify answered ${response.status}`)
        return 'unavailable'
      }
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        console.warn('turnstile: siteverify answered something other than a JSON object')
        return 'unavailable'
      }
      reply = body as SiteverifyReply
    } catch (error) {
      console.warn(
        `turnstile: siteverify could not be asked (${error instanceof Error ? error.name : 'error'})`,
      )
      return 'unavailable'
    }

    const hostname = typeof reply.hostname === 'string' ? reply.hostname : undefined
    if (
      reply.success === true &&
      hostname !== undefined &&
      hostnames.includes(hostname) &&
      reply.action === TURNSTILE_ACTION
    ) {
      return 'passed'
    }

    console.warn(
      `turnstile: token refused (error-codes ${JSON.stringify(reply['error-codes'] ?? [])}, ` +
        `hostname ${JSON.stringify(reply.hostname)}, action ${JSON.stringify(reply.action)})`,
    )
    return 'failed'
  }
}
