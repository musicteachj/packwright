import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { plexFontDirectory } from './renderPdf'

/**
 * The fonts have to be reachable from whatever is running.
 *
 * This exists because of a bug the entire suite missed. The font directory was
 * resolved four levels up from `src/labels/`, which is right from source and
 * wrong from the tsup bundle at `dist/server.js` — where it pointed outside the
 * repository altogether. Every test ran from source, so all 283 of them passed
 * while `npm start` answered the first export request with a 500 and an ENOENT.
 *
 * These assertions run against source. What actually closes the gap is the CI
 * step that builds the server and exercises the export against the artifact,
 * because that is the thing a container runs.
 */
describe('vendored fonts', () => {
  it('resolves a directory that exists', () => {
    expect(existsSync(plexFontDirectory())).toBe(true)
  })

  it.each([
    'IBMPlexMono-Regular.ttf',
    'IBMPlexMono-SemiBold.ttf',
    'IBMPlexSans-Regular.ttf',
    'IBMPlexSans-SemiBold.ttf',
  ])('has %s', (file) => {
    expect(existsSync(join(plexFontDirectory(), file))).toBe(true)
  })
})
