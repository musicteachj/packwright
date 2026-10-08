<script setup lang="ts">
/**
 * An address the application has no page for.
 *
 * Inside the shell, so the masthead is there to leave by. The server still
 * answers such a path with 200 and the client, because it cannot tell a deep
 * link from a typo without a second copy of this router — see BACKLOG.md,
 * "Serving the client".
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { BUTTON } from '../components/chrome'

const route = useRoute()
const path = computed(() => route.fullPath)
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold tracking-tight">There is no page here</h1>
    <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
      Nothing in packwright lives at
      <span class="numeric text-chrome-200 break-all" data-test="missing-path">{{ path }}</span
      >. If you followed a link to a saved label, saved labels live under
      <span class="numeric text-chrome-200">/labels</span>.
    </p>
    <div class="flex flex-wrap gap-3">
      <RouterLink :class="[BUTTON, 'px-4 py-2 text-sm']" to="/">Go to the start</RouterLink>
      <RouterLink :class="[BUTTON, 'px-4 py-2 text-sm']" to="/labels">Saved labels</RouterLink>
    </div>
  </div>
</template>
