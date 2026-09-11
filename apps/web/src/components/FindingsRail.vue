<script setup lang="ts">
/**
 * The findings rail.
 *
 * Grouped by the ANSI Z535.4 signal-word scale, most severe first, with the
 * checks that passed collapsed at the bottom. "18 checks passed" is both
 * reassuring and evidence of thoroughness — and it is only honest because a rule
 * that could not run returns nothing rather than a pass.
 *
 * Changes announce through a polite live region rather than `role="alert"` on
 * every item. The findings recompute on each keystroke, and an assertive region
 * per finding would interrupt a screen-reader user continuously while they typed
 * a GTIN. The summary is what changed; the detail is there to navigate to.
 */
import type { Finding, Severity } from '@packwright/label-core'
import { computed } from 'vue'
import { SEVERITY_STYLES } from '../severity'
import FindingItem from './FindingItem.vue'

const props = defineProps<{
  groups: ReadonlyArray<[Severity, Finding[]]>
  failures: Finding[]
  passes: Finding[]
  /** Symbols that could not be certified — reported, but deliberately not judged. */
  uncertifiable: ReadonlyArray<{ elementId: string; reasons: string[] }>
  selectedElementId: string | null
}>()

defineEmits<{ select: [elementId: string | undefined] }>()

const failureGroups = computed(() => props.groups.filter(([severity]) => severity !== 'pass'))

const findingCount = computed(() => props.failures.length + props.passes.length)

const summary = computed(() => {
  const failed = props.failures.length
  const passed = props.passes.length
  // "All checks passed" has to account for the checks that were declined, or the
  // announcement contradicts the notice sitting directly above it.
  const declined = props.uncertifiable.length
    ? ` ${props.uncertifiable.length} symbol${props.uncertifiable.length === 1 ? '' : 's'} could not be checked.`
    : ''

  if (failed === 0 && passed === 0) return 'No checks have run.'
  if (failed === 0 && !declined) return `All ${passed} checks passed.`
  if (failed === 0) return `${passed} checks passed.${declined}`
  return `${failed} ${failed === 1 ? 'finding' : 'findings'}, ${passed} checks passed.${declined}`
})
</script>

<template>
  <section class="flex h-full flex-col overflow-y-auto" aria-labelledby="findings-heading">
    <h2
      id="findings-heading"
      class="text-chrome-200 border-chrome-800 bg-chrome-900 sticky top-0 border-b px-4 py-3 text-xs font-semibold tracking-wide uppercase"
    >
      Compliance
    </h2>

    <p class="sr-only" role="status" aria-live="polite">{{ summary }}</p>

    <div v-for="[severity, items] in failureGroups" :key="severity">
      <h3
        class="border-chrome-800 bg-chrome-950 border-b px-4 py-2 text-xs font-semibold tracking-wide"
        :class="SEVERITY_STYLES[severity].text"
      >
        {{ SEVERITY_STYLES[severity].heading }} ({{ items.length }})
      </h3>
      <FindingItem
        v-for="(finding, index) in items"
        :key="`${finding.code}-${index}`"
        :finding="finding"
        :selected="!!finding.elementId && finding.elementId === selectedElementId"
        @select="$emit('select', $event)"
      />
    </div>

    <!--
      Stated in words because no rule states it. Artwork printed through a symbol
      destroys it while leaving both quiet zones clear, so every geometric check
      can pass on a barcode that will not scan. No clause covering overprinting
      has been verified against a source document, and this project does not ship
      rules it cannot cite — so the fact is reported and the verdict withheld.
    -->
    <section
      v-if="uncertifiable.length"
      class="border-caution bg-chrome-950 m-4 border-l-2 px-3 py-3"
      aria-labelledby="cannot-check-heading"
    >
      <h3
        id="cannot-check-heading"
        class="text-caution flex items-center gap-2 text-xs font-semibold"
      >
        <span aria-hidden="true">{{ SEVERITY_STYLES.advisory.icon }}</span>
        Cannot be checked
      </h3>
      <template v-for="symbol in uncertifiable" :key="symbol.elementId">
        <p
          v-for="reason in symbol.reasons"
          :key="reason"
          class="text-chrome-200 mt-2 text-sm leading-snug"
        >
          {{ reason }}
        </p>
      </template>
    </section>

    <!--
      Guarded on a check having actually run, not merely on nothing having
      failed. With no resolvable layout there are no findings at all, and the
      earlier condition rendered a green tick and "Every check passed" for a
      label that could not be drawn — while the live region alongside it
      correctly said no checks had run.
    -->
    <p
      v-if="failures.length === 0 && passes.length > 0 && uncertifiable.length === 0"
      class="text-pass flex items-center gap-2 px-4 py-6 text-sm"
    >
      <span aria-hidden="true">{{ SEVERITY_STYLES.pass.icon }}</span>
      Every check passed.
    </p>
    <p v-else-if="findingCount === 0" class="text-chrome-300 px-4 py-6 text-sm leading-relaxed">
      No checks have run — there is no resolved label to measure yet.
    </p>

    <details v-if="passes.length" class="border-chrome-800 mt-auto border-t">
      <summary
        class="text-chrome-300 hover:bg-chrome-800 focus-visible:outline-notice cursor-pointer px-4 py-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span class="text-pass" aria-hidden="true">{{ SEVERITY_STYLES.pass.icon }}</span>
        {{ passes.length }} checks passed
      </summary>
      <FindingItem
        v-for="(finding, index) in passes"
        :key="`${finding.code}-${index}`"
        :finding="finding"
        :selected="!!finding.elementId && finding.elementId === selectedElementId"
        @select="$emit('select', $event)"
      />
    </details>
  </section>
</template>
