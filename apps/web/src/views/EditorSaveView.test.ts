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
import { titleOverride } from '../documentTitle'

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

  it('carries an unsaved edit to /labels/new as unsaved work, not as a new baseline', async () => {
    // The question `docs/BACKLOG.md` asked about this route, answered. Leaving a
    // saved label for `/labels/new` keeps its fields — “start from this one” —
    // and `detach()` used to rebase the baseline onto them, so an edit nobody
    // had saved stopped counting as one. It survived only because the watcher
    // clears the name a line later and *that* difference kept the guards awake:
    // restore the name and the document read clean while still holding the edit.
    //
    // Asserted through the name on purpose. Anything else would pass on the
    // name's own dirtiness and never touch the edit underneath it.
    vi.stubGlobal('fetch', respond(SAVED))
    const router = testRouter('/labels/abc123')
    await router.isReady()
    mount(EditorView, { global: { plugins: [router], stubs: { RouterLink: true } } })
    await flushPromises()

    const store = useLabelDocumentStore()
    store.data.gtin = '036000291452'
    expect(store.isDirty, 'the premise: the edit has to register').toBe(true)

    await router.push('/labels/new')
    await flushPromises()
    expect(store.data.gtin, 'the fields come along — that part is deliberate').toBe('036000291452')

    store.savedName = SAVED.name
    expect(
      store.isDirty,
      'the edit is still unsaved with the name put back, because the name was never what was edited',
    ).toBe(true)
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

/**
 * Two ways a Save could write over a label the user was not looking at.
 *
 * Both found by review and recorded in `docs/BACKLOG.md` during the interface
 * phase. Each turns on the same rule the route watcher above already keeps for
 * `/labels/new`: the record a Save writes to is the one the URL names, and no
 * other.
 */
describe('a Save writes only to the label on screen', () => {
  /** A fetch answered per request, each held until the test lets it go. */
  const scripted = () => {
    const calls: Array<{ method: string; url: string; release: (answer: Answer) => void }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const answer = await new Promise<Answer>((release) =>
          calls.push({ method: init?.method ?? 'GET', url, release }),
        )
        return {
          ok: answer.status < 400,
          status: answer.status,
          json: async () => answer.body,
        } as unknown as Response
      }),
    )
    const next = async (method: string, url: string) => {
      await flushPromises()
      const call = calls.find((c) => c.method === method && c.url === url)
      expect(
        call,
        `expected ${method} ${url} among ${calls.map((c) => `${c.method} ${c.url}`).join(', ')}`,
      ).toBeDefined()
      calls.splice(calls.indexOf(call!), 1)
      return call!
    }
    return { calls, next }
  }
  type Answer = { status: number; body: unknown }

  const label = (id: string, name: string) => ({ ...SAVED, id, name })

  const openAt = async (path: string) => {
    const router = testRouter(path)
    await router.isReady()
    const wrapper = mount(EditorView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    return { router, wrapper }
  }

  it('does not leave a label attached when another one fails to open', async () => {
    // It said "That label no longer exists. The editor is showing a new
    // document." and left the previous label attached — so a Save from there
    // issued a PUT over the record the user believed they had left.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()
    expect(useLabelDocumentStore().savedId).toBe('abc123')

    await router.push('/labels/zzz999')
    ;(await fetches.next('GET', '/api/labels/zzz999')).release({
      status: 404,
      body: { error: 'Not found' },
    })
    await flushPromises()

    const store = useLabelDocumentStore()
    expect(wrapper.text()).toContain('That label no longer exists')
    expect(store.savedId, 'what the message says: a new document').toBeNull()
    expect(store.savedName, 'and the old one’s name does not come with it').toBe('')

    store.savedName = 'Something new'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('POST', '/api/labels')
    expect(save, 'a Save creates rather than replacing abc123').toBeDefined()
    expect(fetches.calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('lets go of the previous label whatever the reason the next one did not open', async () => {
    // A 500 is not "no longer exists", but the label on screen is still not the
    // one the URL names, and a Save from there would still have replaced the
    // label left behind.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()

    await router.push('/labels/zzz999')
    ;(await fetches.next('GET', '/api/labels/zzz999')).release({
      status: 500,
      body: { error: 'Internal server error' },
    })
    await flushPromises()

    expect(useLabelDocumentStore().savedId).toBeNull()
    // As a sentence, whatever the server sent: its text here has no full stop,
    // and appended raw it ran straight into the next sentence.
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'The label could not be opened: Internal server error. The editor is showing a new document.',
    )
  })

  it('does not attach the next label to a record saved while it was opening', async () => {
    // A Save still in flight when the user moved on resolved onto whatever was
    // on screen by then: `markSaved` attached the *next* label to the record
    // just written, and `router.replace` moved the URL back to it. The next
    // Save then wrote the next label's content over the first.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()

    const store = useLabelDocumentStore()
    store.savedName = 'Granola 340g, renamed'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('PUT', '/api/labels/abc123')

    await router.push('/labels/def456')
    ;(await fetches.next('GET', '/api/labels/def456')).release({
      status: 200,
      body: label('def456', 'Oat bar'),
    })
    await flushPromises()
    expect(store.savedId).toBe('def456')

    save.release({ status: 200, body: label('abc123', 'Granola 340g, renamed') })
    await flushPromises()

    expect(store.savedId, 'the label on screen stays attached to its own record').toBe('def456')
    expect(store.savedName).toBe('Oat bar')
    expect(router.currentRoute.value.path, 'and the URL stays where the user went').toBe(
      '/labels/def456',
    )
  })

  it('is not fooled by a round trip back to the URL it was made at', async () => {
    // The first fix compared the route's path, and a path can be returned to.
    // Save at `/labels/new`, open `abc123` while it is in flight, come back to
    // `/labels/new`: the late answer found the same path, attached abc123's
    // content to the record just created, and the next Save wrote it there.
    // Found by review of that fix.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/new')
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'A new label'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('POST', '/api/labels')

    await router.push('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()
    await router.push('/labels/new')
    await flushPromises()

    save.release({ status: 201, body: label('new001', 'A new label') })
    await flushPromises()

    expect(store.savedId, 'what is on screen is attached to nothing').toBeNull()
    expect(router.currentRoute.value.path).toBe('/labels/new')
  })

  it('is not fooled by a round trip through another saved label', async () => {
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'Granola 340g, renamed'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('PUT', '/api/labels/abc123')

    await router.push('/labels/def456')
    ;(await fetches.next('GET', '/api/labels/def456')).release({
      status: 200,
      body: label('def456', 'Oat bar'),
    })
    await flushPromises()
    await router.push('/labels/abc123')
    await flushPromises()
    // abc123 is being read again, and def456's content is still what is held.

    save.release({ status: 200, body: label('abc123', 'Granola 340g, renamed') })
    await flushPromises()

    expect(store.savedId, 'def456’s content is not marked as abc123, saved').toBe('def456')
    expect(store.savedName).toBe('Oat bar')
  })

  it('stays let go of when the user leaves for a new document while a Save is out', async () => {
    // Only a detach happens between the Save and its answer — no label opens —
    // which is the header's own Editor link. Unless letting go moves the
    // generation too, the late answer re-attached the document to the record
    // and moved the user back to a URL they had left.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'Granola 340g, renamed'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('PUT', '/api/labels/abc123')

    await router.push('/labels/new')
    await flushPromises()
    expect(store.savedId).toBeNull()

    save.release({ status: 200, body: label('abc123', 'Granola 340g, renamed') })
    await flushPromises()

    expect(store.savedId, 'still a new document').toBeNull()
    expect(router.currentRoute.value.path, 'still where the user went').toBe('/labels/new')
  })

  it('marks as saved what it sent, not what is on screen when it answers', async () => {
    // `markSaved` took its baseline when the Save answered, so an edit typed
    // while it was out was marked saved — the "Saved" mark and the leave guard
    // both said so — though the server had the document from before the edit.
    // Measured before this was written: `isDirty` false after such an edit.
    const fetches = scripted()
    const { wrapper } = await openAt('/labels/new')
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'A new label'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('POST', '/api/labels')

    store.data.gtin = '012000161155'
    await flushPromises()
    save.release({ status: 201, body: label('new001', 'A new label') })
    await flushPromises()

    expect(store.savedId, 'the Save still lands').toBe('new001')
    expect(store.isDirty, 'and the edit it never sent is still unsaved work').toBe(true)
    expect(wrapper.get('[data-save-state]').text()).toBe('Unsaved changes')
  })

  it('does not attach a label switched to another type while its Save was out', async () => {
    // A new label is not attached, so a type switch did not detach it — and so
    // did not move the generation either. The late answer attached the GHS
    // document now on screen to the GS1 record just created, and the next Save
    // would have turned that record into a GHS label. Found by review.
    const fetches = scripted()
    const { wrapper } = await openAt('/labels/new')
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'A retail label'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('POST', '/api/labels')

    store.labelType = 'ghs-chemical'
    await flushPromises()
    save.release({ status: 201, body: label('new001', 'A retail label') })
    await flushPromises()

    expect(store.savedId, 'the GHS document is not the GS1 record').toBeNull()
  })

  it('does not send the user back when its answer arrives while another label opens', async () => {
    // The generation moved only once the next label had loaded, so a Save that
    // answered during the wait passed — and its `router.replace` moved the URL
    // back to the label it saved, abandoning the one the user had asked for
    // with no message. A document is superseded when another is asked for,
    // not when the other arrives. Found by review.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'Granola 340g, renamed'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('PUT', '/api/labels/abc123')

    await router.push('/labels/def456')
    const opening = await fetches.next('GET', '/api/labels/def456')
    save.release({ status: 200, body: label('abc123', 'Granola 340g, renamed') })
    await flushPromises()
    expect(router.currentRoute.value.path, 'still where the user asked to go').toBe(
      '/labels/def456',
    )

    opening.release({ status: 200, body: label('def456', 'Oat bar') })
    await flushPromises()
    expect(store.savedId).toBe('def456')
  })

  it('keeps a rename typed while its Save was out, as unsaved', async () => {
    // `markSaved` wrote the server's name back into the field, so a rename made
    // while the Save was out was silently reverted to the name that was sent —
    // and, the name then matching, the label read as saved. The same defect as
    // an edit made during a Save, through the one field that fix missed.
    // Found by review.
    const fetches = scripted()
    const { wrapper } = await openAt('/labels/new')
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'Granola'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('POST', '/api/labels')

    store.savedName = 'Granola 340g'
    await flushPromises()
    save.release({ status: 201, body: label('new001', 'Granola') })
    await flushPromises()

    expect(store.savedName, 'the rename stands').toBe('Granola 340g')
    expect(store.isDirty, 'and is unsaved').toBe(true)
  })

  it('does not pull the user back into the editor after they have left it', async () => {
    // Leaving the editor moves no generation — the store still holds the same
    // document — so a Save that answered afterwards passed, and its redirect
    // dragged the user out of wherever they had gone. Found by review. The
    // answer is still recorded; it is only the navigation that is not the
    // Save's to make once the editor is gone.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/new')
    await flushPromises()
    const store = useLabelDocumentStore()
    store.savedName = 'A new label'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('POST', '/api/labels')

    wrapper.unmount()
    await router.push('/audit')
    save.release({ status: 201, body: label('new001', 'A new label') })
    await flushPromises()

    expect(router.currentRoute.value.path, 'still where the user went').toBe('/audit')
    expect(store.savedId, 'and the store still knows what it saved').toBe('new001')
  })

  it('reports a Save that failed after the user moved on, as the label it was for', async () => {
    // The first fix dropped it — so edits that were never written vanished with
    // no word, beside a header reading "Saved" for the next label. Found by
    // review, and worse than the defect it replaced: that one at least showed
    // the error, if over the wrong label. It is said now, naming its own.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()

    useLabelDocumentStore().savedName = 'Granola 340g, renamed'
    await flushPromises()
    await wrapper.get('[data-save]').trigger('click')
    const save = await fetches.next('PUT', '/api/labels/abc123')

    await router.push('/labels/def456')
    ;(await fetches.next('GET', '/api/labels/def456')).release({
      status: 200,
      body: label('def456', 'Oat bar'),
    })
    await flushPromises()

    save.release({ status: 500, body: { error: 'Internal server error' } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(
      '“Granola 340g, renamed” was not saved: Internal server error. Its changes were not written.',
    )
    expect(useLabelDocumentStore().savedId, 'and Oat bar is untouched').toBe('def456')
  })

  it('does not name the previous label while the next one is opening', async () => {
    // The panes went during the wait, but the header went on reading
    // "Granola 340g" and "Saved" — a document identity asserted about something
    // no longer on screen. Disabled, so nothing could be lost; still untrue.
    const fetches = scripted()
    const { router, wrapper } = await openAt('/labels/abc123')
    ;(await fetches.next('GET', '/api/labels/abc123')).release({
      status: 200,
      body: label('abc123', 'Granola 340g'),
    })
    await flushPromises()
    // The premise: the opened label is named, and says it is saved.
    const name = () => (wrapper.get('#field-label-name').element as HTMLInputElement).value
    expect(name()).toBe('Granola 340g')
    expect(wrapper.find('[data-save-state]').text()).toBe('Saved')
    expect(titleOverride()).toBe('Granola 340g')

    await router.push('/labels/def456')
    await flushPromises()
    expect(name(), 'the name field names nothing while def456 is read').toBe('')
    expect(wrapper.find('[data-save-state]').exists()).toBe(false)
    expect(wrapper.get('[data-save]').text()).toBe('Save')
    expect(titleOverride()).toBe('Opening a label')

    ;(await fetches.next('GET', '/api/labels/def456')).release({
      status: 200,
      body: label('def456', 'Oat bar'),
    })
    await flushPromises()
    expect(name()).toBe('Oat bar')
    expect(titleOverride()).toBe('Oat bar')
  })
})
