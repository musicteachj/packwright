/**
 * `/mcp`: the four tools of `server.ts`, mounted on this application.
 *
 * In front of them, in this order: the `Host` check, the `Origin` check, and two
 * rate limits. Behind them, `createMcpHandler`, which builds a fresh server per
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
 * What goes uncounted is cheap — no label is drawn — and bounded by the body
 * limit; a flood of it is the edge-level limit's to refuse (phase 8).
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
  /** The two allowances, or `false` for none. */
  limits?: McpLimits | false | undefined
  /** Where a refusal, or an `Origin`, is written down. */
  log?: ((line: string) => void) | undefined
}

/** A refusal's body, in the words the export limiter uses. */
const TOO_MANY = { error: 'Too many requests to /mcp — try again later' }

/** See the batch guard below. */
const ONE_CALL_PER_REQUEST = {
  error: 'Send one tool call per request — a batch may carry at most one tools/call',
}

export function createMcpRouter(options: McpRouterOptions = {}): Router {
  const { allowedHosts = [], allowedOrigins = [], limits, log = console.log } = options
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

  if (limits !== false && limits !== undefined) {
    // **A batch carries at most one tool call.** The allowances count requests, and
    // the older protocol lets one request carry up to a hundred messages, so a
    // batch of calls would be a hundred checks for the price of one — 6,000 an hour
    // against the 60 the limit and `docs/USE-FROM-YOUR-AI.md` promise. Neither
    // Claude client batches (Claude Code 2.1.169 sent one message per request,
    // observed 2026-10-10), and the newer protocol has no batches at all.
    router.use((request: Request, response: Response, next: NextFunction) => {
      if (toolCallsIn(request.body) > 1) {
        log(`mcp: refused a batch of tool calls, from ${request.ip ?? 'unknown'}`)
        response.status(400).json(ONE_CALL_PER_REQUEST)
        return
      }
      next()
    })

    const refuse = (tier: string) => (request: Request, response: Response) => {
      log(`mcp: refused over the ${tier} limit, from ${request.ip ?? 'unknown'}`)
      response.status(429).json(TOO_MANY)
    }
    // Two limiters, each skipping the other's callers, so neither can spend the
    // other's allowance, and both skipping whatever is not a tool call.
    router.use(
      rateLimit({
        windowMs: HOUR_MS,
        limit: limits.anthropicPerHour,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skip: (request) => toolCallsIn(request.body) === 0 || !isFromAnthropic(request.ip),
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
        skip: (request) => toolCallsIn(request.body) === 0 || isFromAnthropic(request.ip),
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
