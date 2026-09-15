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

const props = withDefaults(
  defineProps<{
    groups: ReadonlyArray<[Severity, Finding[]]>
    failures: Finding[]
    passes: Finding[]
    /** Symbols that could not be certified — reported, but deliberately not judged. */
    uncertifiable: ReadonlyArray<{ elementId: string; reasons: string[] }>
    selectedElementId: string | null
    /**
     * The id this rail's heading takes, so two of them can share a page.
     *
     * Hardcoded before the audit report reused this component, which would have
     * put two `id="findings-heading"` attributes in one document and left both
     * `aria-labelledby` references pointing at whichever the browser picked.
     * Defaulted to what it was, so the editor is untouched.
     */
    headingId?: string
    /** Overridden where "Compliance" is not what the section is. */
    title?: string
    /**
     * Whether this rail owns an `aria-live` region.
     *
     * It has been the only one in the application, and `EditorView.vue` documents
     * the care taken to keep exactly one live at a time. A page that already has
     * one turns this off rather than adding a second — two regions announcing
     * over each other is worse than one that says less.
     */
    announce?: boolean
    /** Passed through: false where there is no canvas for a selection to reach. */
    selectable?: boolean
  }>(),
  {
    headingId: 'findings-heading',
    title: 'Compliance',
    // **Stated, not inferred.** An absent Boolean prop is `false` in Vue, not
    // `undefined` — so `v-if="announce !== false"` with no default turned the
    // live region off for every caller, including the editor, and three tests
    // said so immediately. A flag whose safe value is "on" has to say so here.
    announce: true,
    selectable: true,
  },
)

/**
 * The declined-checks heading keeps its original id for the default caller.
 *
 * Deriving it from `headingId` unconditionally renamed an attribute three
 * existing tests query for, which is a gratuitous break for a component that
 * was working.
 */
const declinedHeadingId = computed(() =>
  props.headingId === 'findings-heading'
    ? 'cannot-check-heading'
    : `${props.headingId}-cannot-check`,
)

defineEmits<{ select: [elementId: string | undefined] }>()

const failureGroups = computed(() => props.groups.filter(([severity]) => severity !== 'pass'))

const findingCount = computed(() => props.failures.length + props.passes.length)

const summary = computed(() => {
  const failed = props.failures.length
  const passed = props.passes.length
  // "All checks passed" has to account for the checks that were declined, or the
  // announcement contradicts the notice sitting directly above it.
  // "Element" rather than "symbol": this list now carries anything the engine
  // could not draw as well as the symbols no rule judges, and calling a net
  // quantity declaration a symbol would be wrong on the one line a screen reader
  // announces.
  const declined = props.uncertifiable.length
    ? ` ${props.uncertifiable.length} element${props.uncertifiable.length === 1 ? '' : 's'} could not be checked.`
    : ''

  // `checks` is pluralised for the same reason `findings` and `symbols` are: a
  // live region that says "All 1 checks passed" reads as careless on a tool that
  // will not paraphrase a single character of a regulated statement.
  const checks = `${passed} ${passed === 1 ? 'check' : 'checks'} passed`

  if (failed === 0 && passed === 0) return 'No checks have run.'
  if (failed === 0 && !declined) return `All ${checks}.`
  if (failed === 0) return `${checks}.${declined}`
  return `${failed} ${failed === 1 ? 'finding' : 'findings'}, ${checks}.${declined}`
})
</script>

<template>
  <section class="flex h-full flex-col overflow-y-auto" :aria-labelledby="headingId">
    <h2
      :id="headingId"
      class="text-chrome-200 border-chrome-800 bg-chrome-900 sticky top-0 border-b px-4 py-3 text-xs font-semibold tracking-wide uppercase"
    >
      {{ title }}
    </h2>

    <p v-if="announce" class="sr-only" role="status" aria-live="polite">
      {{ summary }}
    </p>

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
        :selectable="selectable"
        :finding="finding"
        :selected="!!finding.elementId && finding.elementId === selectedElementId"
        @select="$emit('select', $event)"
      />
    </div>

    <!--
      Stated in words because no rule states it, for two reasons that read the
      same way to a user. Artwork printed through a symbol destroys it while
      leaving both quiet zones clear, so every geometric check can pass on a
      barcode that will not scan — and no clause covering overprinting has been
      verified against a source document, so the fact is reported and the verdict
      withheld. An element the engine could not draw is the other: its rules
      decline to certify it, and without this block those checks would simply
      vanish from the rail, which reads exactly like a check nobody wrote.
    -->
    <section
      v-if="uncertifiable.length"
      class="border-caution bg-chrome-950 m-4 border-l-2 px-3 py-3"
      :aria-labelledby="declinedHeadingId"
    >
      <h3
        :id="declinedHeadingId"
        class="text-caution flex items-center gap-2 text-xs font-semibold"
      >
        <span aria-hidden="true">{{ SEVERITY_STYLES.advisory.icon }}</span>
        Cannot be checked
      </h3>
      <template v-for="item in uncertifiable" :key="item.elementId">
        <p
          v-for="reason in item.reasons"
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
        :selectable="selectable"
        :finding="finding"
        :selected="!!finding.elementId && finding.elementId === selectedElementId"
        @select="$emit('select', $event)"
      />
    </details>
  </section>
</template>
