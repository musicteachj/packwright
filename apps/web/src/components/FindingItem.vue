<script setup lang="ts">
/**
 * One finding.
 *
 * It states the claim, what was measured against what is required, and the
 * provision behind it. The citation is the point — it is what makes the panel
 * credible rather than decorative, and it is why no part of this app will show a
 * finding a model wrote.
 *
 * A button rather than a div with a click handler, so the finding → canvas link
 * is reachable from the keyboard without reimplementing what a button already
 * does.
 */
import type { Finding } from '@packwright/label-core'
import { computed } from 'vue'
import { SEVERITY_STYLES } from '../severity'

const props = withDefaults(
  defineProps<{
    finding: Finding
    selected: boolean
    /**
     * Whether selecting this finding does anything.
     *
     * False on the audit report, which has no canvas to highlight. A finding
     * rendered as a `<button aria-pressed="false">` that does nothing when
     * activated announces itself as a toggle and is not one — the same defect
     * as the Digital Link finding below, arriving from the other direction.
     */
    selectable?: boolean
  }>(),
  { selectable: true },
)
defineEmits<{ select: [elementId: string] }>()

const style = SEVERITY_STYLES[props.finding.severity]

/**
 * Only a button when there is something to select.
 *
 * A Digital Link finding carries no `elementId` — it is about a URI, not about
 * geometry — so clicking it used to *clear* the canvas highlight rather than set
 * one: a control that looks interactive and undoes your last action.
 */
const interactive = computed(() => props.selectable && props.finding.elementId !== undefined)
</script>

<template>
  <!--
    Phrasing content only. `<p>` and `<dl>` are not permitted inside a `<button>`,
    and ARIA flattens whatever is there into one accessible name — so the
    measurement and the citation were being run together into an unreadable
    string for a screen reader.
  -->
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="border-chrome-800 flex w-full flex-col gap-1.5 border-b border-l-[3px] px-4 py-3 text-left"
    :class="[
      // The severity's own edge, which is what lets everything that is NOT a
      // verdict stop competing for colour. A finding is the only thing in the
      // rail that carries one.
      //
      // `border-l-` and not the all-sides utility: that one sets `border-color`
      // outright, so it recoloured the `border-b` divider between findings too,
      // and which colour won was decided by where Tailwind happened to emit the
      // two rules rather than by anything written here.
      style.edge,
      interactive
        ? 'hover:bg-chrome-800 focus-visible:outline-notice cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2'
        : '',
      selected ? 'bg-chrome-800' : 'bg-transparent',
    ]"
    :aria-pressed="interactive ? selected : undefined"
    @click="interactive && $emit('select', finding.elementId!)"
  >
    <!--
      Icon and word together, always. Warning and pass are within 1.06 of each
      other in luminance on this chrome — near-identical in greyscale — so colour
      cannot be the only thing distinguishing them.
    -->
    <span class="flex items-center gap-2 text-xs font-semibold tracking-wide" :class="style.text">
      <span aria-hidden="true">{{ style.icon }}</span>
      <span>{{ style.word }}</span>
    </span>

    <span class="text-chrome-200 block text-sm leading-snug">{{ finding.message }}</span>

    <span
      v-if="finding.measurement"
      class="numeric text-chrome-400 flex flex-wrap gap-x-4 gap-y-1 text-xs"
    >
      <span class="flex gap-1.5">
        measured <span class="text-chrome-200">{{ finding.measurement.actual }}</span>
      </span>
      <span class="flex gap-1.5">
        requires <span class="text-chrome-200">{{ finding.measurement.required }}</span>
      </span>
    </span>

    <span class="numeric text-chrome-400 block text-xs">
      {{ finding.citation.authority }} · {{ finding.citation.reference }}
    </span>
  </component>
</template>
