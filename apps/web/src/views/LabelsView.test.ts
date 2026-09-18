import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LabelsView from './LabelsView.vue'

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

afterEach(() => vi.unstubAllGlobals())

// The list endpoint answers with a page — `{ labels, nextBefore? }` — since it
// stopped returning every saved label on every call. `listLabels` unwraps it, so
// these stubs speak the server's shape rather than the function's.
const mountList = async () => {
  const wrapper = mount(LabelsView, { global: { stubs } })
  await flushPromises()
  return wrapper
}

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
    expect(wrapper.find('[role="alert"]').text()).toContain('Internal server error')
    expect(wrapper.text()).not.toContain('Nothing saved yet')
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
    await wrapper.get('.text-danger-300').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Granola 340g')
    expect(wrapper.text()).toContain('Acetone 5L')
  })

  it('keeps the label when the question is declined', async () => {
    vi.stubGlobal('fetch', respond({ labels: rows }))
    const wrapper = await mountList()
    await wrapper.get('[aria-label="Delete Granola 340g"]').trigger('click')
    await wrapper.get('.text-chrome-400.underline').trigger('click')
    expect(wrapper.text()).toContain('Granola 340g')
  })
})
