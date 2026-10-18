import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetLabels, heldLabels, holdLabel } from '../api/heldLabels'
import LabelsView from './LabelsView.vue'
import { withAnnouncer } from './withAnnouncer'

const stubs = { RouterLink: { template: '<a><slot /></a>' } }
const rows = [
  {
    id: '64b7f0000000000000000001',
    name: 'Granola 340g',
    labelType: 'gs1-retail',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  },
  {
    id: '64b7f0000000000000000002',
    name: 'Acetone 5L',
    labelType: 'ghs-chemical',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
]

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body } as unknown as Response)

beforeEach(() => {
  setActivePinia(createPinia())
  // This browser holds both rows, as it would had it saved them.
  localStorage.clear()
  forgetLabels(heldLabels().map((label) => label.id))
  holdLabel('64b7f0000000000000000002', 'token-2')
  holdLabel('64b7f0000000000000000001', 'token-1')
})
afterEach(() => vi.unstubAllGlobals())

// The list endpoint answers `{ cap, count, labels }` for the ids it is asked
// about. `listLabels` unwraps it, so these stubs speak the server's shape rather
// than the function's.
const mountList = async () => {
  // Beside the root's announcer, so what is asserted is what is heard.
  const wrapper = mount(withAnnouncer(LabelsView), { global: { stubs } })
  await flushPromises()
  return wrapper
}

const heard = (wrapper: VueWrapper) => wrapper.get('[aria-live]').text()

describe('the saved labels list', () => {
  it('lists what the server returned, named by kind', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows }))
    const wrapper = await mountList()
    expect(wrapper.text()).toContain('Granola 340g')
    expect(wrapper.text()).toContain('GHS chemical')
  })

  it('says how to make the first one when there are none', async () => {
    // An empty list and a failed request look identical to a reader unless the
    // page distinguishes them, and "nothing here" is the wrong answer to "the
    // request failed".
    vi.stubGlobal('fetch', respond({ labels: [] }))
    const wrapper = await mountList()
    expect(wrapper.text()).toContain('Nothing saved in this browser yet')
  })

  it('reports a failure instead of showing an empty list', async () => {
    vi.stubGlobal('fetch', respond({ error: 'Internal server error' }, false, 500))
    const wrapper = await mountList()
    expect(wrapper.get('[data-labels-error]').text()).toContain('Internal server error')
    // Colour is never the only signal. This is not a compliance finding, so it
    // borrows none of the severity vocabulary — no ⊘, no "DANGER" — just the
    // word, so a reader who cannot see the red still knows what they are reading.
    expect(wrapper.get('[data-labels-error]').text()).toContain('Error')
    expect(wrapper.text()).not.toContain('Nothing saved')
  })

  it('says a failure through the announcer, and has no live region of its own', async () => {
    // The error line was \`role="alert"\`. Beside the root's announcer that said
    // every failure twice.
    vi.stubGlobal('fetch', respond({ error: 'Internal server error' }, false, 500))
    const wrapper = await mountList()
    expect(heard(wrapper)).toBe('Internal server error')
    expect(wrapper.findAll('[role="alert"], [role="status"], [aria-live]')).toHaveLength(1)
  })

  it('asks before deleting, and only then deletes', async () => {
    const fetchMock = respond({ labels: rows })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountList()

    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    // Asking is not doing: one call so far, the initial list.
    expect(fetchMock.mock.calls).toHaveLength(1)
    expect(wrapper.text()).toContain('Delete “Granola 340g”?')

    vi.stubGlobal('fetch', respond(undefined, true, 204))
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    // The list, not the page: the announcer names the label it has just deleted.
    expect(wrapper.get('ul').text()).not.toContain('Granola 340g')
    expect(wrapper.get('ul').text()).toContain('Acetone 5L')
  })

  it('says it is loading while it loads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    )
    const wrapper = mount(withAnnouncer(LabelsView), { global: { stubs } })
    await nextTick()
    expect(heard(wrapper)).toBe('Loading saved labels…')
  })

  it('asks about the labels this browser holds, and no others', async () => {
    const fetchMock = respond({ labels: rows, cap: 200, count: 9 })
    vi.stubGlobal('fetch', fetchMock)
    await mountList()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/labels?ids=64b7f0000000000000000001,64b7f0000000000000000002',
    )
  })

  it('says plainly whose labels these are, and how they are lost', async () => {
    // There are no accounts: this browser's storage is the only key to its
    // labels, and neither that nor expiry is something a person would guess.
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 200, count: 2 }))
    const wrapper = await mountList()
    expect(wrapper.get('[data-labels-ownership]').text()).toBe(
      "A label can be changed or deleted only from the browser that saved it. Clearing this browser's storage loses that for good, though anyone with a label's link can still open it. Labels are removed 30 days after their last change.",
    )
  })

  it('counts the labels saved in this browser, not everyone’s', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 200, count: 57 }))
    const wrapper = await mountList()
    expect(wrapper.get('[data-label-count]').text()).toBe('2 saved in this browser.')
    expect(heard(wrapper)).toBe('2 saved in this browser.')
  })

  it('says when the app is full, since nothing new can then be saved', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 200, count: 200 }))
    const wrapper = await mountList()
    const full =
      '2 saved in this browser. This app keeps 200 labels and has 200, so nothing new can be saved until one is deleted or expires.'
    expect(wrapper.get('[data-label-count]').text()).toBe(full)
    expect(heard(wrapper)).toBe(full)
  })

  it('says the app is full even where this browser holds nothing', async () => {
    vi.stubGlobal('fetch', respond({ labels: [], cap: 200, count: 200 }))
    const wrapper = await mountList()
    expect(wrapper.get('[data-label-count]').text()).toContain('This app keeps 200 labels')
  })

  it('shows no count over an empty list, which says so itself', async () => {
    vi.stubGlobal('fetch', respond({ labels: [], cap: 200, count: 3 }))
    const wrapper = await mountList()
    expect(wrapper.find('[data-label-count]').exists()).toBe(false)
  })

  it('says a deletion, and counts it', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 200, count: 2 }))
    const wrapper = await mountList()
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    vi.stubGlobal('fetch', respond(undefined, true, 204))
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    expect(heard(wrapper)).toBe('Deleted “Granola 340g”. 1 saved in this browser.')
    expect(wrapper.get('[data-label-count]').text()).toBe('1 saved in this browser.')
  })

  it('sends the deleted label’s token, and lets go of it', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 200, count: 2 }))
    const wrapper = await mountList()
    const fetchMock = respond(undefined, true, 204)
    vi.stubGlobal('fetch', fetchMock)
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['X-Edit-Token']).toBe('token-1')
    expect(heldLabels().map((label) => label.id)).toEqual(['64b7f0000000000000000002'])
  })

  it('says the server’s sentence when a delete is refused', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 200, count: 2 }))
    const wrapper = await mountList()
    vi.stubGlobal(
      'fetch',
      respond(
        { error: 'This label can be changed only from the browser that saved it.' },
        false,
        403,
      ),
    )
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-labels-error]').text()).toContain(
      'This label can be changed only from the browser that saved it.',
    )
    expect(wrapper.get('ul').text(), 'and the row stays').toContain('Granola 340g')
  })

  it('keeps the label when the question is declined', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows }))
    const wrapper = await mountList()
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    await wrapper.get('.text-chrome-400.underline').trigger('click')
    expect(wrapper.text()).toContain('Granola 340g')
  })
})
