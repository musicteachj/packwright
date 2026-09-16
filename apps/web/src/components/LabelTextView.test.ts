import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { LayoutOmission, ResolvedLayout } from '@packwright/label-core'
import LabelTextView from './LabelTextView.vue'

const layoutWith = (omissions: LayoutOmission[]): ResolvedLayout => ({
  widthMm: 50,
  heightMm: 33,
  primitives: [],
  elements: [],
  symbols: [],
  pictograms: [],
  omissions,
})

describe('the omissions list', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keys each omission apart when one element carries several', async () => {
    // A GHS pictogram off the label carries its missing glyph and its overrun under
    // one element id. Keyed on the id alone, Vue saw duplicate keys on the first
    // update and could reuse the wrong row for the reason it showed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const signalWord: LayoutOmission = {
      elementId: 'ghs-signal-word',
      reason: 'signal word runs past the bottom',
      scope: 'detail',
    }
    const glyph: LayoutOmission = {
      elementId: 'ghs-pictograms-GHS07',
      reason: 'glyph not drawn',
      scope: 'detail',
    }
    const overrun: LayoutOmission = {
      elementId: 'ghs-pictograms-GHS07',
      reason: 'runs past the right edge',
      scope: 'detail',
    }

    // Vue checks keys as it maps a reordered list, so the update reorders one: the
    // two omissions sharing an id arrive ahead of one that was already there.
    const wrapper = mount(LabelTextView, { props: { layout: layoutWith([signalWord, glyph]) } })
    await wrapper.setProps({ layout: layoutWith([glyph, overrun, signalWord]) })
    await nextTick()

    const duplicateKeyWarnings = warn.mock.calls.filter((call) =>
      call.some((part) => String(part).includes('Duplicate keys')),
    )
    expect(duplicateKeyWarnings, 'Vue reported duplicate keys').toEqual([])
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      '⊘ glyph not drawn',
      '⊘ runs past the right edge',
      '⊘ signal word runs past the bottom',
    ])
  })
})
