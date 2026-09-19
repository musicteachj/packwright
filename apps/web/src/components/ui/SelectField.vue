<script setup lang="ts">
/**
 * A `<select>` control, populated by the caller through the default slot —
 * `SelectField` renders `<slot />` inside the `<select>` and never invents
 * its own `<option>`s.
 *
 * Measured in a real browser: `formStyles.ts`'s `INPUT`, which every one of
 * today's 19 selects uses, sets `padding-right` to 8px — the same as the
 * left, with the browser's own dropdown arrow drawn inside that 8px. A long
 * option reads "Standard — both measurement systems r" before it is clipped
 * mid-word against the glyph, with no ellipsis to say more was cut. `SELECT`
 * turns the native arrow off (`appearance-none`) and reserves `pr-8` (32px)
 * for the arrow this component draws instead, as an absolutely-positioned
 * `<svg>` sibling inside a `relative` wrapper — a background-image would have
 * worked too, but a sibling element keeps the glyph's colour an ordinary
 * `text-*` token (`currentColor`) instead of a hex value baked into an
 * arbitrary Tailwind class, which is the thing CLAUDE.md's "never raw hex in
 * components" rule is for.
 *
 * `GhsFormRail.vue`'s "Add a statement" select has no bound value at all —
 * only `@change` — which is the other reason `model` is wired to the
 * `<select>` by hand (`:value` + `@change`) instead of a literal `v-model` on
 * the element. Vue's built-in `v-model` directive on a `<select>` walks its
 * `<option>`s and re-marks the selected one on every update, including when
 * nothing is bound — with `defineModel` left unbound, that walk runs with
 * `undefined` and would silently un-select whatever the caller's own
 * `:value` had set, every time this component re-renders for any reason.
 * Binding by hand avoids that: ordinary attribute merge order decides it
 * instead, the same as `TextField` and `MeasurementField`.
 */
import { computed, useAttrs } from 'vue'
import FormField from './FormField.vue'
import { CONTROL_BORDER, CONTROL_BORDER_INVALID, SELECT } from '../formStyles'

defineOptions({ inheritAttrs: false })

/**
 * A caller's `class` belongs to the field, not to the control inside it.
 *
 * `inheritAttrs: false` plus a blanket `v-bind="controlAttrs"` on the control sent
 * everything to the `<input>` — including `class`, so `flex-1` and `w-20` landed
 * on the box and the field root stayed bare. That is backwards for the five row
 * sites in `UsFoodFormRail.vue` that size their fields that way, and it
 * contradicts point 5 of `FormField`'s own notes. Layout goes up, behaviour goes
 * down.
 */
const attrs = useAttrs()
const layoutAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))
const controlAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    labelHidden?: boolean
    description?: string
    live?: boolean
    invalid?: boolean
  }>(),
  {
    labelHidden: false,
    description: '',
    live: false,
    invalid: false,
  },
)

const model = defineModel<string>()
</script>

<template>
  <FormField
    v-bind="layoutAttrs"
    :id="props.id"
    :label="props.label"
    :label-hidden="props.labelHidden"
    :live="props.live"
    :invalid="props.invalid"
    :description="props.description"
  >
    <template v-if="$slots.description" #description><slot name="description" /></template>
    <template #default="{ id: controlId, describedBy, invalid: controlInvalid }">
      <div class="relative">
        <select
          :id="controlId"
          :class="[SELECT, controlInvalid ? CONTROL_BORDER_INVALID : CONTROL_BORDER]"
          :aria-describedby="describedBy"
          :aria-invalid="controlInvalid || undefined"
          :value="model"
          v-bind="controlAttrs"
          @change="model = ($event.target as HTMLSelectElement).value"
        >
          <slot />
        </select>
        <svg
          class="text-chrome-400 pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          data-chevron
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </template>
  </FormField>
</template>
