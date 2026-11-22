import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  connectToDatabase,
  databaseStatus,
  disconnectFromDatabase,
  MONGO_MAX_POOL_SIZE,
} from './db'
import { withDatabase } from './testing/withDatabase'

describe('connectToDatabase', () => {
  let server: MongoMemoryServer

  beforeAll(async () => {
    server = await MongoMemoryServer.create()
    await connectToDatabase(server.getUri('packwright'))
  }, 120_000)

  afterAll(async () => {
    await disconnectFromDatabase()
    await server?.stop()
  })

  it('keeps a small connection pool', () => {
    // The driver's default is 100 connections per task, and a shared Atlas tier
    // caps them across the cluster. Read from the client the connection opened, so
    // this fails if the option stops reaching the driver.
    expect(mongoose.connection.getClient().options.maxPoolSize).toBe(MONGO_MAX_POOL_SIZE)
    expect(MONGO_MAX_POOL_SIZE).toBe(10)
  })
})

describe('databaseStatus with a connection', () => {
  withDatabase()

  it('reports a live connection as connected', () => {
    expect(databaseStatus()).toBe('connected')
  })
})

describe('databaseStatus without a connection', () => {
  // The state `/health` exists to notice. With MONGODB_URI required a booted
  // server has a database; one lost afterwards is what an ALB needs told, and
  // `readyState` 0 is how mongoose says so.
  //
  // In its own block: tearing a connection down mid-file to watch the teardown
  // would leave every later test in that file without a database.
  it('reports disconnected', () => {
    expect(databaseStatus()).toBe('disconnected')
  })
})
