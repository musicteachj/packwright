import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CheckboxField from './CheckboxField.vue'
import MeasurementField from './MeasurementField.vue'
import SelectField from './SelectField.vue'
import TextField from './TextField.vue'

it('sets prose in the sans face and measurements in the mono one', () => {
  // CLAUDE.md: monospace and tabular figures for identifiers and measurements.
  // `INPUT` put `numeric` on everything, so a product name rendered in mono.
  expect(
    mount(TextField, { props: { id: 'a', label: 'Statement of identity' } })
      .get('input')
      .classes(),
  ).not.toContain('numeric')
  expect(
    mount(MeasurementField, { props: { id: 'b', label: 'Panel width (mm)' } })
      .get('input')
      .classes(),
  ).toContain('numeric')
})

it('gives a checkbox a target a finger can hit, and a gap to its own word', () => {
  // Measured in the page before this: a 13x13 box in a 16px row against WCAG
  // 2.2 AA's 24x24 floor, and on the canvas a 0px gap between box and word.
  const row = mount(CheckboxField, { props: { id: 'c', label: 'Omit the human-readable digits' } })
  expect(row.get('input').classes()).toContain('size-4')
  expect(row.get('label').classes()).toContain('gap-2.5')
  expect(row.get('label').classes()).toContain('min-h-6')
  expect(row.get('label').classes()).toContain('items-start')
  expect(row.get('input').classes()).toContain('accent-notice')
})

it('reserves room for the select chevron', () => {
  // Measured: padding-right 8px with the native arrow inside it, so a long
  // option was clipped mid-word with no ellipsis.
  const select = mount(SelectField, { props: { id: 'd', label: 'Container shape' } }).get('select')
  expect(select.classes()).toContain('appearance-none')
  expect(select.classes().some((c) => /^pr-(7|8|9|10)$/.test(c))).toBe(true)
})

describe('TextField', () => {
  it('renders through FormField, with the label pointing at the control', () => {
    const wrapper = mount(TextField, { props: { id: 'a', label: 'Statement of identity' } })
    expect(wrapper.get('label').attributes('for')).toBe('a')
    expect(wrapper.get('input').attributes('id')).toBe('a')
  })

  it('updates through v-model', async () => {
    const wrapper = mount(TextField, {
      props: { id: 'a', label: 'Statement of identity', modelValue: 'Oat granola' },
    })
    await wrapper.get('input').setValue('Almond granola')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Almond granola'])
  })

  it('also works with plain :value and @input, with no v-model bound', async () => {
    // UsFoodFormRail's ingredient rows write through an array map this way —
    // no `modelValue` prop in sight.
    const onInput = vi.fn()
    const wrapper = mount(TextField, {
      props: { id: 'a', label: 'Statement of identity', value: 'Oat granola', onInput },
    })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Oat granola')
    await wrapper.get('input').setValue('Almond granola')
    expect(onInput).toHaveBeenCalled()
  })

  it('reaches the control as aria-describedby', () => {
    const wrapper = mount(TextField, {
      props: {
        id: 'a',
        label: 'Statement of identity',
        description: 'As declared on the principal display panel',
      },
    })
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('a-description')
  })
})

describe('MeasurementField', () => {
  it('renders through FormField, with the label pointing at the control', () => {
    const wrapper = mount(MeasurementField, { props: { id: 'b', label: 'Panel width (mm)' } })
    expect(wrapper.get('label').attributes('for')).toBe('b')
    expect(wrapper.get('input').attributes('id')).toBe('b')
  })

  it('updates through v-model', async () => {
    const wrapper = mount(MeasurementField, {
      props: { id: 'b', label: 'Panel width (mm)', modelValue: '10' },
    })
    await wrapper.get('input').setValue('25')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['25'])
  })

  it('also works with plain :value and @input, with no v-model bound', async () => {
    const onInput = vi.fn()
    const wrapper = mount(MeasurementField, {
      props: { id: 'b', label: 'Panel width (mm)', value: '10', onInput },
    })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('10')
    await wrapper.get('input').setValue('25')
    expect(onInput).toHaveBeenCalled()
  })

  it('reaches the control as aria-describedby', () => {
    const wrapper = mount(MeasurementField, {
      props: { id: 'b', label: 'Panel width (mm)', description: 'Measured edge to edge' },
    })
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('b-description')
  })
})

