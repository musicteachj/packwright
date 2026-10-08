import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LabelsView from './LabelsView.vue'
import { withAnnouncer } from './withAnnouncer'

const stubs = { RouterLink: { template: '<a><slot /></a>' } }
const rows = [
  {
    id: '1',
    name: 'Granola 340g',
    labelType: 'gs1-retail',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  },
  {
    id: '2',
    name: 'Acetone 5L',
    labelType: 'ghs-chemical',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  },
]

const respond = (body: unknown, ok = true, status = 200) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body } as unknown as Response)

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

// The list endpoint answers with a page — `{ labels, nextBefore?, cap, count }`.
// `listLabels` unwraps it, so these stubs speak the server's shape rather than
// the function's.
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
    expect(wrapper.text()).toContain('Nothing saved yet')
  })

  it('reports a failure instead of showing an empty list', async () => {
    vi.stubGlobal('fetch', respond({ error: 'Internal server error' }, false, 500))
    const wrapper = await mountList()
    expect(wrapper.get('[data-labels-error]').text()).toContain('Internal server error')
    // Colour is never the only signal. This is not a compliance finding, so it
    // borrows none of the severity vocabulary — no ⊘, no "DANGER" — just the
    // word, so a reader who cannot see the red still knows what they are reading.
    expect(wrapper.get('[data-labels-error]').text()).toContain('Error')
    expect(wrapper.text()).not.toContain('Nothing saved yet')
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

  it('says how many are saved out of how many it keeps', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 20, count: 2 }))
    const wrapper = await mountList()
    expect(wrapper.get('[data-label-count]').text()).toBe('2 of 20 saved')
    expect(heard(wrapper)).toBe('2 of 20 labels saved.')
  })

  it('says at the cap that one has to go before another is saved', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 20, count: 20 }))
    const wrapper = await mountList()
    expect(wrapper.get('[data-label-count]').text()).toBe(
      '20 of 20 saved — as many as this app keeps. Delete one before saving another.',
    )
  })

  it('shows no figure the server did not give', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows }))
    const wrapper = await mountList()
    expect(wrapper.find('[data-label-count]').exists()).toBe(false)
  })

  it('says the list is cut short where the server had more', async () => {
    vi.stubGlobal(
      'fetch',
      respond({ labels: rows, cap: 20, count: 25, nextBefore: '2026-09-18T00:00:00.000Z_abc' }),
    )
    const wrapper = await mountList()
    expect(wrapper.get('[data-labels-truncated]').text()).toBe(
      'Showing the 2 most recently changed of 25. The rest are stored but not listed here.',
    )
  })

  it('says nothing about a cut when the page is everything', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 20, count: 2 }))
    const wrapper = await mountList()
    expect(wrapper.find('[data-labels-truncated]').exists()).toBe(false)
  })

  it('says a deletion, and counts it', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows, cap: 20, count: 2 }))
    const wrapper = await mountList()
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    vi.stubGlobal('fetch', respond(undefined, true, 204))
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    expect(heard(wrapper)).toBe('Deleted “Granola 340g”. 1 of 20 labels saved.')
    expect(wrapper.get('[data-label-count]').text()).toBe('1 of 20 saved')
  })

  it('fetches again after a delete from a list that was cut short', async () => {
    const third = { ...rows[0]!, id: '3', name: 'Vinegar 1L' }
    vi.stubGlobal(
      'fetch',
      respond({ labels: rows, cap: 20, count: 3, nextBefore: '2026-09-18T00:00:00.000Z_abc' }),
    )
    const wrapper = await mountList()
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    const answers = [
      { ok: true, status: 204, json: async () => undefined },
      {
        ok: true,
        status: 200,
        json: async () => ({ labels: [rows[1], third], cap: 20, count: 2 }),
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answers.shift() as unknown as Response),
    )
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    expect(wrapper.get('ul').text(), 'the row that was not listed is listed now').toContain(
      'Vinegar 1L',
    )
    expect(wrapper.find('[data-labels-truncated]').exists()).toBe(false)
    expect(heard(wrapper), 'and the deletion is still what was said').toBe(
      'Deleted “Granola 340g”. 2 of 20 labels saved.',
    )
  })

  it('keeps only the latest refill when two deletes overlap', async () => {
    const third = { ...rows[0]!, id: '3', name: 'Vinegar 1L' }
    const fourth = { ...rows[0]!, id: '4', name: 'Bleach 2L' }
    vi.stubGlobal(
      'fetch',
      respond({
        labels: [rows[0], rows[1], third],
        cap: 20,
        count: 4,
        nextBefore: '2026-09-18T00:00:00.000Z_abc',
      }),
    )
    const wrapper = await mountList()

    // Each list read is held until the test lets it go; deletes answer at once.
    const held: Array<(body: unknown) => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'DELETE'
          ? ({ ok: true, status: 204, json: async () => undefined } as unknown as Response)
          : await new Promise<Response>((resolve) =>
              held.push((body) =>
                resolve({ ok: true, status: 200, json: async () => body } as unknown as Response),
              ),
            ),
      ),
    )
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Delete Acetone 5L"]').trigger('click')
    await wrapper.get('[data-confirm-delete]').trigger('click')
    await flushPromises()
    expect(held, 'one refill per delete').toHaveLength(2)

    // The second answers first, then the first — read before Acetone went.
    held[1]!({ labels: [third, fourth], cap: 20, count: 2 })
    await flushPromises()
    held[0]!({ labels: [rows[1], third, fourth], cap: 20, count: 3 })
    await flushPromises()

    expect(wrapper.get('ul').text(), 'the second deletion stays deleted').not.toContain(
      'Acetone 5L',
    )
    expect(wrapper.get('[data-label-count]').text()).toBe('2 of 20 saved')
  })

  it('keeps the label when the question is declined', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows }))
    const wrapper = await mountList()
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    await wrapper.get('.text-chrome-400.underline').trigger('click')
    expect(wrapper.text()).toContain('Granola 340g')
  })
})
