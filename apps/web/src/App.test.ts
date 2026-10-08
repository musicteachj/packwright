/**
 * The shell: what every route shares, mounted over the real route table.
 *
 * Mounted through `createAppRouter` with a memory history rather than through a
 * copy of the routes, so a route that falls out of the shell, loses its title or
 * stops being reachable fails here rather than in a browser.
 *
 * Attached to the document, because focus is part of what is under test and
 * jsdom only moves focus to elements that are in it.
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import App from './App.vue'
import { DEFAULT_TITLE } from './documentTitle'
import { createAppRouter } from './router'

const SAVED = {
  id: 'abc123',
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: { widthMm: 60, heightMm: 40, marginMm: 3 },
  data: { gtin: '036000291452' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
}

let wrapper: VueWrapper | undefined

async function mountAt(path: string) {
  // `/labels` lists, and the editor opens, through the API.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url === '/api/labels' ? { labels: [] } : SAVED),
    })),
  )
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  wrapper = mount(App, { global: { plugins: [router, createPinia()] }, attachTo: document.body })
  await flushPromises()
  return { router, wrapper }
}

// jsdom lays nothing out and does not implement scrolling; the skip link's
// scroll is asserted in `e2e/the-shell.spec.ts`, where there is a page to scroll.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('the masthead', () => {
  it('is a banner landmark, outside the main content', async () => {
    // It was mounted inside `<main>` once, so the page had no `banner` and a
    // skip-to-content jump landed on the nav rather than past it.
    const { wrapper } = await mountAt('/rules')
    expect(wrapper.find('main header').exists(), 'the masthead must not be inside main').toBe(false)
    expect(wrapper.find('header nav[aria-label="Sections"]').exists()).toBe(true)
    expect(wrapper.find('main#main h1').text()).toBe('The rules this tool encodes')
  })

  it('marks the current section, and only that one', async () => {
    const { wrapper } = await mountAt('/rules')
    const current = wrapper.findAll('header a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]!.text()).toBe('Rules')
  })

  it('marks no section on a page that is none of them', async () => {
    const { wrapper } = await mountAt('/no-such-page')
    // The premise: the masthead is there to leave by.
    expect(wrapper.find('header nav[aria-label="Sections"]').exists()).toBe(true)
    expect(wrapper.findAll('header a[aria-current="page"]')).toHaveLength(0)
  })

  it('stays mounted between reading routes, rather than being rebuilt per page', async () => {
    const { router, wrapper } = await mountAt('/rules')
    const before = wrapper.get('header').element
    await router.push('/design')
    await flushPromises()
    // The premise: the page did change.
    expect(wrapper.get('main#main h1').text()).not.toBe('The rules this tool encodes')
    expect(wrapper.get('header').element).toBe(before)
  })

  it('is not put above the editor, which owns its frame', async () => {
    const { wrapper } = await mountAt('/labels/new')
    expect(wrapper.find('nav[aria-label="Sections"]').exists()).toBe(false)
    expect(wrapper.findAll('main#main')).toHaveLength(1)
  })
})

describe('the window title', () => {
  for (const [path, title] of [
    ['/', DEFAULT_TITLE],
    ['/labels', 'Saved labels — packwright'],
    ['/audit', 'Audit a label — packwright'],
    ['/rules', 'Rules — packwright'],
    ['/design', 'Design — packwright'],
    ['/labels/new', 'New label — packwright'],
    ['/no-such-page', 'Page not found — packwright'],
  ] as const) {
    it(`names ${path}`, async () => {
      await mountAt(path)
      expect(document.title).toBe(title)
    })
  }
})

describe('the window title of a saved label', () => {
  it('is the label’s name, which the editor knows and its route does not', async () => {
    await mountAt('/labels/abc123')
    expect(document.title).toBe('Granola 340g — packwright')
  })

  it('goes back to the route’s own once the editor is left', async () => {
    const { router } = await mountAt('/labels/abc123')
    await router.push('/rules')
    await flushPromises()
    expect(document.title).toBe('Rules — packwright')
  })
})

describe('an address with no page', () => {
  it('says so inside the shell, naming the address', async () => {
    const { wrapper } = await mountAt('/labels/abc/edit?x=1')
    expect(wrapper.get('main#main h1').text()).toBe('There is no page here')
    expect(wrapper.get('[data-test="missing-path"]').text()).toBe('/labels/abc/edit?x=1')
  })
})

describe('focus', () => {
  it('starts nowhere in particular on the first load', async () => {
    await mountAt('/rules')
    expect(document.activeElement).toBe(document.body)
  })

  it('moves to the new page when a link is followed', async () => {
    const { wrapper } = await mountAt('/rules')
    const saved = wrapper.findAll('header a').find((link) => link.text() === 'Saved')!
    ;(saved.element as HTMLElement).focus()
    await saved.trigger('click')
    await flushPromises()
    // The premise: it navigated.
    expect(wrapper.get('main#main h1').text()).toBe('Saved labels')
    expect(document.activeElement?.id).toBe('main')
  })

  it('stays put when the editor moves between its own two addresses', async () => {
    // A first Save replaces /labels/new with /labels/:id, and must leave the
    // user on the Save button rather than throwing them to the top of the page.
    const { router, wrapper } = await mountAt('/labels/new')
    const name = wrapper.get('#field-label-name').element as HTMLInputElement
    name.focus()
    await router.replace('/labels/abc123')
    await flushPromises()
    expect(document.activeElement).toBe(name)
  })

  it('is reachable from the first Tab, through a skip link that moves it to the page', async () => {
    const { wrapper } = await mountAt('/rules')
    const focusable = document.querySelectorAll('a[href], button, input, select, textarea')
    const skip = wrapper.get('[data-test="skip-link"]')
    expect(focusable[0]).toBe(skip.element)

    await skip.trigger('click')
    expect(document.activeElement?.id).toBe('main')
  })
})
