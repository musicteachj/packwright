<script setup lang="ts">
/**
 * A checkbox and its own label, on one line — not a variant of `Field`'s
 * label/control/description shape, because a checkbox's label follows the
 * control rather than sitting above it. `Field` puts the accessible name
 * before the slot and help below it; neither is what a checkbox wants, so
 * this component renders `<label><input type="checkbox"><span>…</span></label>`
 * directly and does not use `Field` at all.
 *
 * Two things were measured on the canvas, not inferred: the box came out
 * 13×13 in a 16px row, under WCAG 2.2 AA's 24×24 target-size floor, and the
 * gap between box and word measured 0px because those `<label>`s carry no
 * class at all. `CHECKBOX_INPUT` sets the box to `size-4` (16px);
 * `CHECKBOX_LABEL` sets `min-h-6` (24px) and `gap-2.5` (10px) on the row, and
 * `items-start` rather than `items-center` so a label that wraps to a second
 * line keeps its box level with the first line instead of floating at the
 * middle of the whole block. `accent-notice` is already on the six GHS and
 * UPC-A checkboxes and on none of the fourteen US food ones; it ships here on
 * all of them.
 *
 * `UpcAFormRail.vue`'s hazard checkboxes bind `:checked` and `@change`
 * against array membership rather than a boolean ref — there is no single
 * value to hand `v-model`. `model` is wired to the input by hand (`:checked`
 * + `@change`, not a literal `v-model` on the element) for the same reason
 * `TextField` does: attrs land after the hand-written binding, so a caller's
 * own `:checked`/`@change` pair overwrites the unbound default instead of
 * fighting a directive that would otherwise reassert it.
 */
import { computed, useAttrs } from 'vue'
import { CHECKBOX_INPUT, CHECKBOX_LABEL } from '../formStyles'

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

const props = defineProps<{
  id: string
  label: string
}>()

const model = defineModel<boolean>()
</script>

<template>
  <label :for="props.id" :class="CHECKBOX_LABEL" v-bind="layoutAttrs">
    <input
      :id="props.id"
      type="checkbox"
      :class="CHECKBOX_INPUT"
      :checked="model"
      v-bind="controlAttrs"
      @change="model = ($event.target as HTMLInputElement).checked"
    />
    <span>{{ props.label }}</span>
  </label>
</template>
