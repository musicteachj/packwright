<script setup lang="ts">
/**
 * A single-line control for prose — a statement of identity, a supplier's
 * address, an ingredient's declared name — never an identifier or a
 * measurement. `MeasurementField` is the sibling built for those.
 *
 * `formStyles.ts`'s `INPUT` carries `numeric`, IBM Plex Mono with tabular
 * figures, on every field that uses it, text and select alike. CLAUDE.md's
 * own rule is narrower: monospace and tabular figures for identifiers and
 * measurements, not for running text — so "Oat and almond granola" rendered
 * in a face built for columns of digits, for no reason connected to what it
 * is. This component exists to be the plain-prose control that rule actually
 * describes; it uses `TEXT_INPUT`, the same styling with `numeric` dropped.
 *
 * The label, description and `aria-describedby` wiring are `FormField`'s job, not
 * this component's — see `FormField.vue` for why that structure is shaped the way
 * it is. This component's own job is narrower: forward the handful of props
 * `FormField` needs, and put an `<input>` in its slot.
 *
 * Not every call site owns a ref to bind. Ingredient rows in
 * `UsFoodFormRail.vue` write through an array map with `:value` + `@input`
 * instead of `v-model`, so the control can't only answer to `defineModel`'s
 * own `v-model` sugar. `model` is wired to the `<input>` by hand — `:value`
 * and `@input`, not a literal `v-model="model"` on the element — because
 * Vue's built-in `v-model` directive re-asserts the bound value on every
 * update, including when nothing is bound; with `defineModel` left unbound
 * (the `:value`/`@input` call sites never pass `modelValue`), that
 * reassertion would overwrite the caller's own `value` with the literal
 * string `"undefined"` on the next re-render. Binding by hand and letting
 * `v-bind="controlAttrs"` land after it sidesteps that: `inheritAttrs` is off so
 * attrs don't land on `FormField`'s own root, and an attrs `value`/`onInput`
 * pair — present only when a caller uses the plain form — overwrites the
 * unbound default rather than fighting it, while an unrelated attr like
 * `inputmode` or `placeholder` just rides along untouched.
 */
import { computed, useAttrs } from 'vue'
import FormField from './FormField.vue'
import { CONTROL_BORDER, CONTROL_BORDER_INVALID, TEXT_INPUT } from '../formStyles'

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
    /**
     * Sets the value in the mono, tabular face.
     *
     * Named for the reason rather than the appearance. `CLAUDE.md` reserves
     * monospace for identifiers and measurements, and an identifier is not
     * always a number: a GTIN is `type="text"` — it has a leading zero and is
     * never arithmetic — and so are an SSCC, a lot code and an element string.
     * Without this the only mono control was `MeasurementField`, which is a
     * number input, so every identifier in the rails would have migrated into
     * the prose face.
     */
    identifier?: boolean
    description?: string
    live?: boolean
    invalid?: boolean
  }>(),
  {
    labelHidden: false,
    identifier: false,
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
      <input
        :id="controlId"
        type="text"
        :class="[
          TEXT_INPUT,
          props.identifier ? 'numeric' : '',
          controlInvalid ? CONTROL_BORDER_INVALID : CONTROL_BORDER,
        ]"
        :aria-describedby="describedBy"
        :aria-invalid="controlInvalid || undefined"
        :value="model"
        v-bind="controlAttrs"
        @input="model = ($event.target as HTMLInputElement).value"
      />
    </template>
  </FormField>
</template>
