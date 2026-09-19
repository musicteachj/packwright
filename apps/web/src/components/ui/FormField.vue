<script setup lang="ts">
/**
 * A label, its control, and its help — wired together the one way that is
 * actually correct, so nobody has to re-derive it per call site.
 *
 * The three form rails hand-assemble 105 of these from `formStyles.ts`'s
 * `LABEL`/`INPUT` strings, and a survey of the hardest of them turned up six
 * things a plain `<label>{{ text }}<input /></label>` cannot say:
 *
 * 1. A description can be a live region. `UpcAFormRail.vue`'s GTIN field has
 *    `aria-invalid`, a conditional `aria-describedby`, and two mutually
 *    exclusive `<p>`s sharing one id, both `role="status" aria-live="polite"`.
 *    That is markup, not a string, so `description` is also a slot.
 *
 * 2. Help is a SIBLING of the label with an id, wired by `aria-describedby` —
 *    never a child of the `<label>`. `UsFoodFormRail.vue` (around line 1801)
 *    nests a forty-word paragraph inside the `<label>` today, which makes that
 *    paragraph part of the field's accessible name. The template below makes
 *    that shape unrepresentable: the description renders after `</label>`,
 *    structurally, not by convention.
 *
 * 3. A label can be visible or `sr-only` with no change to the accessible
 *    name. Seven sites in `UsFoodFormRail.vue` (ingredient and override
 *    columns) hide the label text; `labelHidden` toggles a class on the same
 *    `<span>`, so the name computation never sees a difference.
 *
 * 4. Not every control is `v-model`. Ingredient rows write through an array
 *    map with `:value` + `@input`, and GHS's "Add a statement" select has no
 *    bound value at all. So the control is the caller's markup, handed the
 *    pieces it needs (`id`, `describedBy`, `invalid`) through a scoped slot
 *    rather than owned by this component.
 *
 * 5. Width and row layout are the caller's business — `flex-1`, `w-20`, `w-24`
 *    land on the field's root today. `inheritAttrs` is left on and the root is
 *    a single `<div>` so a caller's `class` (or any other attr) lands exactly
 *    there, not on the `<label>` or buried in a slot.
 *
 * 6. Ids are explicit, never generated. Six of them are addressed from `e2e/`
 *    specs (`#field-gtin`, `#field-label-type`, `#field-ghs-product`,
 *    `#field-food-nf-basis`, `#field-food-nf-dual`, `#field-food-nf-format`)
 *    and some are built per loop index. A `useId()` scheme would change every
 *    one of those silently. `id` is a required prop instead.
 *
 * `describedBy` is handed to the default slot as
 * `undefined` — not `''` and not a computed-but-absent id — whenever there is
 * nothing to describe, so a caller that always binds
 * `:aria-describedby="describedBy"` never emits a dangling reference to an
 * element this component did not render.
 */
import { useSlots } from 'vue'
import { LABEL } from '../formStyles'

const props = withDefaults(
  defineProps<{
    id: string
    /** The accessible name. Always rendered in the DOM — see `labelHidden`. */
    label: string
    /** Visually hides the label with `sr-only`. The accessible name is unchanged. */
    labelHidden?: boolean
    /** Static help under the control. For anything conditional or richer, use the `description` slot instead. */
    description?: string
    /** Marks the description as `role="status" aria-live="polite"`, for the one field that validates as you type. */
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

const slots = useSlots()

/**
 * Functions, not computeds, and that is the whole point.
 *
 * `useSlots()` hands back the instance's slot record. Vue mutates it in place on
 * update rather than replacing it, so it is not a reactive dependency: a
 * `computed` that reads `slots.description` is evaluated once and never
 * invalidated. A parent that reveals a `#description` slot after mount got
 * nothing, and one that removed it left an empty `<div>` behind with the
 * control's `aria-describedby` still pointing at it — the dangling reference
 * this component's own notes promise it prevents, in exactly the conditional
 * live-note shape it was built for. Called during render instead, so each pass
 * reads the slots that pass actually has.
 */
const hasDescription = () => !!props.description || !!slots.description

const describedBy = () => (hasDescription() ? `${props.id}-description` : undefined)
</script>

<template>
  <div>
    <!--
      The control is in the slot, and a lint rule cannot see through a slot.

      `label-has-for` wants a label that both carries `for` and wraps its
      control. This one does both — every caller puts its control in the slot
      below, and `for` is bound two lines down — but the rule is static and the
      slot's contents are not. Disabled here rather than relaxed in
      `eslint.config.js`, because the guarantee is worth keeping everywhere else:
      this is the one place in the app where a label's control is not written
      beside it. `FormField.test.ts` asserts the association instead, which is
      the stronger check anyway — it reads the rendered DOM rather than the
      source.
    -->
    <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
    <label :class="LABEL" :for="id">
      <span :class="{ 'sr-only': labelHidden }">{{ label }}</span>
      <slot :id="id" :described-by="describedBy()" :invalid="invalid" />
    </label>

    <!--
      A `div`, and neutral, on purpose.

      `live` says the description is announced when it changes. It says nothing
      about severity, and the two must not be welded together: the GTIN field
      carries two live notes, one where a pasted symbol was refused and one where
      it was taken with a caveat, and painting both `text-caution` would report a
      successful scan as a warning. Tone travels with the slotted content.

      A `div` rather than a `p` because the slotted content is itself a `p` in
      the case this exists for — two mutually exclusive paragraphs sharing one
      id — and a `p` inside a `p` is not valid HTML and does not nest in the DOM
      the way the markup reads.
    -->
    <div
      v-if="hasDescription()"
      :id="describedBy()"
      class="text-chrome-400 text-xs"
      :role="live ? 'status' : undefined"
      :aria-live="live ? 'polite' : undefined"
    >
      <slot name="description">{{ description }}</slot>
    </div>
  </div>
</template>
