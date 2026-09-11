import { UPC_A_ELEMENTS } from '@packwright/label-core'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorView from './EditorView.vue'

/**
 * The signature interaction, tested rather than asserted.
 *
 * Clicking a finding has to outline the offending element on the canvas *and*
 * ring its form field. That one link is what turns the compliance engine from a
 * wall of text into something you can see, so it is worth a test that drives the
 * real components rather than the store alone — the store holding the right
 * element id proves nothing about whether the canvas draws anything.
 */

// jsdom has no layout, so scrolling is a no-op it does not implement.
Element.prototype.scrollIntoView = vi.fn()

function mountEditor() {
  return mount(EditorView, { global: { stubs: { RouterLink: true } } })
}

describe('the editor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the label, the form and the findings', () => {
    const wrapper = mountEditor()
    expect(wrapper.find('form[aria-label="Label details"]').exists()).toBe(true)
    expect(wrapper.find('svg[role="img"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Compliance')
  })

  it('clicking a finding outlines the offending element on the canvas', async () => {
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    const wrapper = mountEditor()
    await nextTick()

    // Nothing is selected, so nothing is outlined.
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(false)

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('quiet zone measures'))
    expect(finding, 'the quiet-zone finding was not rendered').toBeDefined()

    await finding!.trigger('click')
    await nextTick()

    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)

    // The outline is drawn over the box the engine allocated, in the same
    // millimetre space as the label itself.
    const outline = wrapper.find('rect[stroke-dasharray]')
    expect(outline.exists()).toBe(true)
    const element = store.layout!.elements.find((e) => e.elementId === UPC_A_ELEMENTS.symbol)!
    expect(Number(outline.attributes('width'))).toBeCloseTo(element.box.widthMm + 1.2, 6)
  })

  it('clicking a finding rings the form section that produced it', async () => {
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    const wrapper = mountEditor()
    await nextTick()

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('quiet zone measures'))
    await finding!.trigger('click')
    await nextTick()

    const sections = wrapper.findAll('section')
    const ringed = sections.filter((s) => s.classes().includes('bg-chrome-800'))
    expect(ringed.length).toBeGreaterThan(0)
    expect(ringed.some((s) => s.text().includes('GTIN-12'))).toBe(true)
  })

  it('links the other way — focusing a field outlines its element', async () => {
    const store = useLabelDocumentStore()
    const wrapper = mountEditor()
    await nextTick()

    await wrapper.find('#field-gtin').trigger('focusin')
    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)
    await nextTick()
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(true)
  })

  it('keeps the selection when focus moves to a section that owns no element', async () => {
    // The reason this matters: the user clicks a finding on the symbol, then goes
    // to the stock fields to widen the label and fix it. If focusing those fields
    // clears the selection, the outline showing what needs to move disappears at
    // exactly the moment they are acting on it.
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    const wrapper = mountEditor()
    await nextTick()

    const finding = wrapper
      .findAll('button')
      .find((button) => button.text().includes('quiet zone measures'))
    await finding!.trigger('click')
    await nextTick()
    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)

    // Stock and Digital Link drive no single element, so they must leave the
    // selection alone rather than clearing it.
    await wrapper.find('#field-stock-width').trigger('focusin')
    await nextTick()

    expect(store.selectedElementId).toBe(UPC_A_ELEMENTS.symbol)
    expect(wrapper.find('rect[stroke-dasharray]').exists()).toBe(true)
  })

  it('states why no barcode was drawn rather than showing an unexplained gap', async () => {
    const store = useLabelDocumentStore()
    store.data.gtin = '036000291453'
    const wrapper = mountEditor()
    await nextTick()

    expect(wrapper.text()).toContain('invalid check digit')
    expect(wrapper.text()).toContain('should be 2, not 3')
  })

  it('does not claim a pass when no check has run', async () => {
    // A half-typed GTIN resolves to no layout, so no rule runs. The rail used to
    // render a green tick and "Every check passed" alongside a live region
    // correctly saying no checks had run.
    const store = useLabelDocumentStore()
    store.data.gtin = '0360002914'
    const wrapper = mountEditor()
    await nextTick()

    const rail = wrapper.find('section[aria-labelledby="findings-heading"]')
    expect(store.findings).toEqual([])
    expect(rail.text()).not.toContain('Every check passed')
    expect(rail.text()).toContain('No checks have run')
  })

  it('says in words that an overprinted symbol was not certified', async () => {
    // No rule judges overprinting — no clause for it has been verified — so the
    // rail has to state the fact, or a barcode with ink through it shows nothing
    // but passes.
    const store = useLabelDocumentStore()
    store.data.artwork = { text: 'X', anchor: 'centre', widthMm: 6, heightMm: 6 }
    const wrapper = mountEditor()
    await nextTick()

    const rail = wrapper.find('section[aria-labelledby="findings-heading"]')
    expect(rail.text()).toContain('Cannot be checked')
    expect(rail.text()).toContain('printed over')
    // An all-clear must not sit next to a notice saying something was declined.
    expect(rail.text()).not.toContain('Every check passed')
    expect(wrapper.find('[aria-live="polite"]').text()).toContain('could not be checked')
  })

  it('does not offer an export the server would refuse', async () => {
    const store = useLabelDocumentStore()
    store.data.gtin = '036000291453'
    const wrapper = mountEditor()
    await nextTick()

    const button = wrapper.findAll('button').find((b) => b.text().includes('Export'))
    expect(button!.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Nothing to export')
  })

  it('renders the quiet-zone hatch in a colour that is actually visible', async () => {
    // `currentColor` inside a `<pattern>` inherits from `<defs>`, not from the
    // element referencing it, so the class has to sit on the pattern itself —
    // otherwise the hatch resolves to the body text colour and renders at about
    // 1.1:1 on paper.
    const wrapper = mountEditor()
    await nextTick()
    const pattern = wrapper.find('pattern')
    expect(pattern.exists()).toBe(true)
    expect(pattern.classes()).toContain('text-notice')
    // And the id is unique per instance, so two canvases cannot collide.
    expect(pattern.attributes('id')).not.toBe('quiet-zone-hatch')
  })

  it('does not make a finding with no geometry look clickable', async () => {
    // A Digital Link finding is about a URI, not an element. As a button it
    // cleared the canvas highlight instead of setting one.
    const store = useLabelDocumentStore()
    store.data.digitalLink = { domain: 'not a url' }
    const wrapper = mountEditor()
    await nextTick()

    const clickable = wrapper.findAll('button').map((b) => b.text())
    expect(clickable.some((t) => t.includes('resolver domain'))).toBe(false)
    expect(wrapper.text()).toContain('resolver domain')
  })

  it('reports a symbol drawn off the stock rather than passing it', async () => {
    const store = useLabelDocumentStore()
    store.stock.heightMm = 20
    store.stock.widthMm = 100
    const wrapper = mountEditor()
    await nextTick()

    const rail = wrapper.find('section[aria-labelledby="findings-heading"]')
    expect(rail.text()).toContain('Cannot be checked')
    expect(rail.text()).toContain('off the top or bottom')
    expect(rail.text()).not.toContain('Every check passed')
  })

  it('shows the same measurement on the canvas as in the rail', async () => {
    // The caption hand-rolled `.toFixed()` and reproduced the exact float
    // asymmetry the shared formatter exists to kill.
    const wrapper = mountEditor()
    await nextTick()
    const caption = wrapper.find('figcaption').text()
    const [left, right] = caption.match(/([\d.]+) mm \/ ([\d.]+) mm/)!.slice(1)
    expect(left).toBe(right)
    // And it agrees with the rail, which formats through the same helper.
    const rail = wrapper.find('section[aria-labelledby="findings-heading"]').text()
    expect(rail).toContain(`${left} mm`)
  })

  it('announces the finding summary politely rather than per finding', async () => {
    // The rail recomputes on every keystroke; an assertive region per finding
    // would interrupt a screen-reader user continuously while they type a GTIN.
    const wrapper = mountEditor()
    const live = wrapper.find('[aria-live="polite"]')
    expect(live.exists()).toBe(true)
    expect(live.text()).toMatch(/checks passed/i)
  })
})
