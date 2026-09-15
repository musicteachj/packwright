/**
 * Saving a label, and refusing to lose one.
 *
 * The four Save states are the whole contract a user reads: whether this
 * document is stored, whether it has moved since, and which button writes a new
 * record rather than replacing one.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditorView from './EditorView.vue'
import { testRouter } from './editorTestRouter'
import { useLabelDocumentStore } from '../stores/labelDocument'

const SAVED = {
  id: 'abc123',
  name: 'Granola 340g',
  labelType: 'gs1-retail',
  stock: { widthMm: 90, heightMm: 50, marginMm: 3 },
  data: { gtin: '012000161155' },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
}

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body } as unknown as Response)

const mountAt = async (path: string) => {
  // `isReady` before mounting: the initial navigation is a promise, and the
  // editor reads `route.params.id` in `onMounted` — so without this it mounts
  // against the router's empty starting route and never opens the label.
  const router = testRouter(path)
  await router.isReady()
  const wrapper = mount(EditorView, {
    global: { plugins: [router], stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

describe('the Save control', () => {
  it('refuses to save a label with no name', async () => {
    // `name` is required by the schema, so an unnamed save is a round trip that
    // can only come back a 400.
    vi.stubGlobal('fetch', respond(SAVED))
    const wrapper = await mountAt('/labels/new')
    expect(wrapper.get('[data-save]').attributes('disabled')).toBeDefined()
  })

  it('creates a new label, and moves the URL to it', async () => {
    const fetchMock = respond(SAVED)
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountAt('/labels/new')
    useLabelDocumentStore().savedName = 'Granola 340g'
    await flushPromises()

    await wrapper.get('[data-save]').trigger('click')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(`${(init as RequestInit)?.method} ${url}`).toBe('POST /api/labels')
    // A reload should land on the same label, and a copied link should point at it.
    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/labels/abc123')
  })

  it('opens a saved label from the route, at the stock it was saved with', async () => {
    // The defect `docs/BACKLOG.md` says becomes reachable in this stage: an
    // export defaults a missing stock, so a label opened without its own prints
    // at the wrong physical size and says nothing about it.
    vi.stubGlobal('fetch', respond(SAVED))
    await mountAt('/labels/abc123')
    const store = useLabelDocumentStore()
    expect(store.savedId).toBe('abc123')
    expect(store.stock).toEqual({ widthMm: 90, heightMm: 50, marginMm: 3 })
  })

  it('reads Saved and is disabled until something changes, then replaces', async () => {
    const fetchMock = respond(SAVED)
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountAt('/labels/abc123')

    expect(wrapper.get('[data-save-state]').text()).toBe('Saved')
    expect(wrapper.get('[data-save]').attributes('disabled')).toBeDefined()

    useLabelDocumentStore().data.gtin = '036000291452'
    await flushPromises()

    expect(wrapper.get('[data-save-state]').text()).toBe('Unsaved changes')
    await wrapper.get('[data-save]').trigger('click')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls[1] ?? []
    expect(`${(init as RequestInit)?.method} ${url}`).toBe('PUT /api/labels/abc123')
  })

  it('offers Save as new only once there is something to save as', async () => {
    vi.stubGlobal('fetch', respond(SAVED))
    const fresh = await mountAt('/labels/new')
    expect(fresh.find('[data-save-as]').exists()).toBe(false)

    const opened = await mountAt('/labels/abc123')
    expect(opened.find('[data-save-as]').exists()).toBe(true)
  })

  it('lets go of a saved label when the route goes back to a new one', async () => {
    // **This was a way to overwrite somebody's label.** The store is a singleton
    // and the editor is the same component at both routes, so arriving at
    // `/labels/new` from a saved one left it attached — still reading "Saved",
    // and the next edit followed by Save issued a PUT over the record the user
    // thought they had navigated away from. The header's own Editor link does
    // exactly that navigation.
    vi.stubGlobal('fetch', respond(SAVED))
    const router = testRouter('/labels/abc123')
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(useLabelDocumentStore().savedId).toBe('abc123')

    await router.push('/labels/new')
    await flushPromises()

    expect(useLabelDocumentStore().savedId, 'Save must create, not replace').toBeNull()
    expect(useLabelDocumentStore().savedName, 'a name belongs to the record it was given to').toBe(
      '',
    )
    expect(wrapper.find('[data-save-state]').exists()).toBe(false)
  })

  it('says so when a label no longer exists rather than showing someone else’s', async () => {
    vi.stubGlobal('fetch', respond({ error: 'Not found' }, false, 404))
    const wrapper = await mountAt('/labels/gone')
    expect(wrapper.find('[role="alert"]').text()).toContain('no longer exists')
  })

  it('reports why the server refused a save, field by field', async () => {
    vi.stubGlobal(
      'fetch',
      respond(
        {
          error: 'Invalid label document',
          detail: [{ path: 'data.gtin', message: 'exactly 12 digits' }],
        },
        false,
        400,
      ),
    )
    const wrapper = await mountAt('/labels/new')
    useLabelDocumentStore().savedName = 'Granola'
    await flushPromises()

    await wrapper.get('[data-save]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('data.gtin')
  })
})
