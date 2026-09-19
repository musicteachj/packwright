import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import FormField from './FormField.vue'

const mountField = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
  mount(FormField, {
    props: { id: 'f', label: 'Panel width', ...props },
    slots: { default: '<input id="f" />', ...slots },
  })

describe('FormField', () => {
  it('names the control through a label that points at it', () => {
    const wrapper = mountField()
    expect(wrapper.get('label').attributes('for')).toBe('f')
    expect(wrapper.get('label').text()).toContain('Panel width')
  })

  it('keeps the accessible name when the label is hidden', () => {
    // Seven sites in UsFoodFormRail hide the label — the ingredient columns and
    // the override columns. Hidden is a visibility change, never a naming one.
    const wrapper = mountField({ labelHidden: true })
    expect(wrapper.get('label span').classes()).toContain('sr-only')
    expect(wrapper.get('label').text()).toContain('Panel width')
  })

  it('puts the description beside the label, never inside it', () => {
    // The bug this component exists to make unrepresentable: UsFoodFormRail:1801
    // nests its help in the <label>, so that field's accessible name is a
    // forty-word paragraph.
    const wrapper = mountField({ description: 'Measured on the lowercase o.' })
    expect(wrapper.get('label').text()).not.toContain('lowercase')
    expect(wrapper.get('#f-description').text()).toContain('lowercase')
  })

  it('offers a describedBy only when there is something to describe', () => {
    expect(mountField().html()).not.toContain('f-description')
    expect(mountField({ description: 'x' }).find('#f-description').exists()).toBe(true)
  })

  it('announces a live description, for the one field that validates', () => {
    // UpcAFormRail's GTIN: two mutually exclusive paragraphs sharing one id,
    // both role=status, plus aria-invalid. A string prop cannot express it.
    const wrapper = mountField(
      { live: true, invalid: true },
      { description: '<p>036000291453 was not taken</p>' },
    )
    const note = wrapper.get('#f-description')
    expect(note.attributes('role')).toBe('status')
    expect(note.attributes('aria-live')).toBe('polite')
    expect(note.text()).toContain('was not taken')
  })

  it('does not let a live description imply a severity', () => {
    // `live` means announced, not alarming. The GTIN carries two live notes —
    // one where a pasted symbol was refused, one where it was taken with a
    // caveat — and a component that painted both `text-caution` would report a
    // successful scan as a warning. Tone travels with the slotted content.
    const wrapper = mountField({ live: true }, { description: '<p>036000291452 was taken</p>' })
    const note = wrapper.get('#f-description')
    expect(note.classes()).not.toContain('text-caution')
    expect(note.classes()).toContain('text-chrome-400')
  })

  it('hands id, describedBy and invalid to a slotted control', () => {
    const wrapper = mount(FormField, {
      props: { id: 'g', label: 'GTIN', description: 'twelve digits', invalid: true },
      slots: {
        default: `<template #default="s"><input :id="s.id" :aria-describedby="s.describedBy" :aria-invalid="s.invalid" /></template>`,
      },
    })
    const input = wrapper.get('input')
    expect(input.attributes('id')).toBe('g')
    expect(input.attributes('aria-describedby')).toBe('g-description')
    expect(input.attributes('aria-invalid')).toBe('true')
  })

  it('leaves describedBy undefined when nothing describes the field', () => {
    // A dangling aria-describedby pointing at an element that does not exist is
    // worse than none: a screen reader announces the field and then silence.
    const wrapper = mount(FormField, {
      props: { id: 'h', label: 'Margin' },
      slots: {
        default: `<template #default="s"><input :id="s.id" :aria-describedby="s.describedBy" /></template>`,
      },
    })
    expect(wrapper.get('input').attributes('aria-describedby')).toBeUndefined()
  })

  it("puts the caller's own class on its root, not on the label", () => {
    // Widths are the caller's business: flex-1, w-20 and w-24 all appear on
    // field wrappers in the nutrient and ingredient rows.
    const wrapper = mount(FormField, {
      props: { id: 'i', label: 'Percent' },
      attrs: { class: 'w-20' },
      slots: { default: '<input id="i" />' },
    })
    expect(wrapper.classes()).toContain('w-20')
  })
})

describe('FormField notices its slots changing', () => {
  it('shows a description slot that appears after mount', async () => {
    // `useSlots()` hands back a record Vue mutates in place, so a `computed`
    // reading it is evaluated once and never invalidated. Revealing the slot
    // later rendered nothing, and removing it left an empty element behind with
    // the control's `aria-describedby` still pointing at it — the dangling
    // reference this component promises to prevent, in the conditional
    // live-note shape it exists for.
    const show = ref(false)
    const Parent = defineComponent({
      setup: () => () =>
        h(
          FormField,
          { id: 'f', label: 'GTIN' },
          show.value
            ? { default: () => h('input', { id: 'f' }), description: () => h('p', 'refused') }
            : { default: () => h('input', { id: 'f' }) },
        ),
    })

    const wrapper = mount(Parent)
    expect(wrapper.find('#f-description').exists()).toBe(false)

    show.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#f-description').text()).toContain('refused')
  })
})

describe('FormField will not let a field be invalid in silence', () => {
  it('complains when invalid carries no description', () => {
    // `invalid` swaps the border for `danger-edge`, and a sighted reader gets
    // nothing else. Colour never carries meaning alone here.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mountField({ invalid: true })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no description'))
    warn.mockRestore()
  })

  it('says nothing when the field explains itself', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mountField({ invalid: true, description: 'The check digit does not match.' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('spaces the description off the control it describes', () => {
    // It abutted at 0px: `LABEL`'s own gap stops at the closing label tag, and
    // moving the description outside is what created the space to restore.
    expect(mountField({ description: 'x' }).classes()).toContain('gap-1')
  })
})
