/**
 * Loads `.env`, treating a blank variable in the environment as absent.
 *
 * `import 'dotenv/config'` will not overwrite a name that is already defined,
 * and **defined-but-empty counts as defined**. A shell that exports
 * `ANTHROPIC_API_KEY=` — which the one this was found in does — therefore
 * silences a perfectly correct `.env`, and the server reports vision extraction
 * as unconfigured while the developer looks at the key sitting in the file.
 * Found by running the fixture recorder, which refused to start for exactly
 * that reason.
 *
 * Blank-means-absent is not a new rule invented here. `env.ts` already applies
 * it to every field it parses, through `blankAsAbsent`, and gives the reason: an
 * ECS task definition that declares a variable with an empty value should read
 * as not having supplied it. This applies the same rule one step earlier, so the
 * two agree about what "absent" means.
 *
 * Scoped to the names `EnvSchema` knows about rather than sweeping every blank
 * variable in the process, because this file has no business deciding what an
 * empty `PATH` means.
 */

import dotenv from 'dotenv'
import { ENV_NAMES } from './env'

/**
 * Removes the names this server reads whose value is the empty string.
 *
 * Split out from the load so it can be tested without a file on disk, and
 * returns the names it removed so a test asserts what happened rather than what
 * did not.
 */
export function forgetBlanks(source: NodeJS.ProcessEnv): readonly string[] {
  const forgotten: string[] = []
  for (const name of ENV_NAMES) {
    if (source[name] === '') {
      delete source[name]
      forgotten.push(name)
    }
  }
  return forgotten
}

/**
 * Takes no argument, deliberately.
 *
 * It used to take a `source` for symmetry with `forgetBlanks`, and that was a
 * lie about half the function: `dotenv.config()` writes `process.env` whatever
 * is passed, so a caller handing in an object would have had its blanks
 * forgotten and its values ignored. The testable half is `forgetBlanks`, and
 * that is what the tests call.
 */
export function loadDotenv(): void {
  forgetBlanks(process.env)
  dotenv.config({ quiet: true })
}