describe('SelectField', () => {
  const options = { default: '<option value="a">A</option><option value="b">B</option>' }

  it('renders through FormField, with the label pointing at the control', () => {
    const wrapper = mount(SelectField, {
      props: { id: 'd', label: 'Container shape' },
      slots: options,
    })
    expect(wrapper.get('label').attributes('for')).toBe('d')
    expect(wrapper.get('select').attributes('id')).toBe('d')
  })

  it("renders the default slot's options inside the select", () => {
    const wrapper = mount(SelectField, {
      props: { id: 'd', label: 'Container shape' },
      slots: options,
    })
    const found = wrapper.get('select').findAll('option')
    expect(found).toHaveLength(2)
    expect(found[1]?.text()).toBe('B')
  })

  it('updates through v-model', async () => {
    const wrapper = mount(SelectField, {
      props: { id: 'd', label: 'Container shape', modelValue: 'a' },
      slots: options,
    })
    await wrapper.get('select').setValue('b')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['b'])
  })

  it('also works with plain :value and @change, with no v-model bound', async () => {
    // GHS's "Add a statement" select has no bound value at all — just @change.
    const onChange = vi.fn()
    const wrapper = mount(SelectField, {
      props: { id: 'd', label: 'Container shape', onChange },
      slots: options,
    })
    await wrapper.get('select').setValue('b')
    expect(onChange).toHaveBeenCalled()
  })

  it('reaches the control as aria-describedby', () => {
    const wrapper = mount(SelectField, {
      props: {
        id: 'd',
        label: 'Container shape',
        description: 'Determines which quiet zone applies',
      },
      slots: options,
    })
    expect(wrapper.get('select').attributes('aria-describedby')).toBe('d-description')
  })
})

