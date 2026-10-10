/**
 * Runs jobs a few at a time, and lets every job in flight finish whatever happens to another.
 *
 * Its own module because the first version got exactly this wrong. Four workers
 * under a bare `Promise.all` meant one call failing after its retries rejected
 * the whole run, and a top-level `await` that rejects exits the process without
 * waiting — so the three calls still in flight were billed and never written
 * down, and resuming paid for them again. That broke the one promise the runner
 * makes: no recorded answer paid for again. A failure is now caught where it
 * happens and reported at the end, beside the jobs that never started.
 */

export interface PoolOutcome<Job> {
  failed: { job: Job; error: unknown }[]
  /** Jobs not started because `shouldStop` said so. */
  notStarted: Job[]
}

export async function runPool<Job>(
  jobs: readonly Job[],
  run: (job: Job) => Promise<void>,
  options: { concurrency: number; shouldStop: () => boolean },
): Promise<PoolOutcome<Job>> {
  const queue = [...jobs]
  const failed: PoolOutcome<Job>['failed'] = []
  const worker = async () => {
    for (;;) {
      if (options.shouldStop()) return
      const job = queue.shift()
      if (job === undefined) return
      try {
        await run(job)
      } catch (error) {
        failed.push({ job, error })
      }
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, worker))
  return { failed, notStarted: queue }
}
