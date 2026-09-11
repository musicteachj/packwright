<script setup lang="ts">
/**
 * One section of the form rail.
 *
 * Sections, not steps. A linear stepper fights label editing, where you jump
 * between fields constantly — you set a magnification, look at the quiet zone,
 * go back and change the stock. Everything stays open.
 *
 * It also owns half of the finding ↔ form link. A section declares which label
 * element its fields drive; focusing anything inside it selects that element, and
 * selecting that element from elsewhere scrolls this section into view and rings
 * it. Keeping both directions here means there is one place where the
 * association lives, rather than a handler per input.
 */
import { ref, watch } from 'vue'

const props = defineProps<{
  title: string
  /** The label element these fields position or populate, if any. */
  elementId?: string
  selectedElementId: string | null
  /** Short completeness note, e.g. "not set". */
  status?: string
  /**
   * Whether this section scrolls itself into view when its element is selected.
   *
   * Product and Symbol both drive the symbol, which is correct — but with both
   * scrolling, one selection fired two competing `scrollIntoView` calls and the
   * rail jumped between them. The first section owning an element scrolls; the
   * rest still ring.
   */
  scrollOnSelect?: boolean
}>()

const emit = defineEmits<{ select: [elementId: string] }>()

const root = ref<HTMLElement | null>(null)

watch(
  () => props.selectedElementId,
  (selected) => {
    if (!props.elementId || selected !== props.elementId) return
    if (props.scrollOnSelect === false) return
    // `nearest` rather than `center`: the rail is a scrolling column and yanking
    // it to centre on every finding click loses the reader's place.
    root.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  },
)

const isSelected = () => !!props.elementId && props.elementId === props.selectedElementId

/**
 * Only a section that owns an element speaks for the canvas.
 *
 * Stock and Digital Link own none, and emitting an undefined id from them
 * cleared the selection rather than leaving it alone — so clicking a finding on
 * the symbol, then tabbing into Stock to widen the label and fix it, erased the
 * outline showing what needed to move. The two halves stopped agreeing about
 * what was selected at exactly the moment the user was acting on it.
 */
const onFocusIn = () => {
  if (props.elementId) emit('select', props.elementId)
}
</script>

<template>
  <section
    ref="root"
    class="border-chrome-800 border-b px-4 py-4"
    :class="isSelected() ? 'bg-chrome-800' : ''"
    @focusin="onFocusIn"
  >
    <header class="mb-3 flex items-baseline justify-between gap-3">
      <h3 class="text-chrome-200 text-xs font-semibold tracking-wide uppercase">{{ title }}</h3>
      <p v-if="status" class="numeric text-chrome-400 text-xs">{{ status }}</p>
    </header>
    <div class="flex flex-col gap-3">
      <slot />
    </div>
  </section>
</template>
