import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import LiveAnnouncer from './LiveAnnouncer.vue'
import { useAnnouncement, useAnnouncerStore } from '../stores/announcer'

/**
 * The one region the application speaks through.
 *
 * A screen reader announces a *change* to a live region it is already
 * observing; a region created with its text already in it usually says
 * nothing. Every live-region defect this project has recorded is one shape of
 * that — the GTIN note created full, the editor's wait rebuilt full, the
 * refused measurements never live at all — plus one that is the opposite: two
 * regions on screen at once, saying the same fact in two different wordings.
 */

beforeEach(() => setActivePinia(createPinia()))

/** A component that says whatever `text` holds, under one concern. */
const Speaker = (key: string, text: ReturnType<typeof ref<string>>) =>
  defineComponent({
    setup() {
      useAnnouncement(key, () => text.value ?? '')
      return () => h('div')
    },
  })

describe('the announcer', () => {
  it('is present before it has anything to say', () => {
    // The whole point. A region that only appears with its first message is
    // the born-full shape this exists to make impossible.
    const wrapper = mount(LiveAnnouncer)
    const regions = wrapper.findAll('[aria-live]')
    expect(regions).toHaveLength(1)
    expect(regions[0]!.attributes('aria-live')).toBe('polite')
    expect(regions[0]!.text()).toBe('')
  })

  it('is not atomic, so one concern changing does not re-read every other', () => {
    // `role="status"` implies `aria-atomic="true"`: a change to any line would
    // re-announce all of them, so the findings count would be read out again
    // every time a field's note changed.
    const region = mount(LiveAnnouncer).get('[aria-live]')
    expect(region.attributes('role')).toBeUndefined()
    expect(region.attributes('aria-atomic')).not.toBe('true')
  })

  it('changes a concern’s line in place rather than replacing it', async () => {
    const wrapper = mount(LiveAnnouncer)
    const store = useAnnouncerStore()

    store.say('findings', 'All 6 checks passed.')
    await nextTick()
    const line = wrapper.get('[aria-live] p').element

    store.say('findings', '2 findings, 4 checks passed.')
    await nextTick()
    expect(wrapper.findAll('[aria-live] p')).toHaveLength(1)
    expect(wrapper.get('[aria-live] p').element, 'the same node, with new words').toBe(line)
    expect(line.textContent).toBe('2 findings, 4 checks passed.')
  })

  it('keeps one line per concern, and clearing one leaves the rest', async () => {
    const wrapper = mount(LiveAnnouncer)
    const store = useAnnouncerStore()
    store.say('findings', 'All 6 checks passed.')
    store.say('gtin', '0360002914533 was not taken: the check digit does not match.')
    await nextTick()
    expect(wrapper.findAll('[aria-live] p').map((p) => p.text())).toEqual([
      'All 6 checks passed.',
      '0360002914533 was not taken: the check digit does not match.',
    ])

    store.say('gtin', '')
    await nextTick()
    expect(wrapper.findAll('[aria-live] p').map((p) => p.text())).toEqual(['All 6 checks passed.'])
  })

  it('stops speaking for a component once it is gone', async () => {
    // Leaving the editor must not leave its findings count standing in the
    // region for whichever page comes next to be heard beside.
    const announcer = mount(LiveAnnouncer)
    const text = ref('Opening this label…')
    const speaker = mount(Speaker('findings', text))
    await nextTick()
    expect(announcer.get('[aria-live]').text()).toBe('Opening this label…')

    text.value = 'All 6 checks passed.'
    await nextTick()
    expect(announcer.get('[aria-live]').text()).toBe('All 6 checks passed.')

    speaker.unmount()
    await nextTick()
    expect(announcer.get('[aria-live]').text()).toBe('')
  })
})
