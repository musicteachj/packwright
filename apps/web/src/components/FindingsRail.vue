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
import { NOT_A_VERDICT, SEVERITY_STYLES } from '../severity'
import FindingItem from './FindingItem.vue'

const props = withDefaults(
  defineProps<{
    groups: ReadonlyArray<[Severity, Finding[]]>
    failures: Finding[]
    passes: Finding[]
    /** Symbols that could not be certified — reported, but deliberately not judged. */
    uncertifiable: ReadonlyArray<{ elementId: string; reasons: string[] }>
    /**
     * Checks that stood down for want of a fact the label never stated.
     *
     * Not the same as `uncertifiable`, which is about elements the engine could
     * not draw. These are questions nobody answered, and each reason ends by
     * naming what to state.
     */
    declined?: ReadonlyArray<{ ruleId: string; reason: string; citation: { reference: string } }>
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

const notRunHeadingId = computed(() =>
  props.headingId === 'findings-heading' ? 'not-run-heading' : `${props.headingId}-not-run`,
)

defineEmits<{ select: [elementId: string | undefined] }>()

const failureGroups = computed(() => props.groups.filter(([severity]) => severity !== 'pass'))

const findingCount = computed(() => props.failures.length + props.passes.length)

/**
 * What the visible strip shows: one entry per kind that has anything in it.
 *
 * Failures are grouped by severity so the strip distinguishes two violations
 * from two blocking findings, which a single "4 findings" would not. The two
 * non-verdict kinds are counted in neutral grey and marked with the glyphs from
 * `NOT_A_VERDICT`, because a colour on either would imply a severity where no
 * provision is being applied at all.
 */
const counts = computed(() => {
  const entries: { label: string; mark: string; total: number; tone: string }[] = []

  for (const [severity, items] of failureGroups.value) {
    entries.push({
      label: SEVERITY_STYLES[severity].word,
      mark: SEVERITY_STYLES[severity].icon,
      total: items.length,
      tone: SEVERITY_STYLES[severity].text,
    })
  }

  if (props.passes.length) {
    entries.push({
      label: SEVERITY_STYLES.pass.word,
      mark: SEVERITY_STYLES.pass.icon,
      total: props.passes.length,
      tone: SEVERITY_STYLES.pass.text,
    })
  }

  if (props.uncertifiable.length) {
    entries.push({
      label: 'cannot be checked',
      mark: NOT_A_VERDICT.uncertifiable,
      total: props.uncertifiable.length,
      tone: 'text-chrome-400',
    })
  }

  const declined = props.declined ?? []
  if (declined.length) {
    entries.push({
      label: 'did not run',
      mark: NOT_A_VERDICT.declined,
      total: declined.length,
      tone: 'text-chrome-400',
    })
  }

  return entries
})

const summary = computed(() => {
  const failed = props.failures.length
  const passed = props.passes.length
  // "All checks passed" has to account for the checks that were declined, or the
  // announcement contradicts the notice sitting directly above it.
  // "Element" rather than "symbol": this list now carries anything the engine
  // could not draw as well as the symbols no rule judges, and calling a net
  // quantity declaration a symbol would be wrong on the one line a screen reader
  // announces.
  const undrawn = props.uncertifiable.length
    ? ` ${props.uncertifiable.length} element${props.uncertifiable.length === 1 ? '' : 's'} could not be checked.`
    : ''
  // Announced separately from the undrawn elements above, for the reason the two
  // have separate blocks: one is the engine's problem and one is the label's.
  const notRun = (props.declined ?? []).length
    ? ` ${props.declined!.length} check${props.declined!.length === 1 ? '' : 's'} did not run.`
    : ''

  // `checks` is pluralised for the same reason `findings` and `symbols` are: a
  // live region that says "All 1 checks passed" reads as careless on a tool that
  // will not paraphrase a single character of a regulated statement.
  const checks = `${passed} ${passed === 1 ? 'check' : 'checks'} passed`

  if (failed === 0 && passed === 0) return 'No checks have run.'
  const unjudged = `${undrawn}${notRun}`
  if (failed === 0 && !unjudged) return `All ${checks}.`
  if (failed === 0) return `${checks}.${unjudged}`
  return `${failed} ${failed === 1 ? 'finding' : 'findings'}, ${checks}.${unjudged}`
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

    <!--
      The same counts the live region announces, made visible.

      `summary` was `sr-only` and nothing else stated a total, so a sighted
      reader got a heading and then a scroll: on a GHS label the first thing on
      screen is a violation, and how many there are in total, how many passed, or
      whether anything below could not be checked at all is four hundred pixels
      further down. This is `aria-hidden` on purpose — the region above says it
      in prose already, and a screen reader hearing both would hear it twice.
    -->
    <p
      v-if="counts.length"
      class="numeric border-chrome-800 bg-chrome-950 flex flex-wrap gap-x-4 gap-y-1 border-b px-4 py-2 text-xs"
      :aria-hidden="announce ? 'true' : undefined"
    >
      <span v-for="count in counts" :key="count.label" :class="count.tone">
        <span aria-hidden="true">{{ count.mark }}</span
        >&#8239;{{ count.total }}
        <span class="sr-only">{{ count.label }}</span>
      </span>
    </p>

    <div v-for="[severity, items] in failureGroups" :key="severity">
      <h3
        class="border-chrome-800 bg-chrome-950 flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold tracking-wide"
        :class="SEVERITY_STYLES[severity].text"
      >
        <span aria-hidden="true">{{ SEVERITY_STYLES[severity].icon }}</span>
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
    <!--
      The line where verdicts stop.

      Everything above is a provision applied to this label; everything below is
      the report saying it did not apply one, and why. Those are different
      claims, and until this rule existed the only thing distinguishing them was
      hue — "Cannot be checked" wore CAUTION's own diamond and colour, so on a
      GHS label it sat under two warnings and read as a third. The blocks below
      are indented, dashed and neutral for the same reason: no provision is being
      applied, so nothing here may look like a severity.

      The headings themselves do not change. `docs/WHAT-IS-NOT-CHECKED.md` uses
      "cannot be checked" and "checks that did not run" verbatim to tell a reader
      they are distinct and only one is theirs to fix; changing either here would
      make that document wrong.
    -->
    <p
      v-if="uncertifiable.length || (declined ?? []).length"
      class="text-chrome-400 border-chrome-800 mt-4 border-t px-4 pt-3 pb-1 text-[10px] font-semibold tracking-wider uppercase"
    >
      Not verdicts &#8212; no provision is being applied
    </p>

    <section
      v-if="uncertifiable.length"
      class="border-chrome-400 mx-4 my-2 border-l border-dashed py-1 pl-4"
      :aria-labelledby="declinedHeadingId"
    >
      <h3
        :id="declinedHeadingId"
        class="text-chrome-300 flex items-center gap-2 text-xs font-semibold"
      >
        <span aria-hidden="true">{{ NOT_A_VERDICT.uncertifiable }}</span>
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
      A different thing from the block above, and the difference is the whole
      reason this one exists. That one names elements the engine could not
      **draw**; this names questions the label never answered, where a rule
      stood down for want of a fact somebody could supply. Folding the two
      together would make `docs/WHAT-IS-NOT-CHECKED.md` wrong the week it
      shipped — it tells a reader they are distinct, because only one of them
      is theirs to fix.

      Every reason ends by naming what to state, so this is a list of things to
      do rather than a list of apologies.
    -->
    <section
      v-if="(declined ?? []).length"
      class="border-chrome-400 mx-4 my-2 border-l border-dashed py-1 pl-4"
      :aria-labelledby="notRunHeadingId"
    >
      <h3
        :id="notRunHeadingId"
        class="text-chrome-300 flex items-center gap-2 text-xs font-semibold"
      >
        <span aria-hidden="true">{{ NOT_A_VERDICT.declined }}</span>
        Checks that did not run
      </h3>
      <div v-for="item in declined ?? []" :key="item.ruleId" class="mt-2">
        <p class="text-chrome-200 text-sm leading-snug">{{ item.reason }}</p>
        <p class="text-chrome-400 mt-1 font-mono text-xs tabular-nums">
          {{ item.citation.reference }}
        </p>
      </div>
    </section>

    <!--
      Guarded on a check having actually run, not merely on nothing having
      failed. With no resolvable layout there are no findings at all, and the
      earlier condition rendered a green tick and "Every check passed" for a
      label that could not be drawn — while the live region alongside it
      correctly said no checks had run.

      It is guarded on the declined list for the same reason, which the review of
      that change caught: the banner sat directly above "Checks that did not run"
      on the conformant label, announcing in green exactly the false reassurance
      the declined block exists to remove. The aria summary had been updated for
      this case and the visible text had not, which is the worse half to miss.
    -->
    <p
      v-if="
        failures.length === 0 &&
        passes.length > 0 &&
        uncertifiable.length === 0 &&
        (declined ?? []).length === 0
      "
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
