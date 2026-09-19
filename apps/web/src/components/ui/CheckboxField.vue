<script setup lang="ts">
/**
 * A checkbox and its own label, on one line — not a variant of `FormField`'s
 * label/control/description shape, because a checkbox's label follows the
 * control rather than sitting above it. `FormField` puts the accessible name
 * before the slot and help below it; neither is what a checkbox wants, so
 * this component renders `<label><input type="checkbox"><span>…</span></label>`
 * directly and does not use `FormField` at all.
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
import { computed, onMounted, useAttrs, useTemplateRef } from 'vue'
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

/**
 * The visible text and the stated name have to agree, and nothing else checks.
 *
 * `label` is required because it says what the control is called; a slot then
 * renders it differently. If the two drift apart the control is named one thing
 * and reads as another — which breaks voice control, where a user says what they
 * can see, and misleads anyone auditing the rail against its label prop.
 */
const text = useTemplateRef<HTMLElement>('text')

onMounted(() => {
  if (!import.meta.env.DEV) return
  const rendered = text.value?.textContent?.replace(/\s+/g, ' ').trim()
  const stated = props.label.replace(/\s+/g, ' ').trim()
  if (rendered && rendered !== stated) {
    console.warn(
      `[CheckboxField] #${props.id} renders "${rendered}" but its label prop says "${stated}". ` +
        'The rendered text is the accessible name, so these must agree.',
    )
  }
})
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
    <!--
      A slot over the prop, for the same reason `FormField`'s description has
      one: some labels are not a single run of prose. The 44 GHS hazard classes
      read `2.6 Flammable liquids Category 1,2,3 → GHS02`, where the class number
      and the pictogram code are identifiers and belong in the mono face — losing
      that on migration would have undone the typeface rule on 44 rows at once,
      which is the rule this component layer exists to apply.

      **The slot becomes the accessible name.** An earlier version of this comment
      claimed it did not — that `label` stayed the name and the slot only changed
      how it was set — and that was plainly wrong: the name of a `<label>` is its
      text content, so whatever the slot renders *is* the name. The `label` prop
      is the fallback and the stated intent, and the two silently disagreeing is
      the failure worth catching, so the mismatch is reported in development
      rather than trusted.
    -->
    <span ref="text"
      ><slot>{{ props.label }}</slot></span
    >
  </label>
</template>
