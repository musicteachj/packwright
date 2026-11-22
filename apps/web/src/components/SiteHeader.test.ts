/**
 * The masthead in a build without the design catalog.
 *
 * Production builds leave `/design` out (`designCatalog.ts`), and a masthead that
 * still linked to it would send every visitor to the 404 from every page.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../router'
import SiteHeader from './SiteHeader.vue'

vi.mock('../designCatalog', () => ({ DESIGN_CATALOG: false }))

async function mountHeader() {
  const router = createAppRouter(createMemoryHistory())
  await router.push('/rules')
  await router.isReady()
  return mount(SiteHeader, { props: { current: 'rules' }, global: { plugins: [router] } })
}

describe('the masthead without the design catalog', () => {
  it('does not link to /design', async () => {
    const wrapper = await mountHeader()
    expect(wrapper.find('a[href="/design"]').exists()).toBe(false)
  })

  it('keeps the other three sections', async () => {
    const wrapper = await mountHeader()
    const sections = wrapper.findAll('nav[aria-label="Sections"] a').map((a) => a.text())
    expect(sections).toEqual(['Saved', 'Audit', 'Rules', 'New label'])
    for (const href of ['/labels', '/audit', '/rules']) {
      expect(wrapper.find(`a[href="${href}"]`).exists(), href).toBe(true)
    }
  })
})
