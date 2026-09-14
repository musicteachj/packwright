/**
 * A real MongoDB, started per test file.
 *
 * `mongodb-memory-server` runs an actual `mongod` against a temporary directory,
 * so the model is exercised by the database it will meet in production rather
 * than by a mock of it. A mocked Mongoose would prove the tests agree with
 * themselves; the questions worth asking here are whether the schema stores what
 * it claims and whether a document survives a round trip, and neither can be
 * answered without a server.
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll } from 'vitest'

export function withDatabase(): void {
  let server: MongoMemoryServer

  // The binary is fetched by mongodb-memory-server's postinstall during
  // `npm ci`, so this is a start rather than a download — but a cold CI cache
  // would make it both, and a default 5s hook timeout is not enough for that.
  beforeAll(async () => {
    server = await MongoMemoryServer.create()
    await mongoose.connect(server.getUri())
  }, 120_000)

  // Between tests rather than between files. A collection left populated makes a
  // list assertion depend on which tests ran before it, which is how a suite
  // starts passing in one order and failing in another.
  afterEach(async () => {
    await mongoose.connection.db?.dropDatabase()
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await server?.stop()
  })
}
