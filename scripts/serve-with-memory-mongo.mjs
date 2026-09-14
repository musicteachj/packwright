/**
 * The built server, given a database to boot against.
 *
 * `verify:build` and the browser suite both exercise the shipped artifact, and
 * the artifact refuses to start without `MONGODB_URI` — deliberately, because a
 * server that boots with nowhere to save reports healthy and then fails on the
 * first save. That leaves both checks needing a real database.
 *
 * A `mongod` from `mongodb-memory-server` rather than a container, so a clean
 * checkout with no Docker runs everything. The built `server.js` is imported
 * rather than reimplemented: this sets one environment variable and gets out of
 * the way, so what is verified is still the artifact.
 *
 * **Started here rather than in `playwright.config.ts`** so the database lives
 * and dies with the process Playwright already manages. Owned by the config, it
 * outlived its usefulness three ways: `--list` started one, a failed `webServer`
 * left one behind, and the global teardown ran before the server it served had
 * stopped.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'

const HOME = join(tmpdir(), 'packwright-e2e')
const dbPath = join(HOME, `mongo-${process.pid}`)
/**
 * The pid of the `mongod`, not of this script.
 *
 * **This is the process that holds the wiredTiger files.** An earlier version
 * swept on the wrapper's own pid, which is wrong in the one case the sweep
 * exists for: `mongod` is a child that outlives a wrapper killed outright, so a
 * later run would find the wrapper gone and delete the data directory out from
 * under a database still using it. Kept beside the directory rather than inside
 * it, because what is inside belongs to `mongod`.
 */
const ownerFile = `${dbPath}.owner`

mkdirSync(dbPath, { recursive: true })
// Claimed before the sweep runs and long before `mongod` exists, because another
// wrapper starting concurrently reads an unclaimed directory as abandoned. This
// script's own pid holds the claim until there is a `mongod` pid to hand it to,
// which is a few seconds during which the directory is very much in use.
writeFileSync(ownerFile, String(process.pid))

/** Whether a pid names a process that still exists. */
function alive(pid) {
  try {
    // Signal 0 tests for existence without delivering anything.
    process.kill(pid, 0)
    return true
  } catch (error) {
    // `EPERM` means it exists and belongs to somebody else — which is still
    // alive. Only `ESRCH` means gone.
    return error.code !== 'ESRCH'
  }
}

for (const entry of readdirSync(HOME)) {
  if (!entry.startsWith('mongo-') || entry.endsWith('.owner')) continue
  const directory = join(HOME, entry)
  // Not our own, which has just been created and has no owner recorded yet. Left
  // out, the sweep deletes the directory this run is about to start `mongod` in
  // and `create()` fails with ENOENT — which looks exactly like a clean failure
  // with no orphans, because nothing ever started.
  if (directory === dbPath) continue
  let owner
  try {
    owner = Number(readFileSync(`${directory}.owner`, 'utf8'))
  } catch {
    // No owner recorded: the `mongod` never got far enough to have a pid, so
    // there is nothing that could still be writing here.
  }
  if (owner !== undefined && alive(owner)) continue
  // No owner at all means the claim was never written, which only happens if a
  // run died between creating the directory and claiming it.
  rmSync(directory, { recursive: true, force: true })
  rmSync(`${directory}.owner`, { force: true })
}

/**
 * Registered before the database exists, not after.
 *
 * `create()` can take a while on its first run, and a signal arriving during it
 * used to hit Node's default disposition and leave the part-built directory
 * behind. `mongo` is still undefined then, which is what the optional call is
 * for.
 *
 * `uncaughtException` and `unhandledRejection` are here for the same reason the
 * `try` below is, and cover what it cannot: the server failing *after* its
 * module evaluates — an `EADDRINUSE` from `listen` is asynchronous, so it
 * reaches neither the `catch` nor any handler Node installs by default, and
 * took this process down around a running `mongod`.
 */
let mongo
let stopping = false
const stop = async (code = 0) => {
  if (stopping) return
  stopping = true
  await mongo?.stop().catch(() => undefined)
  rmSync(dbPath, { recursive: true, force: true })
  rmSync(ownerFile, { force: true })
  process.exit(code)
}
process.on('SIGTERM', () => void stop())
process.on('SIGINT', () => void stop())
process.on('SIGHUP', () => void stop())
process.on('uncaughtException', (error) => {
  console.error(error)
  void stop(1)
})
process.on('unhandledRejection', (error) => {
  console.error(error)
  void stop(1)
})

mongo = await MongoMemoryServer.create({ instance: { dbPath } })
process.env.MONGODB_URI = mongo.getUri()

// Handed from this script to the `mongod` it started: that is the process which
// actually holds the wiredTiger files, and it outlives this one when this one is
// killed outright.
const mongodPid = mongo.instanceInfo?.instance?.mongodProcess?.pid
if (mongodPid !== undefined) writeFileSync(ownerFile, String(mongodPid))

try {
  await import('../apps/api/dist/server.js')
} catch (error) {
  // A server that throws on the way up is what `verify:build` exists to catch,
  // and letting that take this process down would orphan the `mongod` by way of
  // the one failure most likely to reach it.
  console.error(error)
  await stop(1)
}
