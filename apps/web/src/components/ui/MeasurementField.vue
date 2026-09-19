<script setup lang="ts">
/**
 * A single-line control for a measurement — a panel width, a bar weight, a
 * percentage — the field `numeric` is actually for: IBM Plex Mono with
 * tabular figures, so a column of widths lines up on its digits. It keeps
 * `formStyles.ts`'s existing `INPUT` unchanged, `numeric` and all;
 * `TextField` is the sibling that drops it for running prose.
 *
 * Defaults to `type="number"`, matching every measurement field across the
 * three rails today (`GhsFormRail.vue`, `UpcAFormRail.vue`,
 * `UsFoodFormRail.vue` all use it, with `min`/`max`/`step` alongside) — those
 * fall through as ordinary attrs, along with everything else the control
 * needs and this component doesn't itself know about.
 *
 * See `TextField.vue`'s comment for why `model` is wired to the input by hand
 * (`:value` + `@input`, not a literal `v-model` on the element) rather than
 * through Vue's own `v-model` directive sugar: the directive reasserts the
 * bound value on every update even when nothing is bound, which would
 * overwrite a caller's plain `:value` with the literal string `"undefined"`.
 * The same reasoning applies here unchanged.
 */
import { computed, useAttrs } from 'vue'
import FormField from './FormField.vue'
import { CONTROL_BORDER, CONTROL_BORDER_INVALID, MEASUREMENT_INPUT } from '../formStyles'

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

/**
 * Typed for both bindings, and it honours `.number`.
 *
 * Thirty-two of the thirty-four `type="number"` sites this replaces are written
 * `v-model.number`, because on a raw input that is what turns "12" into 12
 * before it reaches a store field the layout engine will do arithmetic on.
 * Declared `<string>` and without the modifier, those sites would either fail
 * `vue-tsc` on migration or quietly store strings where millimetres are
 * expected.
 *
 * `looseToNumber` is Vue's own rule for the modifier, reimplemented because it
 * is not exported: parse it, and hand back the original string if the parse
 * produced nothing — so a half-typed "1e" stays "1e" rather than becoming `NaN`
 * mid-keystroke. The rails' own guards (`requiredNumber`, `optionalNumber`,
 * `asMeasurement`) still decide what an empty or refused value means; this only
 * stops the component lying about the type it emits.
 */
const [model, modelModifiers] = defineModel<number | string>()

const looseToNumber = (value: string): number | string => {
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? value : parsed
}

const emitValue = (raw: string) => {
  model.value = modelModifiers.number ? looseToNumber(raw) : raw
}
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
        type="number"
        :class="[MEASUREMENT_INPUT, controlInvalid ? CONTROL_BORDER_INVALID : CONTROL_BORDER]"
        :aria-describedby="describedBy"
        :aria-invalid="controlInvalid || undefined"
        :value="model"
        v-bind="controlAttrs"
        @input="emitValue(($event.target as HTMLInputElement).value)"
      />
    </template>
  </FormField>
</template>
