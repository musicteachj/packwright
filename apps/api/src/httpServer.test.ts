/**
 * The server's timeouts and its stop, against a real `http.Server` on a real port.
 *
 * A mock would prove only that the calls were made. What matters is what Node does
 * with them: whether a keep-alive socket left idle in a client's pool holds the
 * stop open, and whether a request that never ends does. Only a listening server
 * with a real client on the other end can answer either. Every grace period here
 * is a fraction of a second, never the production 25 s.
 */
import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configureTimeouts,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  shutDownGracefully,
} from './httpServer'

const servers: Server[] = []
const agents: http.Agent[] = []

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    if (server.listening) server.close()
  }
  for (const agent of agents.splice(0)) agent.destroy()
})

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; port: number }> {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port }
}

function keepAliveAgent(): http.Agent {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
  agents.push(agent)
  return agent
}

function get(port: number, agent: http.Agent): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', agent }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

const elapsedSince = (start: number) => performance.now() - start

describe('configureTimeouts', () => {
  it("outlasts the load balancer's idle timeout", async () => {
    const { server } = await listen((_req, res) => res.end())
    configureTimeouts(server)
    expect(server.keepAliveTimeout).toBe(130_000)
    expect(KEEP_ALIVE_TIMEOUT_MS).toBe(130_000)
    // Node's default is 60 s, under the keep-alive window; raised above it so the
    // clock on a request's headers never ends a connection keep-alive still allows.
    expect(server.headersTimeout).toBe(HEADERS_TIMEOUT_MS)
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout)
  })
})

describe('shutDownGracefully', () => {
  it('finishes the request in flight, then closes the database once', async () => {
    let arrived!: () => void
    const inFlight = new Promise<void>((resolve) => (arrived = resolve))
    let respond!: () => void
    const { server, port } = await listen((_req, res) => {
      respond = () => res.end('done')
      arrived()
    })
    const order: string[] = []
    const closeDatabase = vi.fn(async () => {
      order.push('database')
    })

    const answered = get(port, keepAliveAgent()).then((response) => {
      order.push('response')
      return response
    })
    await inFlight
    const stopped = shutDownGracefully(server, closeDatabase, 5_000)

    // Still serving it: the database is what the request is likely to be using.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(closeDatabase).not.toHaveBeenCalled()

    const released = performance.now()
    respond()
    expect(await answered).toEqual({ status: 200, body: 'done' })
    await stopped
    // Closed when the response finished, not when the grace period ran out, even
    // though the connection it came on was a keep-alive one.
    expect(elapsedSince(released)).toBeLessThan(1_000)
    expect(closeDatabase).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['response', 'database'])
  })

  it('does not wait for an idle keep-alive connection', async () => {
    const { server, port } = await listen((_req, res) => res.end('ok'))
    const agent = keepAliveAgent()
    expect(await get(port, agent)).toEqual({ status: 200, body: 'ok' })
    // The socket is back in the client's pool, open and idle, as a load balancer
    // holds its connections between requests.
    expect(Object.values(agent.freeSockets).flat()).toHaveLength(1)

    const closeDatabase = vi.fn(async () => undefined)
    const start = performance.now()
    await shutDownGracefully(server, closeDatabase, 10_000)
    expect(elapsedSince(start)).toBeLessThan(1_000)
    expect(closeDatabase).toHaveBeenCalledTimes(1)
  })

  it('gives up on a request that never ends after the grace period', async () => {
    let arrived!: () => void
    const inFlight = new Promise<void>((resolve) => (arrived = resolve))
    const { server, port } = await listen(() => arrived())
    // The client sees its connection dropped, which is the point of the cut-off.
    const dropped = get(port, keepAliveAgent()).then(
      () => 'answered',
      () => 'dropped',
    )
    await inFlight

    const closeDatabase = vi.fn(async () => undefined)
    const start = performance.now()
    await shutDownGracefully(server, closeDatabase, 100)
    expect(elapsedSince(start)).toBeLessThan(1_000)
    expect(closeDatabase).toHaveBeenCalledTimes(1)
    expect(await dropped).toBe('dropped')
  })
})
