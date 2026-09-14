import { describe, expect, it } from 'vitest'
import { databaseStatus } from './db'
import { withDatabase } from './testing/withDatabase'

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
