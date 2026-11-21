import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LandingView from './LandingView.vue'
import { testRouter } from './editorTestRouter'

describe('the landing page', () => {
  it('offers the editor, a live audit and the sample in its header', async () => {
    const router = testRouter('/')
    await router.isReady()
    const wrapper = mount(LandingView, { global: { plugins: [router] } })
    await flushPromises()
    const links = wrapper.findAll('header a').map((a) => [a.text(), a.attributes('href')])
    expect(links).toEqual([
      ['Open the editor', '/labels/new'],
      ['Audit a label photo', '/audit'],
      ['Try the sample label', '/audit?sample=1'],
    ])
  })
})
