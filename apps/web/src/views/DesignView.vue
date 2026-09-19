<script setup lang="ts">
/**
 * The interface catalogue, generated from the same components the app renders.
 *
 * `/rules` is the strongest page here because it is generated from the rule
 * registry rather than written alongside it, so it cannot describe a check the
 * engine does not run. This page applies the same trick to the interface: every
 * control below is `Field`, `TextField`, `MeasurementField`, `SelectField` or
 * `CheckboxField` itself, imported and mounted — not a screenshot and not a
 * second markup copy that can drift from what the rails actually ship.
 *
 * Its second job is why it exists before any rail was migrated onto these
 * components. Every awkward call site in this app — a hidden label, a live
 * region on an invalid field, a control with no `v-model` at all — lives in
 * `UsFoodFormRail.vue` or `UpcAFormRail.vue`, the two rails still to be
 * migrated. Showing only the tidy cases here would prove nothing about whether
 * the component API survives contact with either of them, so this page renders
 * the awkward variants deliberately, alongside the plain ones.
 */
import { ref } from 'vue'
import type { Severity } from '@packwright/label-core'
import { SEVERITY_STYLES } from '../severity'
import SiteHeader from '../components/SiteHeader.vue'
import { PAGE, PAGE_INNER } from '../components/chrome'
import FormField from '../components/ui/FormField.vue'
import TextField from '../components/ui/TextField.vue'
import MeasurementField from '../components/ui/MeasurementField.vue'
import SelectField from '../components/ui/SelectField.vue'
import CheckboxField from '../components/ui/CheckboxField.vue'

/**
 * Written out per severity rather than composed, for the reason `severity.ts`
 * itself gives: Tailwind scans source text for literal class names, so an
 * interpolated `` `border-${key}-edge` `` would produce no CSS and fail
 * silently at runtime. `edge` and `surface` have no field on `SeverityStyle` —
 * they are `main.css` tokens the findings rail has not yet consumed — so this
 * table exists here rather than duplicating `SEVERITY_STYLES` itself.
 */
const EDGE_SURFACE: Record<Severity, { edge: string; surface: string }> = {
  blocking: { edge: 'border-danger-edge', surface: 'bg-danger-surface' },
  violation: { edge: 'border-warning-edge', surface: 'bg-warning-surface' },
  advisory: { edge: 'border-caution-edge', surface: 'bg-caution-surface' },
  guidance: { edge: 'border-notice-edge', surface: 'bg-notice-surface' },
  pass: { edge: 'border-pass-edge', surface: 'bg-pass-surface' },
}

const severities = (Object.keys(SEVERITY_STYLES) as Severity[]).map((key) => ({
  key,
  style: SEVERITY_STYLES[key],
  ...EDGE_SURFACE[key],
}))

// Local state for the controls below. None of it is a label document — this
// page demonstrates the components, not the food or GS1 forms they will
// eventually replace.
const statementOfIdentity = ref('Oat and almond granola')
const panelWidthMm = ref('100')
const containerShape = ref('rectangular')
const cannotAccommodateVertical = ref(false)
const ingredientOnePercent = ref('40')
const gtin = ref('036000291453')
const magnification = ref(1)
</script>

