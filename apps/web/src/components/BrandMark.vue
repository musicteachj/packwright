<script setup lang="ts">
/**
 * The Packwright mark: a registration target on a dimension line.
 *
 * Chosen in Claude Design as direction 2b (`docs/design/logo/`), replacing the
 * font glyph ⊕ the headers used to set in `notice` blue. Drawn inline rather than
 * loaded as an image so its ink is `currentColor`, and so it is there on the
 * first paint with nothing to fetch. The geometry is `brand/mark-32.svg`'s,
 * unchanged.
 *
 * Decorative: every place it appears, the word "Packwright" is beside it and is
 * the link's accessible name.
 *
 * 16px on a 32-unit drawing puts its 2-unit strokes on whole device pixels on a
 * 2x screen, which is where the mark is sharpest. The hand-drawn 16px version is
 * for the favicon, where the browser decides the scale.
 */
</script>

<template>
  <svg
    class="size-4 shrink-0"
    viewBox="0 0 32 32"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    data-brand-mark
  >
    <path d="M15 4h2v24h-2zM1 15h30v2H1zM1 12h2v8H1zM29 12h2v8h-2z" />
    <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="2" />
  </svg>
</template>