describe('CheckboxField', () => {
  it('links the label to the input by id, on one line', () => {
    const wrapper = mount(CheckboxField, {
      props: { id: 'c', label: 'Omit the human-readable digits' },
    })
    expect(wrapper.get('input').attributes('id')).toBe('c')
    expect(wrapper.get('label').attributes('for')).toBe('c')
    expect(wrapper.get('label').text()).toBe('Omit the human-readable digits')
  })

  it('updates through v-model', async () => {
    const wrapper = mount(CheckboxField, {
      props: { id: 'c', label: 'Omit the human-readable digits', modelValue: false },
    })
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('also works with plain :checked and @change, with no v-model bound', async () => {
    // UpcAFormRail's hazard checkboxes bind this way, against array
    // membership rather than a boolean ref.
    const onChange = vi.fn()
    const wrapper = mount(CheckboxField, {
      props: { id: 'c', label: 'Omit the human-readable digits', checked: true, onChange },
    })
    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('input').setValue(false)
    expect(onChange).toHaveBeenCalled()
  })
})

describe('a description slot reaches FormField', () => {
  // It did not, and nothing said so. These three forwarded only the string
  // `description` prop, so `<template #description>` handed to a control was
  // dropped on the floor — no error, no warning, the content simply gone. The
  // one call site that needs it is the GTIN field, whose note is two mutually
  // exclusive live paragraphs, and it is in the next rail to be migrated.
  it.each([
    ['TextField', TextField],
    ['MeasurementField', MeasurementField],
    ['SelectField', SelectField],
  ])('%s relays it rather than swallowing it', (_name, component) => {
    const wrapper = mount(component, {
      props: { id: 'z', label: 'GTIN-12' },
      slots: { description: '<p>036000291453 was not taken</p>' },
    })
    expect(wrapper.get('#z-description').text()).toContain('was not taken')
    expect(wrapper.get('input, select').attributes('aria-describedby')).toBe('z-description')
  })
})

describe("a caller's class sizes the field, not the box inside it", () => {
  // `inheritAttrs: false` with a blanket `v-bind="$attrs"` sent everything to the
  // control, so `flex-1` and `w-20` landed on the `<input>` and the field root
  // stayed bare. Five row sites in `UsFoodFormRail.vue` size their fields exactly
  // that way and would have lost their layout on migration.
  it.each([
    ['TextField', TextField],
    ['MeasurementField', MeasurementField],
    ['SelectField', SelectField],
    ['CheckboxField', CheckboxField],
  ])('%s puts it on the root', (_name, component) => {
    const wrapper = mount(component, {
      props: { id: 'w', label: 'Percent by weight' },
      attrs: { class: 'w-20' },
    })
    expect(wrapper.classes(), 'the root carries the width').toContain('w-20')
    expect(wrapper.get('input, select').classes(), 'the control does not').not.toContain('w-20')
  })
})

describe('an invalid field shows it, not only announces it', () => {
  // `invalid` set `aria-invalid` and changed nothing a sighted reader could see,
  // so the prop looked wired and was half-wired. `danger-edge` is the token
  // measured for exactly this — a rule around a box, clearing 3:1 on every
  // chrome surface. Never the only signal: an invalid field carries its reason
  // in the description beneath it.
  it.each([
    ['TextField', TextField],
    ['MeasurementField', MeasurementField],
    ['SelectField', SelectField],
  ])('%s swaps its resting border for the danger edge', (_name, component) => {
    const resting = mount(component, { props: { id: 'v', label: 'GTIN-12' } })
    expect(resting.get('input, select').classes()).toContain('border-chrome-700')
    expect(resting.get('input, select').classes()).not.toContain('border-danger-edge')

    const invalid = mount(component, { props: { id: 'v', label: 'GTIN-12', invalid: true } })
    expect(invalid.get('input, select').classes()).toContain('border-danger-edge')
    expect(invalid.get('input, select').classes()).not.toContain('border-chrome-700')
  })
})

describe('an identifier is text, and still mono', () => {
  // The rule is about content, not control type. A GTIN is `type="text"` — it
  // has a leading zero and is never arithmetic — and so are an SSCC, a lot code
  // and a GS1 element string. Without this the only mono control was
  // `MeasurementField`, a number input, so every identifier in the rails would
  // have migrated into the prose face.
  it('sets a plain text field in the prose face', () => {
    const wrapper = mount(TextField, { props: { id: 'p', label: 'Statement of identity' } })
    expect(wrapper.get('input').classes()).not.toContain('numeric')
  })

  it('sets an identifier field in the mono face, still as text', () => {
    const wrapper = mount(TextField, { props: { id: 'p', label: 'GTIN-12', identifier: true } })
    expect(wrapper.get('input').classes()).toContain('numeric')
    expect(wrapper.get('input').attributes('type')).toBe('text')
  })
})

describe('MeasurementField honours the .number modifier', () => {
  // Thirty-two of the thirty-four number sites it replaces are written
  // `v-model.number`. Without the modifier they would store "12" where the
  // layout engine expects 12.
  it('emits a number when the caller asked for one', async () => {
    const wrapper = mount(MeasurementField, {
      props: {
        id: 'n',
        label: 'Panel width (mm)',
        modelValue: 0,
        modelModifiers: { number: true },
        'onUpdate:modelValue': (v: unknown) => wrapper.setProps({ modelValue: v as number }),
      },
    })
    await wrapper.get('input').setValue('120')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe(120)
  })

  it('emits the raw string when it does not', async () => {
    const wrapper = mount(MeasurementField, {
      props: { id: 'n', label: 'Panel width (mm)', modelValue: '' },
    })
    await wrapper.get('input').setValue('120')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('120')
  })
})

describe('CheckboxField renders a label that is not one run of prose', () => {
  // The 44 GHS hazard classes read "2.6 Flammable liquids → GHS02", where the
  // class number and pictogram code are identifiers and take the mono face.
  // Migrating them through a string-only `label` collapsed all 44 into plain
  // sans, undoing the typeface rule this component layer exists to apply.
  it('renders the slot when given one', () => {
    const wrapper = mount(CheckboxField, {
      props: { id: 'h', label: '2.6 Flammable liquids → GHS02' },
      slots: { default: '<span class="numeric">2.6</span> Flammable liquids → GHS02' },
    })
    expect(wrapper.get('span.numeric').text()).toBe('2.6')
  })

  it('makes the slot the accessible name, and it must match the stated one', () => {
    // The name of a label is its text content, so the slot IS the name — an
    // earlier comment here claimed otherwise and was wrong. The two silently
    // disagreeing is what breaks voice control, where a user says what they see.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(CheckboxField, {
      props: { id: 'h', label: '2.6 Flammable liquids → GHS02' },
      slots: { default: '<span class="numeric">2.6</span> Flammable liquids → GHS02' },
    })
    expect(wrapper.get('label').text().replace(/\s+/g, ' ')).toBe('2.6 Flammable liquids → GHS02')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('complains when the rendered text and the stated name disagree', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount(CheckboxField, {
      props: { id: 'h', label: '2.6 Flammable liquids → GHS02' },
      slots: { default: 'Something else entirely' },
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('accessible name'))
    warn.mockRestore()
  })

  it('complains loudest when a slot renders nothing at all', () => {
    // The worst case, and the one an earlier guard skipped: `if (rendered && …)`
    // stayed silent for the empty string, which is the control with no
    // accessible name whatsoever.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount(CheckboxField, {
      props: { id: 'h', label: 'Omit the human-readable digits' },
      slots: { default: '<span></span>' },
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no accessible name'))
    warn.mockRestore()
  })

  it('falls back to the label prop, which is the name when there is no slot', () => {
    const wrapper = mount(CheckboxField, { props: { id: 'h', label: 'Omit the digits' } })
    expect(wrapper.get('label').text()).toContain('Omit the digits')
  })
})
