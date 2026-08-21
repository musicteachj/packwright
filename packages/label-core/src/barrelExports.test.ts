import { describe, expect, it } from 'vitest'
import * as geometryBarrel from './geometry/index'
import * as pdp from './geometry/pdp'
import * as symbol from './geometry/symbol'
import * as units from './geometry/units'
import * as applicationIdentifiers from './gs1/applicationIdentifiers'
import * as checkDigit from './gs1/checkDigit'
import * as digitalLink from './gs1/digitalLink'
import * as elementString from './gs1/elementString'
import * as gs1Barrel from './gs1/index'
import * as engine from './layout/engine'
import * as layoutBarrel from './layout/index'
import * as renderBarrel from './render/index'
import * as toPDF from './render/toPDF'
import * as toSVG from './render/toSVG'
import * as constraints from './symbology/constraints'
import * as symbologyBarrel from './symbology/index'
import * as layOutSymbol from './symbology/layOutSymbol'
import * as templatesBarrel from './templates/index'
import * as upcA from './templates/upcA'

/**
 * Every public symbol must be reachable from its module's barrel.
 *
 * This exists because the gap it catches is invisible. `isNetQuantityZoneRequired`
 * was written, exported from `pdp.ts` and unit-tested via a direct import, so the
 * suite passed while the symbol was unreachable from `@packwright/label-core`. A
 * missing line in a barrel file produces no error anywhere until a consumer tries
 * to import it — and the consumer is usually a later phase.
 *
 * Checked against the modules as *loaded*, so it measures what a consumer can
 * actually import rather than what a regex can find in a file.
 *
 * Two limits, stated rather than left to look more complete than they are:
 *
 * 1. **Only runtime values.** Interfaces and type aliases are erased before this
 *    runs, so a type declared and never exported is not caught here. The reverse
 *    direction is covered by the compiler: `export type { Missing } from './x'`
 *    fails to build.
 * 2. **The module list is written out by hand.** An earlier version globbed the
 *    directory, which read as thorough but relied on `import.meta.glob` and so
 *    failed `tsc` under the deliberate `"types": []`. Explicit imports cost a
 *    line per file and are themselves type-checked — a deleted module fails to
 *    compile rather than silently dropping out of the sweep — but a *new* file
 *    still has to be added below.
 */

type Members = ReadonlyArray<readonly [file: string, module: object]>

const MODULES: ReadonlyArray<readonly [name: string, barrel: object, members: Members]> = [
  [
    'gs1',
    gs1Barrel,
    [
      ['applicationIdentifiers.ts', applicationIdentifiers],
      ['checkDigit.ts', checkDigit],
      ['digitalLink.ts', digitalLink],
      ['elementString.ts', elementString],
    ],
  ],
  [
    'geometry',
    geometryBarrel,
    [
      ['pdp.ts', pdp],
      ['symbol.ts', symbol],
      ['units.ts', units],
    ],
  ],
  ['layout', layoutBarrel, [['engine.ts', engine]]],
  [
    'render',
    renderBarrel,
    [
      ['toPDF.ts', toPDF],
      ['toSVG.ts', toSVG],
    ],
  ],
  [
    'symbology',
    symbologyBarrel,
    [
      ['constraints.ts', constraints],
      ['layOutSymbol.ts', layOutSymbol],
    ],
  ],
  ['templates', templatesBarrel, [['upcA.ts', upcA]]],
]

describe('barrel exports', () => {
  it.each(MODULES)(
    '%s/index.ts re-exports every symbol in its module',
    (_name, barrel, members) => {
      const reachable = new Set(Object.keys(barrel))
      const missing = members
        .flatMap(([file, module]) =>
          Object.keys(module)
            .filter((name) => name !== 'default' && !reachable.has(name))
            .map((name) => `${file}: ${name}`),
        )
        .sort()

      expect(missing).toEqual([])
    },
  )
})
