/**
 * The HTTP server's timeouts, and how it stops.
 *
 * **Keep-alive outlasts the load balancer.** The load balancer holds idle
 * connections to this server for up to 120 s and reuses them. If Node closes one
 * first (its default is 5 s), a request the balancer has just sent down it meets a
 * closed socket and the visitor gets a 502 nobody can reproduce. So Node keeps an
 * idle connection for 130 s, past the balancer, and the balancer is always the side
 * that closes it. `headersTimeout` (Node's default is 60 s) is raised above it, the
 * standing advice for Node behind a load balancer, so that the clock on a request's
 * headers can never end a connection the keep-alive window still allows.
 *
 * **The stop finishes what it can, then lets go.** On SIGTERM the server stops
 * accepting connections, closes the ones that are idle (a balancer's pooled sockets
 * would otherwise hold the stop open for the whole keep-alive window), lets the
 * requests in flight finish, closing each connection as its request does, and only
 * then closes the database they were using. A
 * request still running after the grace period has its connection closed under it.
 *
 * **Why 25 s can sit under the 60 s photo read.** ECS deregisters the task from the
 * target group, and waits out the deregistration delay (about 90 s, spec Phase 2),
 * before it sends SIGTERM, so no new request reaches a stopping task and the reads in
 * flight normally finish long before the signal. A read still running at the 25 s
 * cut-off is dropped and keeps its reservation in the spend ledger: over-counted,
 * never under-counted. 25 s leaves the rest of ECS's 30 s stop timeout for the
 * database to close before the task is killed. Neither figure changes for the other.
 */
import type { Server } from 'node:http'

/** Past the load balancer's 120 s idle timeout, so the balancer closes first. */
export const KEEP_ALIVE_TIMEOUT_MS = 130_000

/** Above the keep-alive window, so a reused connection is not cut short of it. */
export const HEADERS_TIMEOUT_MS = 131_000

/** How long a stop waits for requests in flight, inside ECS's 30 s stop timeout. */
export const SHUTDOWN_GRACE_MS = 25_000

/** How often a stop closes the connections whose requests have finished. */
const IDLE_SWEEP_MS = 100

export function configureTimeouts(server: Server): void {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS
  server.headersTimeout = HEADERS_TIMEOUT_MS
}

/**
 * Stops accepting, finishes the requests in flight for up to `graceMs`, then
 * closes the database, once. Rejects only if the server would not close, and
 * closes the database even then.
 */
export async function shutDownGracefully(
  server: Server,
  closeDatabase: () => Promise<void>,
  graceMs: number = SHUTDOWN_GRACE_MS,
): Promise<void> {
  const closed = new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  )
  server.closeIdleConnections()
  // Node does not close a keep-alive connection when the request in flight on it
  // finishes, even after `close()`: it answers `Connection: keep-alive` and holds
  // the socket for the rest of the keep-alive window. Without this sweep a stop
  // with any request in flight waited out the whole grace period.
  const sweep = setInterval(() => server.closeIdleConnections(), IDLE_SWEEP_MS)
  // Unref'd, so a stop that finished early is not held open by its own timers.
  const deadline = setTimeout(() => server.closeAllConnections(), graceMs)
  sweep.unref()
  deadline.unref()
  try {
    await closed
  } finally {
    clearInterval(sweep)
    clearTimeout(deadline)
    await closeDatabase()
  }
}
