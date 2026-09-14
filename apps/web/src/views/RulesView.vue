<script setup lang="ts">
/**
 * Every encoded rule, generated from the registry.
 *
 * **Nothing here is written by hand**, which is the whole point. A hand-written
 * catalogue is a second description of the rule set, and a second description
 * goes stale the first time someone adds a rule and forgets this page — leaving a
 * document that claims the tool checks something it does not. `listRules()` is
 * the same function `runRules` dispatches through, so a rule a user can read
 * about is a rule that runs.
 *
 * It is also the strongest evidence the project offers that the compliance engine
 * is real rather than decorative: thirty-four rules, each with the provision it
 * enforces and the codes it can emit, all traceable to a source document that was
 * read.
 */
import { computed } from 'vue'
import { LABEL_TYPES, citationsOf, listRules, type LabelType } from '@packwright/label-core'
import SiteHeader from '../components/SiteHeader.vue'
import { PAGE, PAGE_INNER } from '../components/chrome'

/** The label types in the order the registry lists them, with a name to print. */
const SECTIONS: Record<LabelType, { name: string; blurb: string }> = {
  'gs1-retail': {
    name: 'GS1 retail',
    blurb:
      'Judged against the resolved geometry — the symbol as drawn, at the size and position it ' +
      'was drawn, not as it was requested.',
  },
  'ghs-chemical': {
    name: 'GHS chemical',
    blurb:
      'Two regulators say the same things in different words. Where a rule enforces both, it ' +
      'reports under the one the label’s own regime answers to.',
  },
  'us-food': {
    name: 'US food',
    blurb:
      'The largest set, and the one where the modal verb matters most: a permission reported as ' +
      'an obligation is a false positive a user cannot argue with.',
  },
}

const sections = computed(() =>
  LABEL_TYPES.map((labelType) => ({
    labelType,
    ...SECTIONS[labelType],
    // Registry order, deliberately. It is ordered as a person would check a
    // label — is the identifier right, is the symbol the right size, does it
    // have the room it needs — and sorting alphabetically would throw that away
    // for no gain.
    rules: listRules(labelType),
  })),
)

const total = computed(() => listRules().length)

/**
 * Provisions are counted distinctly across the whole set, because several rules
 * cite the same paragraph and counting the entries would overstate the reach.
 */
const provisionCount = computed(
  () => new Set(listRules().flatMap((rule) => citationsOf(rule).map((c) => c.reference))).size,
)
</script>

<template>
  <div :class="PAGE">
    <div :class="PAGE_INNER">
      <SiteHeader current="rules" />

      <main class="flex flex-col gap-12">
        <section class="flex flex-col gap-4">
          <h1 class="text-2xl font-semibold tracking-tight">The rules this tool encodes</h1>
          <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
            <span class="numeric text-chrome-200">{{ total }}</span> rules, citing
            <span class="numeric text-chrome-200">{{ provisionCount }}</span> distinct provisions.
            This page is generated from the rule registry rather than written alongside it, so it
            cannot describe a check the engine does not run. Every finding a label receives
            originates in one of these, and carries the reference listed beside it.
          </p>
        </section>

        <section
          v-for="section in sections"
          :key="section.labelType"
          class="flex flex-col gap-5"
          :aria-labelledby="`section-${section.labelType}`"
        >
          <div class="border-chrome-800 flex flex-col gap-2 border-b pb-3">
            <h2
              :id="`section-${section.labelType}`"
              class="flex items-baseline gap-3 text-sm font-semibold tracking-wide uppercase"
            >
              {{ section.name }}
              <span class="text-chrome-400 numeric text-xs normal-case">
                {{ section.rules.length }} rules
              </span>
            </h2>
            <p class="text-chrome-400 max-w-2xl text-xs leading-relaxed">{{ section.blurb }}</p>
          </div>

          <article
            v-for="rule in section.rules"
            :key="rule.id"
            class="border-chrome-800 flex flex-col gap-3 border-l-2 pl-4"
          >
            <div class="flex flex-col gap-1">
              <p class="numeric text-chrome-400 text-xs">{{ rule.id }}</p>
              <h3 class="text-chrome-100 text-sm leading-snug font-semibold">{{ rule.title }}</h3>
            </div>

            <!--
            Every provision, not just the primary. Sixteen of the thirty-four
            rules report under more than one paragraph, and a catalogue showing
            `citation` alone would answer under half the question this page
            exists to answer — and would tell a US chemical labeller that their
            signal-word rule comes from an EU regulation.
          -->
            <dl class="flex flex-col gap-1">
              <div
                v-for="citation in citationsOf(rule)"
                :key="citation.reference"
                class="flex items-baseline gap-3 text-xs"
              >
                <dt class="text-chrome-400 w-12 shrink-0 uppercase">{{ citation.authority }}</dt>
                <dd class="flex flex-wrap items-baseline gap-x-2">
                  <span class="numeric text-chrome-200">{{ citation.reference }}</span>
                  <!--
                  A citation may carry a reference and no title, and that is a
                  legitimate state rather than missing data: a provision reached
                  by overriding a primary has no title, because composing one
                  here would be this project authoring a description of a
                  regulated paragraph. The reference alone is what is known.
                -->
                  <span v-if="citation.title" class="text-chrome-400">{{ citation.title }}</span>
                </dd>
              </div>
            </dl>

            <ul class="flex flex-wrap gap-1.5">
              <li
                v-for="code in rule.codes"
                :key="code"
                class="border-chrome-800 text-chrome-400 numeric border px-1.5 py-0.5 text-[11px]"
              >
                {{ code }}
              </li>
            </ul>
          </article>
        </section>
      </main>
    </div>
  </div>
</template>
