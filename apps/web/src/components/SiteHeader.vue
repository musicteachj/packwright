<script lang="ts">
/** The masthead's entries, which `RouteMeta.section` names. */
export type Section = 'landing' | 'labels' | 'audit' | 'rules' | 'design'
</script>

<script setup lang="ts">
/**
 * The masthead for the reading routes — everything except the editor.
 *
 * **Mounted once, by `AppShell`**, rather than by each page. It used to be placed
 * by every view inside its own column, which made it a copy per route and let one
 * route put it in the wrong place (`/audit`, outside the column). It now outlives
 * navigation between the reading routes, so moving from Rules to Saved changes
 * the page and leaves the chrome where it was.
 *
 * **Still not above the editor.** The editor is a full-height three-pane
 * application with its own header and its own `h-screen` scroll contract: a band
 * of chrome above it would push the canvas off the bottom of the window. The
 * band here takes the editor's header geometry instead — the same hairline, the
 * same height — so the two read as one application's chrome in two shapes.
 *
 * The band is full-bleed and its contents sit in the page's column, because
 * `the-masthead.spec.ts` measures the wordmark against the page heading beneath
 * it: that alignment is what made `/audit`'s masthead visibly wrong, and it is
 * kept.
 *
 * The nav wraps at narrow widths on purpose. At 375px five entries do not fit
 * beside the wordmark, and a plain `flex` row ran the nav past the edge of the
 * viewport instead of shrinking. `flex-wrap` with `justify-end` lets it break
 * onto a second line that still ends flush with the page's right gutter.
 *
 * Every entry is at least 24px tall (`min-h-6`), WCAG 2.2's target floor. The
 * old text links were the 16px line box of 12px type.
 */
import { BUTTON, PAGE_COLUMN } from './chrome'

/** `undefined` on a page that is none of the sections — the 404. */
const props = defineProps<{ current: Section | undefined }>()

const LINKS: readonly { section: Section; to: string; label: string }[] = [
  { section: 'labels', to: '/labels', label: 'Saved' },
  { section: 'audit', to: '/audit', label: 'Audit' },
  { section: 'rules', to: '/rules', label: 'Rules' },
  { section: 'design', to: '/design', label: 'Design' },
]

const FOCUS =
  'focus-visible:outline-notice focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

const linkClass = (section: Section) =>
  props.current === section
    ? 'text-chrome-100 border-chrome-100'
    : 'text-chrome-400 hover:text-chrome-200 border-transparent'

const ariaCurrent = (section: Section) =>
  props.current === section ? ('page' as const) : undefined
</script>

<template>
  <header class="border-chrome-800 border-b">
    <div :class="[PAGE_COLUMN, 'flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3']">
      <RouterLink
        :class="[FOCUS, 'flex min-h-6 items-center gap-3']"
        :aria-current="ariaCurrent('landing')"
        to="/"
      >
        <span class="text-notice text-lg" aria-hidden="true">⊕</span>
        <span class="text-sm font-semibold tracking-tight">packwright</span>
      </RouterLink>

      <nav
        class="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-xs"
        aria-label="Sections"
      >
        <RouterLink
          v-for="link in LINKS"
          :key="link.section"
          :class="[FOCUS, linkClass(link.section), 'flex min-h-6 items-center border-b']"
          :aria-current="ariaCurrent(link.section)"
          :to="link.to"
        >
          {{ link.label }}
        </RouterLink>
        <!--
          The one action in the masthead, so it looks like one. It never takes
          `aria-current`: the editor is not a reading route and never renders this
          header.
        -->
        <RouterLink :class="[BUTTON, 'flex min-h-6 items-center px-3 py-1']" to="/labels/new">
          New label
        </RouterLink>
      </nav>
    </div>
  </header>
</template>
