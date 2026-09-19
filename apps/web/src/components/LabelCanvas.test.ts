import type { ResolvedLayout } from '@packwright/label-core'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LabelCanvas from './LabelCanvas.vue'

/**
 * A US food label is 120mm wide, which is 453 CSS pixels. The editor opens on
 * the Preview pane below 1024px — deliberately, because the label is the thing
 * the tool exists to draw — so a canvas that opens at 100% shows a phone user a
 * label clipped off both edges before they have touched anything.
 */
const layout: ResolvedLayout = {
  widthMm: 120,
  heightMm: 240,
  primitives: [],
  elements: [],
  symbols: [],
  pictograms: [],
  omissions: [],
}

describe('the canvas zoom', () => {
  it('opens on Fit rather than on 100%', () => {
    const wrapper = mount(LabelCanvas, { props: { layout, title: 'A US food label' } })
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Fit')
  })
})
