import { describe, expect, it } from 'vitest'
import manifest from '../package.json' with { type: 'json' }

/**
 * Every module directory must have a subpath in the package manifest.
 *
 * `./symbology` was missing during phase 1 and found by review; `./layout`,
 * `./render` and `./templates` were then missing during phase 2 and found by
 * review again. Twice is a pattern, and the barrel-export guard could not catch
 * it — that one checks *within* a module, while this is about the manifest that
 * makes the module reachable at all.
 *
 * The list is written out rather than read from disk, because `label-core` may
 * not touch the filesystem. That makes it a checklist rather than a sweep: a new
 * module has to be added here, and the failure it prevents is the one where it
 * is added everywhere except the manifest.
 */
const MODULES = [
  'gs1',
  'geometry',
  'ghs',
  'layout',
  'render',
  'rules',
  'symbology',
  'templates',
  'types',
] as const

describe('package exports', () => {
  it('exposes the package root', () => {
    expect(manifest.exports['.']).toBe('./src/index.ts')
  })

  it.each(MODULES)('exposes ./%s', (name) => {
    const exports = manifest.exports as Record<string, string | undefined>
    expect(exports[`./${name}`]).toBe(`./src/${name}/index.ts`)
  })

  it('exposes nothing that does not resolve to a barrel', () => {
    // Guards the other direction: a subpath left behind after a rename would
    // point at a file that no longer exists.
    for (const target of Object.values(manifest.exports as Record<string, string>)) {
      expect(target).toMatch(/^\.\/src\/([a-z0-9]+\/)?index\.ts$/)
    }
  })
})
