/**
 * `/mcp`: the four tools of `server.ts`, mounted on this application.
 *
 * In front of them, in this order: the `Host` check, the `Origin` check, a refusal
 * of batches, and two rate limits. Behind them, `createMcpHandler`, which builds a fresh server per
 * request and serves both protocol eras — `legacy: 'stateless'`, its default,
 * because Claude's connector client still speaks the older, `initialize`-era
 * protocol, and `'reject'` would lock it out.
 */

import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/express'
import { toNodeHandler } from '@modelcontextprotocol/node'
import {
  createMcpHandler,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
} from '@modelcontextprotocol/server'
import { Router, type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { BlockList, isIPv4 } from 'node:net'
import { createPackwrightMcpServer } from './server'

const HOUR_MS = 60 * 60 * 1000

/**
 * How many tool calls a request carries — what the allowances count.
 *
 * Not every request to `/mcp` is one. A client in the older protocol sends
 * `initialize` and `notifications/initialized` and usually `tools/list` before
 * its first call, and the newer one probes with `server/discover`; counting those
 * spent three or four of a Claude Code user's sixty an hour on every connection,
 * and the same from the shared allowance on every claude.ai conversation. Both
 * eras name a call `tools/call`.
 *
 * What goes uncounted is cheap, since no label is drawn, and a request carries one
 * message (`messagesIn`), so it gets at most one answer: the largest is
 * `tools/list`, about 25 kB. A flood of it is the edge-level limit's to refuse
 * (phase 8).
 *
 * A batch of more than one message is refused before this count is read, so it is
 * zero or one in practice. It still counts every call in a batch, so that guards
 * placed in another order could not make a batch of calls count as one.
 */
export function toolCallsIn(body: unknown): number {
  const messages: unknown[] = Array.isArray(body) ? body : [body]
  return messages.filter(
    (message) =>
      typeof message === 'object' &&
      message !== null &&
      (message as { method?: unknown }).method === 'tools/call',
  ).length
}

/**
 * How many JSON-RPC messages a request carries: a batch's length, and otherwise one.
 *
 * Only the older protocol's 2025-03-26 revision has batches; 2025-06-18 removed
 * them, and the newer protocol never had them. A batch is answered message by
 * message, so a hundred `tools/list` in 4.5 kB came back as 2.53 MB and counted as
 * nothing, which is why `/mcp` takes one message a request.
 */
export function messagesIn(body: unknown): number {
  return Array.isArray(body) ? body.length : 1
}

export interface McpLimits {
  /**
   * Tool calls an hour shared by everything arriving from Anthropic's outbound range.
   *
   * claude.ai, Claude Desktop, mobile and Cowork call a connector "from
   * Anthropic's infrastructure" (Claude's connector testing docs, read
   * 2026-10-10), so every user of them shares this address range and one
   * allowance. A per-address limit would cut all of them off at once, and
   * Claude's docs say a 429 breaks a connector — so this tier is high, and every
   * refusal is logged so it can be raised if it is ever reached.
   */
  anthropicPerHour: number
  /**
   * Tool calls an hour for each other address: clients such as Claude Code,
   * which call from the user's own machine.
   */
  perClientPerHour: number
}

/**
 * Starting points, to be tuned after launch (decision 2 in the MCP plan).
 *
 * A check costs a fraction of a millisecond and no money — 0.26 ms for the
 * conformant food label, measured 2026-10-10 — so the shared tier is set for a
 * crowd rather than for cost.
 */
export const DEFAULT_MCP_LIMITS: McpLimits = { anthropicPerHour: 5_000, perClientPerHour: 60 }

/**
 * Anthropic's outbound addresses: `160.79.104.0/21`, IPv4 only.
 *
 * From <https://platform.claude.com/docs/en/api/ip-addresses>, "Outbound IP
 * addresses", re-read 2026-10-10 — "the stable IP addresses that Anthropic uses
 * for outbound requests (for example, when making MCP tool calls to external
 * servers)". The IPv6 range on that page is inbound and does not belong here.
 */
const ANTHROPIC_OUTBOUND = new BlockList()
ANTHROPIC_OUTBOUND.addSubnet('160.79.104.0', 21, 'ipv4')

/**
 * Whether a caller's address is in Anthropic's outbound range.
 *
 * The address is Express's `request.ip`, which honours `TRUST_PROXY_HOPS` the
 * way the other limiters' does. A dual-stack listener reports an IPv4 caller as
 * `::ffff:160.79.104.1`, which is unwrapped first.
 */
export function isFromAnthropic(ip: string | undefined): boolean {
  if (ip === undefined) return false
  const unwrapped = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
  return isIPv4(unwrapped) && ANTHROPIC_OUTBOUND.check(unwrapped, 'ipv4')
}

export interface McpRouterOptions {
  /** Hostnames `/mcp` answers to, besides localhost. The public host, at phase 8. */
  allowedHosts?: readonly string[] | undefined
  /** `Origin` hostnames admitted, besides localhost. A request with none always passes. */
  allowedOrigins?: readonly string[] | undefined
  /**
   * The two allowances, or `false` for none. Absent means `DEFAULT_MCP_LIMITS`:
   * an endpoint left unlimited by an option nobody passed would be the one
   * nobody noticed.
   */
  limits?: McpLimits | false | undefined
  /** Where a refusal, or an `Origin`, is written down. */
  log?: ((line: string) => void) | undefined
}

const TOO_MANY = 'Too many tool calls to /mcp — try again later'
const ONE_MESSAGE_PER_REQUEST =
  'Send one message per request: /mcp does not accept JSON-RPC batches'

/**
 * A refusal as a JSON-RPC error, as the SDK's own `Host` and `Origin` refusals
 * on this route are, so a client can match it to what it asked. The request's
 * `id` where it has one; a batch, or a body with none, gets `null`.
 */
function refusal(body: unknown, message: string) {
  const id =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? ((body as { id?: unknown }).id ?? null)
      : null
  return { jsonrpc: '2.0', error: { code: -32000, message }, id }
}

/** What the guards below read, counted once per request. */
const toolCallsOf = (response: Response): number => response.locals.toolCalls as number

export function createMcpRouter(options: McpRouterOptions = {}): Router {
  const {
    allowedHosts = [],
    allowedOrigins = [],
    limits = DEFAULT_MCP_LIMITS,
    log = console.log,
  } = options
  const router = Router()

  // **Logged whenever one arrives, allowed or not.** Whether Anthropic's requests
  // carry an `Origin`, and which, is documented nowhere read on 2026-10-10, and
  // Claude's docs warn that an over-strict check rejects them. Non-browser
  // clients send none, so this is a quiet line, and the first connector test at
  // phase 8 reads it to settle the list.
  router.use((request: Request, _response: Response, next: NextFunction) => {
    const origin = request.get('Origin')
    if (origin !== undefined) {
      log(`mcp: Origin ${JSON.stringify(origin)} from ${request.ip ?? 'unknown'}`)
    }
    next()
  })

  // DNS rebinding protection, and the `Origin` check the specification requires.
  // Both answer 403 themselves. A request without an `Origin` passes, which is
  // every non-browser MCP client.
  router.use(hostHeaderValidation([...localhostAllowedHostnames(), ...allowedHosts]))
  router.use(originValidation([...localhostAllowedOrigins(), ...allowedOrigins]))

  // **One message per request.** The older protocol lets a request carry up to a
  // hundred messages, and each is answered: a batch of calls was a hundred checks
  // for the price of one, and a batch of `tools/list` 2.53 MB for 4.5 kB, counted
  // as nothing (security review of 2026-10-18, finding 5). Neither Claude client
  // batches (Claude Code 2.1.169 sent one message per request, observed 2026-10-10
  // and again 2026-10-18), batches left the protocol in 2025-06-18, and the newer
  // era never had them. Mounted whether or not the allowances are, since what it
  // bounds is the size of an answer rather than what is spent.
  router.use((request: Request, response: Response, next: NextFunction) => {
    const messages = messagesIn(request.body)
    if (messages > 1) {
      log(`mcp: refused a batch of ${messages} messages, from ${request.ip ?? 'unknown'}`)
      response.status(400).json(refusal(request.body, ONE_MESSAGE_PER_REQUEST))
      return
    }
    response.locals.toolCalls = toolCallsIn(request.body)
    next()
  })

  if (limits !== false) {
    const refuse = (tier: string) => (request: Request, response: Response) => {
      log(`mcp: refused over the ${tier} limit, from ${request.ip ?? 'unknown'}`)
      response.status(429).json(refusal(request.body, TOO_MANY))
    }
    // Two limiters, each skipping the other's callers, so neither can spend the
    // other's allowance, and both skipping whatever is not a tool call.
    router.use(
      rateLimit({
        windowMs: HOUR_MS,
        limit: limits.anthropicPerHour,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skip: (request, response) => toolCallsOf(response) === 0 || !isFromAnthropic(request.ip),
        keyGenerator: () => 'anthropic',
        handler: refuse('shared Anthropic'),
      }),
    )
    router.use(
      rateLimit({
        windowMs: HOUR_MS,
        limit: limits.perClientPerHour,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skip: (request, response) => toolCallsOf(response) === 0 || isFromAnthropic(request.ip),
        handler: refuse('per-client'),
      }),
    )
  }

  const node = toNodeHandler(createMcpHandler(createPackwrightMcpServer))

  // `express.json()` in `app.ts` has already read the body, within the 256 kB
  // every route here shares; handing it on keeps the adapter from reading a
  // stream that is already spent.
  router.all('/', (request: Request, response: Response, next: NextFunction) => {
    node(request, response, request.body).catch(next)
  })

  return router
}
