import type { ResolvedLayout, ResolvedSymbol } from '@packwright/label-core'
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

/**
 * A symbol, so the dimension overlay has something to annotate. `symbolCallouts`
 * maps `layout.symbols`, so the callout does not render at all on the empty
 * layout above.
 */
const symbol: ResolvedSymbol = {
  elementId: 'symbol',
  symbology: 'UPC-A',
  value: '036000291452',
  xDimensionMm: 0.33,
  barPatternWidthMm: 31,
  barHeightMm: 22.85,
  xMm: 10,
  yMm: 10,
  drawnHeightMm: 25.9,
  guardBarHeightMm: 24,
  requiredQuietZoneLeftMm: 2.97,
  requiredQuietZoneRightMm: 2.31,
  clearSpaceLeftMm: 10,
  clearSpaceRightMm: 10,
  overprintedBy: [],
  verticalOverflowMm: 0,
}

const withDimensions = async () => {
  const wrapper = mount(LabelCanvas, {
    props: {
      layout: { ...layout, symbols: [symbol] },
      title: 'A retail label',
      showOverlayControls: true,
    },
  })
  const dimensions = wrapper.findAll('label').find((entry) => entry.text().includes('Dimensions'))
  expect(dimensions, 'the Dimensions toggle must be findable').toBeDefined()
  await dimensions!.get('input').setValue(true)
  return wrapper
}

describe('the dimension callout is a measurement, and is set like one', () => {
  it('takes the mono face and tabular figures from the utility that has them', async () => {
    // It carried `font-family="IBM Plex Mono"` as a bare SVG presentation
    // attribute: no `font-variant-numeric`, no `tnum`, and no fallback stack —
    // on a figure that updates live as the label is resized, which is the exact
    // jitter `numeric` exists to stop. `fontFamilies.test.ts` could not see it,
    // because this is chrome the component draws rather than anything `toSVG`
    // emits from `layout.primitives`.
    const callout = (await withDimensions()).get('svg text')

    expect(callout.classes()).toContain('numeric')
    expect(callout.attributes('font-family')).toBeUndefined()
  })

  it('keeps its type size in the label’s own millimetres', async () => {
    // `font-size` stays a presentation attribute because 1.8 here is 1.8mm of
    // the shared `viewBox`, and CSS `font-size` has no unitless form. Moving it
    // into the class would silently reinterpret it as pixels.
    expect((await withDimensions()).get('svg text').attributes('font-size')).toBe('1.8')
  })
})
