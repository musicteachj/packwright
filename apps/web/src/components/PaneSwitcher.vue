<script setup lang="ts">
/**
 * Form / Preview / Checks, below the width the three panes fit in.
 *
 * **A tablist, where the canvas zoom control beside it is a group of pressed
 * buttons, and the difference is real rather than an inconsistency.** Zoom is a
 * set of independent states of one thing — `aria-pressed` says "this button is
 * currently on". This switches which of three regions is displayed, which is what
 * `tablist` / `tab` / `tabpanel` describes: `aria-selected` says which one you
 * are looking at, and `aria-controls` says what it governs. Forcing them to match
 * would mean announcing one of them wrongly.
 *
 * **Rendered only when it applies**, rather than hidden by `lg:hidden`. A role
 * cannot be set by a media query, so the hidden version left a wide screen with
 * three `tabpanel`s and no visible `tab` owning any of them — measured as zero
 * visible tabs against three visible panels. An orphan panel is not a cosmetic
 * problem; it is a promise to assistive technology that nothing keeps.
 *
 * Having announced `tablist`, it owes the keyboard contract that goes with it:
 * arrows move between tabs, Home and End jump to the ends, and only the selected
 * tab is in the tab order so that Tab leaves the control rather than walking it.
 */
import { computed, useTemplateRef } from 'vue'
import type { EditorPane } from '../panes'
import { EDITOR_PANES } from '../panes'

const props = defineProps<{ current: EditorPane }>()
const emit = defineEmits<{ select: [pane: EditorPane] }>()

const index = computed(() => EDITOR_PANES.findIndex((pane) => pane.id === props.current))

const list = useTemplateRef<HTMLElement>('list')

/**
 * Arrow keys move selection, which for a tablist is also what moves focus.
 *
 * Bound to the tabs rather than to the list. A `tablist` is not itself focusable —
 * its tabs are — so a keydown handler on the container is an interactive element
 * with nothing to interact with, which `vuejs-accessibility` catches and is right
 * to. The tabs already receive keys because they already receive focus.
 */
function onKeydown(event: KeyboardEvent) {
  const last = EDITOR_PANES.length - 1
  const next = {
    ArrowRight: Math.min(index.value + 1, last),
    ArrowLeft: Math.max(index.value - 1, 0),
    Home: 0,
    End: last,
  }[event.key]
  if (next === undefined || next === index.value) return

  event.preventDefault()
  const pane = EDITOR_PANES[next]!
  emit('select', pane.id)
  // Focus follows selection, which is the automatic-activation pattern: the panel
  // changes as you arrow across, so leaving focus behind would narrate one pane
  // while showing another.
  list.value?.querySelector<HTMLElement>(`#tab-${pane.id}`)?.focus()
}
</script>

<template>
  <div
    class="border-chrome-800 bg-chrome-900 flex gap-px border-b p-2"
    ref="list"
    role="tablist"
    aria-label="Editor panes"
  >
    <button
      v-for="pane in EDITOR_PANES"
      :id="`tab-${pane.id}`"
      :key="pane.id"
      type="button"
      role="tab"
      class="border-chrome-700 focus-visible:outline-notice flex-1 border px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
      :class="
        current === pane.id
          ? 'bg-chrome-800 text-chrome-100'
          : 'bg-chrome-900 text-chrome-300 hover:bg-chrome-800'
      "
      :aria-selected="current === pane.id"
      :aria-controls="`pane-${pane.id}`"
      :tabindex="current === pane.id ? 0 : -1"
      @click="emit('select', pane.id)"
      @keydown="onKeydown"
    >
      {{ pane.label }}
    </button>
  </div>
</template>
