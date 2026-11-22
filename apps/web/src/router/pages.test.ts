import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './index'
import { DESIGN_PATH, PAGE_PATHS, pagePaths } from './pages'

describe('PAGE_PATHS', () => {
  it('is every page the router registers, and nothing else', () => {
    // The server answers 404 to any address not listed, so a route added to the
    // router and not here would load in the app and be called missing by the
    // server — and one listed here and not routed would be called a page.
    const registered = new Set(
      createAppRouter(createMemoryHistory())
        .getRoutes()
        .map((route) => route.path)
        // The catch-all is the 404 itself, not a page.
        .filter((path) => !path.includes('pathMatch')),
    )
    expect([...registered].sort()).toEqual([...PAGE_PATHS].sort())
  })
})

describe('pagePaths', () => {
  // The build writes this, not `PAGE_PATHS`, so a build without the design
  // catalog has the server 404 `/design` as the client's router does.
  it('is every page when the design catalog is built', () => {
    expect(pagePaths(true)).toEqual(PAGE_PATHS)
  })

  it('leaves out the design catalog, and nothing else, when it is not', () => {
    expect(pagePaths(false)).not.toContain(DESIGN_PATH)
    expect(pagePaths(false)).toEqual(PAGE_PATHS.filter((path) => path !== DESIGN_PATH))
  })
})

describe('the design catalog route', () => {
  it('is not found when the catalog is not built', () => {
    const router = createAppRouter(createMemoryHistory(), { designCatalog: false })
    expect(router.resolve(DESIGN_PATH).name).toBe('not-found')
  })

  it('is the catalog when it is', () => {
    const router = createAppRouter(createMemoryHistory(), { designCatalog: true })
    expect(router.resolve(DESIGN_PATH).name).toBe('design')
  })

  it('registers the pages pagePaths(false) lists, and nothing else, without it', () => {
    const registered = createAppRouter(createMemoryHistory(), { designCatalog: false })
      .getRoutes()
      .map((route) => route.path)
      .filter((path) => !path.includes('pathMatch'))
    expect([...new Set(registered)].sort()).toEqual([...pagePaths(false)].sort())
  })
})

describe('which addresses the router treats as pages', () => {
  // The same table the server's `matchesClientPage` is tested against
  // (`apps/api/src/static.test.ts`), asked of the router itself. The server reads
  // pages the router's way — case and one trailing slash ignored, other empty
  // segments not — and if the router ever reads them differently, this fails.
  const router = createAppRouter(createMemoryHistory())
  it.each([
    ['/', true],
    ['/labels', true],
    ['/labels/', true],
    ['/labels/new', true],
    ['/labels/64f1a2b3c4d5e6f708192a3b', true],
    ['/labels/abc/edit', false],
    ['/label', false],
    ['/rules/x', false],
    ['//rules', false],
    ['/rules//', false],
    ['/labels//', false],
    ['/Rules', true],
    ['/LABELS/new', true],
  ] as const)('%s → %s', (path, isPage) => {
    expect(router.resolve(path).name !== 'not-found').toBe(isPage)
  })
})
