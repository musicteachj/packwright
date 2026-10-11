/**
 * The client is served from the bundle, and the API keeps its own routes.
 *
 * Every case here passes `webRoot` explicitly. Letting `createApp` resolve it
 * would make the suite depend on whether `apps/web/dist` exists: `GET /nope`
 * would 404 as JSON on a clean checkout and return `index.html` after a build,
 * which is a test that passes or fails on the state of a gitignored directory.
 * `scripts/verify-build.sh` covers the real resolution against the real artifact.
 */

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
// The client's own list, as the build writes it — read from its source rather
// than copied, so this suite cannot pass on a list the client does not have.
import { PAGE_PATHS } from '../../web/src/router/pages'
import { createApp } from './app'
import { matchesClientPage, PAGE_PATHS_FILE } from './clientPages'
import { resolveWebRoot } from './static'

const INDEX = '<!doctype html><html><body><div id="app"></div></body></html>'

let webRoot: string

beforeAll(() => {
  webRoot = mkdtempSync(join(tmpdir(), 'pw-web-'))
  writeFileSync(join(webRoot, 'index.html'), INDEX)
  writeFileSync(join(webRoot, PAGE_PATHS_FILE), JSON.stringify(PAGE_PATHS))
  mkdirSync(join(webRoot, 'assets'))
  writeFileSync(join(webRoot, 'assets', 'index-abc123.js'), 'export default 1\n')
})

const withClient = () => createApp({ enableLogging: false, webRoot })

describe('serving the built client', () => {
  it('answers / with the client', async () => {
    const response = await request(withClient()).get('/')
    expect(response.status).toBe(200)
    expect(response.text).toContain('<div id="app">')
  })

  it.each(['/labels/new', '/rules', '/labels/some-id'])(
    'answers the deep link %s with the client',
    async (route) => {
      // `createWebHistory` makes a deep link a real navigation: the browser asks
      // this server for the path, so without a fallback every route but / 404s
      // on refresh.
      const response = await request(withClient()).get(route)
      expect(response.status).toBe(200)
      expect(response.text).toContain('<div id="app">')
    },
  )

  it('serves a real asset as itself, not as the fallback', async () => {
    const response = await request(withClient()).get('/assets/index-abc123.js')
    expect(response.status).toBe(200)
    expect(response.text).toContain('export default 1')
  })
})

