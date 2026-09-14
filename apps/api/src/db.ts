/**
 * The database connection, as a lifecycle the server owns.
 *
 * Separated from `app.ts` because `createApp` is built to be constructible
 * without any I/O — that is what lets its route tests run under supertest with
 * no port and no database. A connection opened inside it would make every one of
 * them need a `mongod` to ask a question about a PDF.
 */
import mongoose from 'mongoose'

export type DatabaseStatus = 'connected' | 'connecting' | 'disconnecting' | 'disconnected'

/** Mongoose reports `readyState` as a number; this is what the numbers mean. */
const STATES: Record<number, DatabaseStatus> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
}

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri)
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect()
}

export function databaseStatus(): DatabaseStatus {
  // An unrecognised state is reported as disconnected rather than as unknown:
  // `/health` turns this into a yes or no for a load balancer, and the safe
  // answer to "is this task serving?" is no.
  return STATES[mongoose.connection.readyState] ?? 'disconnected'
}
