<script setup lang="ts">
/**
 * The masthead for the reading routes — the landing page and the rule catalogue.
 *
 * **Not a global shell.** Wrapping `RouterView` in one would put this above the
 * editor too, and the editor is a full-height three-pane application with its own
 * header and its own `h-screen` scroll contract: a band of chrome above it would
 * push the canvas off the bottom of the window. The two shapes are different on
 * purpose, so the shared part is a component the reading routes mount rather than
 * a wrapper imposed on everything.
 */
const props = defineProps<{ current: 'landing' | 'rules' }>()

/**
 * Both links read the prop, which only one of them used to.
 *
 * Every branch tested `current === 'rules'`, so `/rules` got the highlight and
 * `aria-current` and `/` got neither — `current="landing"` was a value the
 * component accepted and ignored. A prop that is passed, type-checked and inert
 * is worse than no prop: it reads at the call site as though the case is handled.
 */
const linkClass = (section: 'landing' | 'rules') =>
  props.current === section ? 'text-chrome-100' : 'text-chrome-400 hover:text-chrome-200'

const ariaCurrent = (section: 'landing' | 'rules') =>
  props.current === section ? ('page' as const) : undefined
</script>

<template>
  <header class="border-chrome-800 flex items-baseline justify-between gap-6 border-b pb-6">
    <RouterLink
      class="focus-visible:outline-notice flex items-baseline gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      :aria-current="ariaCurrent('landing')"
      to="/"
    >
      <span class="text-notice text-lg" aria-hidden="true">⊕</span>
      <span class="text-sm font-semibold tracking-tight">packwright</span>
    </RouterLink>

    <nav class="flex items-baseline gap-5 text-xs" aria-label="Sections">
      <RouterLink
        class="focus-visible:outline-notice focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        :class="linkClass('rules')"
        :aria-current="ariaCurrent('rules')"
        to="/rules"
      >
        Rules
      </RouterLink>
      <RouterLink
        class="text-chrome-400 hover:text-chrome-200 focus-visible:outline-notice focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        to="/labels/new"
      >
        Editor
      </RouterLink>
    </nav>
  </header>
</template>
