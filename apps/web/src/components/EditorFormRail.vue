<script setup lang="ts">
/**
 * The form rail — a shell that picks the rail for the label type.
 *
 * The `<form>`, its accessible name and the sticky heading live here so both
 * rails share them; the per-type rails contribute sections only. Splitting this
 * way keeps `EditorSection` — which owns half the finding ↔ form link — common
 * to both, so the signature interaction cannot work on one label type and
 * silently not on the other.
 */
import { useLabelDocumentStore } from '../stores/labelDocument'
import GhsFormRail from './GhsFormRail.vue'
import UpcAFormRail from './UpcAFormRail.vue'

const store = useLabelDocumentStore()
</script>

<template>
  <form class="flex h-full flex-col overflow-y-auto" aria-label="Label details" @submit.prevent>
    <h2
      class="text-chrome-200 border-chrome-800 bg-chrome-900 sticky top-0 border-b px-4 py-3 text-xs font-semibold tracking-wide uppercase"
    >
      Label
    </h2>

    <GhsFormRail v-if="store.labelType === 'ghs-chemical'" />
    <UpcAFormRail v-else />
  </form>
</template>