describe('what the fallback must never answer for', () => {
  it('leaves an unknown API route as a JSON 404', async () => {
    // A caller that mistypes a route needs its JSON 404, not a page of HTML
    // carrying a 200.
    const response = await request(withClient()).get('/api/labels/nope')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })

  it('leaves /health as the probe the load balancer reads', async () => {
    // A target group reading index.html as healthy would keep a broken task in
    // service.
    const response = await request(withClient()).get('/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })

  it('404s a missing asset rather than half-loading a page', async () => {
    // index.html with a 200 turns a broken asset reference into a page that
    // renders nothing and reports nothing.
    const response = await request(withClient()).get('/assets/missing.js')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })

  it('does not answer a POST with the client', async () => {
    const response = await request(withClient()).post('/labels/new').send({})
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })

  it.each(['/api', '/api/', '/api/labels/nope', '/mcp'])(
    'reserves %s for the server',
    async (path) => {
      // Bare `/api` is the case a prefix match on `'/api/'` misses — no trailing
      // slash, no match — and it is the one path most likely to be typed by hand.
      // It came back as the client with a 200 on it. `/mcp` here is switched off,
      // as `withClient` leaves it, and a client probing it needs the 404.
      const response = await request(withClient()).get(path)
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'Not found' })
    },
  )
})

describe('reserving by segment rather than by prefix', () => {
  it('hands the client an address that merely starts with a reserved word', async () => {
    // The other direction of the same bug: matching `'/health'` as a string
    // prefix swallowed `/health-report` into the server's JSON 404. It reaches the
    // client — which, as neither is one of its pages, shows its own 404.
    for (const route of ['/health-report', '/apiary']) {
      const response = await request(withClient()).get(route)
      expect(response.text, route).toContain('<div id="app">')
      expect(response.status, route).toBe(404)
    }
  })
})

describe('an address that is not a page', () => {
  it.each(['/labels/abc/edit', '/nope', '/rules/extra', '/labels/new/again'])(
    'answers %s 404, with the client, so the browser shows its own not-found page',
    async (path) => {
      const response = await request(withClient()).get(path)
      expect(response.status).toBe(404)
      expect(response.text).toContain('<div id="app">')
    },
  )

  it('still answers a page with a trailing slash, as the router does', async () => {
    expect((await request(withClient()).get('/rules/')).status).toBe(200)
  })

  it('answers HEAD the same way, so a link checker reads the truth', async () => {
    expect((await request(withClient()).head('/labels/abc/edit')).status).toBe(404)
    expect((await request(withClient()).head('/rules')).status).toBe(200)
  })

  it('refuses to start from a client build with no page list', () => {
    // A build from before the list existed, or one copied in part. Serving every
    // address 200, or every page 404, would each be silent.
    const bare = mkdtempSync(join(tmpdir(), 'pw-web-bare-'))
    writeFileSync(join(bare, 'index.html'), INDEX)
    expect(() => createApp({ enableLogging: false, webRoot: bare })).toThrow(
      /no readable routes\.json/,
    )
    writeFileSync(join(bare, PAGE_PATHS_FILE), '{"not":"a list"}')
    expect(() => createApp({ enableLogging: false, webRoot: bare })).toThrow(
      /not a list of page addresses/,
    )
  })
})

describe('matchesClientPage', () => {
  it.each([
    ['/', true],
    ['/labels', true],
    ['/labels/', true],
    ['/labels/new', true],
    ['/labels/64f1a2b3c4d5e6f708192a3b', true],
    ['/labels/abc/edit', false],
    ['/label', false],
    ['/rules/x', false],
    // One trailing slash is ignored, as the router ignores it; any other empty
    // segment is not, and the router sends these to its not-found page.
    ['//rules', false],
    ['/rules//', false],
    ['/labels//', false],
    // Case is ignored, as the router ignores it — `/Rules` loads the page.
    ['/Rules', true],
    ['/LABELS/new', true],
  ] as const)('%s → %s', (path, expected) => {
    expect(matchesClientPage(path, PAGE_PATHS)).toBe(expected)
  })
})

describe('caching', () => {
  it('lets a fingerprinted asset be cached, and the entry point not', async () => {
    // Vite changes the filename whenever the bytes change, which is what makes a
    // long immutable cache safe. Serving them at max-age=0 spends a revalidation
    // round trip per asset per load to be told nothing changed.
    const asset = await request(withClient()).get('/assets/index-abc123.js')
    expect(asset.headers['cache-control']).toMatch(/immutable/)

    // index.html names the current hashed bundles, so a stale copy pins a
    // browser to a deployment that no longer exists.
    const entry = await request(withClient()).get('/')
    expect(entry.headers['cache-control'] ?? '').not.toMatch(/immutable/)
  })
})

describe('with no client build', () => {
  it('still serves the API, and 404s as JSON', async () => {
    // The dev shape: Vite hosts the client on its own port and proxies across,
    // so this server has no client to serve and is not broken for want of one.
    const app = createApp({ enableLogging: false })
    expect((await request(app).get('/health')).status).toBe(200)

    const response = await request(app).get('/rules')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Not found' })
  })
})

describe('resolveWebRoot', () => {
  it('never returns a path that is not a client build', () => {
    // It cannot assert *which* candidate matches without knowing whether a build
    // has run — and `undefined` is a legitimate answer on a clean checkout — so
    // it asserts the invariant that holds either way: a returned path always has
    // the entry point in it. A resolver that guessed would fail here, and the
    // server would otherwise start, report itself as serving a client, and 404
    // every page.
    const resolved = resolveWebRoot()
    if (resolved === undefined) return
    expect(existsSync(join(resolved, 'index.html'))).toBe(true)
  })
})
