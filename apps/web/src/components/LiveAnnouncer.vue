<script setup lang="ts">
/**
 * The application's one live region. See `stores/announcer.ts` for why there
 * is one, and why it is mounted at the root and never unmounted.
 *
 * `aria-live="polite"` and no `role="status"`. A status role implies
 * `aria-atomic="true"`, which would re-read every line whenever any one of
 * them changed — the findings count read out again each time a field's note
 * moved.
 */
import { useAnnouncerStore } from '../stores/announcer'

const store = useAnnouncerStore()
</script>

<template>
  <div class="sr-only" aria-live="polite">
    <p v-for="line in store.lines" :key="line.key">{{ line.text }}</p>
  </div>
</template>
