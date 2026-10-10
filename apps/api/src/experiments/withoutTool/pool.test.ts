import { describe, expect, it } from 'vitest'
import { runPool } from './pool'

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('runPool', () => {
  it('lets every job in flight finish when one fails, and reports the failure', async () => {
    const finished: number[] = []
    const outcome = await runPool(
      [1, 2, 3, 4],
      async (job) => {
        if (job === 1) {
          await settle(1)
          throw new Error('the API gave up')
        }
        await settle(10)
        finished.push(job)
      },
      { concurrency: 4, shouldStop: () => false },
    )

    // Job 1 fails first, while 2, 3 and 4 are still in flight. A pool that let
    // the rejection through would resolve none of them — they were paid for and
    // would never be written down.
    expect(finished.sort()).toEqual([2, 3, 4])
    expect(outcome.failed.map((f) => f.job)).toEqual([1])
    expect(outcome.notStarted).toEqual([])
  })

  it('starts nothing once told to stop, and says what it did not start', async () => {
    const started: number[] = []
    const outcome = await runPool(
      [1, 2, 3, 4, 5],
      async (job) => {
        started.push(job)
      },
      { concurrency: 1, shouldStop: () => started.length >= 2 },
    )

    expect(started).toEqual([1, 2])
    expect(outcome.notStarted).toEqual([3, 4, 5])
  })
})
