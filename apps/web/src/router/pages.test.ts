import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './index'
import { PAGE_PATHS } from './pages'

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