<template>
  <div :class="PAGE">
    <div :class="PAGE_INNER">
      <SiteHeader current="design" />

      <main class="flex flex-col gap-12">
        <header class="flex flex-col gap-4">
          <h1 class="text-2xl font-semibold tracking-tight">The interface catalogue</h1>
          <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
            Generated from the same components the application renders, for the same reason
            <span class="numeric text-chrome-200">/rules</span> is generated from the rule registry
            rather than written alongside it: a page assembled by hand is a second description of
            the thing it documents, and a second description drifts the first time someone changes
            the original and forgets this one. Every control below is the real
            <span class="numeric text-chrome-200">FormField</span>,
            <span class="numeric text-chrome-200">TextField</span>,
            <span class="numeric text-chrome-200">MeasurementField</span>,
            <span class="numeric text-chrome-200">SelectField</span> and
            <span class="numeric text-chrome-200">CheckboxField</span> — imported, not recreated.
          </p>
          <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
            It renders the awkward variants on purpose, not only the pretty ones: a label that is
            named but not shown, a field that is invalid and carries a live region, and a control
            with no <span class="numeric text-chrome-200">v-model</span> to bind at all. Every one
            of those shapes has a real call site in
            <span class="numeric text-chrome-200">UsFoodFormRail.vue</span> or
            <span class="numeric text-chrome-200">UpcAFormRail.vue</span> — the last rails left to
            migrate — so this page has to meet its hardest consumer before either of them does.
          </p>
        </header>

        <section class="flex flex-col gap-5">
          <div class="border-chrome-800 flex flex-col gap-2 border-b pb-3">
            <h2 class="text-chrome-200 text-sm font-semibold tracking-wide uppercase">Severity</h2>
            <p class="text-chrome-400 max-w-2xl text-xs leading-relaxed">
              Five severities, each with a text colour for its own word and icon, an
              <span class="numeric text-chrome-200">edge</span> for a 2px rule, and a
              <span class="numeric text-chrome-200">surface</span> for a wash. Word and icon come
              from <span class="numeric text-chrome-200">severity.ts</span>'s
              <span class="numeric text-chrome-200">SEVERITY_STYLES</span> — nothing here is a
              second copy of the glyphs.
            </p>
          </div>

          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <article v-for="severity in severities" :key="severity.key" class="flex flex-col gap-3">
              <p class="flex items-center gap-2 text-sm font-semibold" :class="severity.style.text">
                <span aria-hidden="true">{{ severity.style.icon }}</span>
                {{ severity.style.word }}
              </p>
              <hr class="w-16 border-t-2" :class="severity.edge" />
              <p class="p-3 text-xs leading-relaxed" :class="severity.surface">
                <span :class="severity.style.text">{{ severity.style.word }}</span>
                <span class="text-chrome-100"> sits on its own surface, legible on top of it.</span>
              </p>
            </article>
          </div>
        </section>

        <section class="flex flex-col gap-5">
          <div class="border-chrome-800 flex flex-col gap-2 border-b pb-3">
            <h2 class="text-chrome-200 text-sm font-semibold tracking-wide uppercase">Controls</h2>
            <p class="text-chrome-400 max-w-2xl text-xs leading-relaxed">
              The plain cases first, then the ones a hand-written catalogue would have been tempted
              to leave out.
            </p>
          </div>

          <div class="flex max-w-sm flex-col gap-6">
            <TextField
              id="design-statement-of-identity"
              v-model="statementOfIdentity"
              label="Statement of identity"
              description="What the food is, under 21 CFR 101.3. Prose, so it is not set in the numeric face."
            />

            <MeasurementField
              id="design-panel-width"
              v-model="panelWidthMm"
              label="Panel width (mm)"
            />

            <!--
              The long option is the point: `SELECT`'s `pr-8` exists because the
              native arrow used to sit inside an 8px gutter and clip text like
              this mid-word, with no ellipsis to say more was cut.
            -->
            <SelectField
              id="design-container-shape"
              v-model="containerShape"
              label="Container shape"
            >
              <option value="rectangular">
                Rectangular — one face is the principal display panel
              </option>
              <option value="cylindrical">Cylindrical — 40% of height × circumference</option>
              <option value="other">Other shape — 40% of total surface</option>
            </SelectField>

            <!--
              Long enough to wrap to a second line at this column's width, which
              is the point: `items-start` on `CHECKBOX_LABEL` keeps the box level
              with the first line rather than floating at the middle of the block.
            -->
            <CheckboxField
              id="design-no-vertical-column"
              v-model="cannotAccommodateVertical"
              label="The package shape or size cannot take a standard vertical column"
            />

            <!--
              A hidden label — one of the seven sites in UsFoodFormRail's
              ingredient and override columns. The accessible name is unchanged;
              only the visible text is gone.
            -->
            <MeasurementField
              id="design-ingredient-1-percent"
              v-model="ingredientOnePercent"
              label="Ingredient 1 percent by weight"
              label-hidden
              description="The field above this line has a label — you just cannot see it. Its name is
                “Ingredient 1 percent by weight”, which a screen reader reads and the column heading
                supplies for everyone else."
            />

            <!--
              GTIN entry, mirroring its real shape in `UpcAFormRail.vue`: an
              identifier rather than prose, so it keeps the mono face; invalid,
              so the border takes `danger-edge`; and a description that is
              markup — a coloured, live-announced paragraph — rather than a
              static string. Building this entry is what found two gaps: the
              controls were dropping a `description` slot on the floor, and
              there was no way to ask for a text field in the identifier face at
              all.
            -->
            <TextField
              id="design-gtin"
              v-model="gtin"
              label="GTIN-12"
              identifier
              invalid
              live
              inputmode="numeric"
              maxlength="12"
              autocomplete="off"
            >
              <template #description>
                <p class="text-caution">
                  <span class="numeric">0360002914533</span> was not taken: the check digit does not
                  match.
                </p>
              </template>
            </TextField>

            <!--
              A slotted control with no `v-model` at all — `UpcAFormRail`'s own
              magnification slider, which none of the four named controls cover
              because it is neither text, a measurement typed as a string, a
              select nor a checkbox.
            -->
            <FormField id="design-magnification" label="Magnification">
              <template #default="{ id: controlId, describedBy }">
                <input
                  :id="controlId"
                  v-model.number="magnification"
                  class="accent-notice w-full"
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  :aria-describedby="describedBy"
                />
              </template>
              <template #description>
                {{ magnification.toFixed(2) }}x — GS1's 80–200% range for a UPC-A symbol.
              </template>
            </FormField>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
