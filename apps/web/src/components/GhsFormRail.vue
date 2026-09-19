<script setup lang="ts">
/**
 * The GHS chemical label's form.
 *
 * **Classification first, elements derived.** A user declares what the substance
 * *is* — its hazard classes — and the pictograms follow from CLP Annex V rather
 * than being chosen. That is the direction the regulation runs, and asking a
 * user to pick pictograms directly is asking them to apply Article 26 by hand
 * and then checking their arithmetic.
 *
 * **Statements are chosen by code, never typed.** The text comes from the table
 * and the user never has an opportunity to paraphrase it, because a paraphrased
 * H225 is a non-compliant label. The dropdown shows the code and its exact
 * wording; what is stored is the code.
 *
 * The signal word is still chosen rather than derived. Deriving it needs CLP
 * Annex I Parts 2–5 — 28 separate tables — which is deliberately deferred; until
 * then Article 20(3) is enforced by a rule rather than by the form, which is the
 * right way round anyway: the form should be able to express a wrong label.
 */
import {
  ANNEX_V_ENTRIES,
  hazardStatementText,
  knownHazardStatementCodes,
  knownPrecautionaryStatementCodes,
  precautionaryStatementText,
  GHS_ELEMENTS,
  GHS_REGIMES,
  GHS_SIGNAL_WORDS,
  applyPrecedence,
  requiredPictograms,
  smallContainerThresholdL,
  type GhsRegime,
  type GhsSignalWord,
  type HazardClassEntry,
} from '@packwright/label-core'
import { computed } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorSection from './EditorSection.vue'
import { CHIP, CHIP_REMOVE } from './formStyles'
import TextField from './ui/TextField.vue'
import MeasurementField from './ui/MeasurementField.vue'
import SelectField from './ui/SelectField.vue'
import CheckboxField from './ui/CheckboxField.vue'

const store = useLabelDocumentStore()
const data = store.ghsData
const select = (elementId: string) => store.select(elementId)

/**
 * `SelectField`'s model is typed `string`, generic across every select in the
 * app; `data.regime` is the narrower `GhsRegime` union. Read straight through
 * — the field is required, never `undefined` — and written back through this
 * setter, the same shape `UpcAFormRail.vue` uses for `symbolPlacement`/`Anchor`.
 */
const regime = computed({
  get: () => data.regime,
  set: (value: GhsRegime) => {
    data.regime = value
  },
})

/** Annex I part, so 44 classifications read as four groups rather than one list. */
const PART_NAMES: Record<string, string> = {
  '2': 'Physical hazards',
  '3': 'Health hazards',
  '4': 'Environmental hazards',
  '5': 'Additional hazards',
}

const hazardGroups = computed(() => {
  const groups = new Map<string, typeof ANNEX_V_ENTRIES>()
  for (const entry of ANNEX_V_ENTRIES) {
    const part = entry.section.split('.')[0]!
    groups.set(part, [...(groups.get(part) ?? []), entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([part, entries]) => ({ part, name: PART_NAMES[part] ?? `Part ${part}`, entries }))
})

/**
 * The flattened form of a hazard label, for the accessible name only.
 *
 * The rendered label is not this string — it is the slot below, which keeps the
 * Annex I section number and the pictogram code in the mono face because both
 * are identifiers. This concatenation is what `CheckboxField`'s `label` prop
 * gets, and the two have to say the same words: the slot is the accessible name,
 * and the component warns in development if they drift apart.
 */
const hazardLabel = (entry: HazardClassEntry) =>
  `${entry.section} ${entry.description} → ${entry.pictogram ?? 'no pictogram'}`

const hazards = computed(() => data.hazards ?? [])

function toggleHazard(id: string, on: boolean): void {
  const next = on ? [...hazards.value, id] : hazards.value.filter((h) => h !== id)
  if (next.length === 0) delete data.hazards
  else data.hazards = next
  // Pictograms follow the classification, reduced by precedence. An explicit
  // list overrides the derivation and exists only so a wrong set can still be
  // drawn and caught.
  delete data.pictograms
}

/**
 * What the classification demands, **after** Article 26 removes what it forbids.
 *
 * Reducing it here is what makes the editor's default output compliant. Before
 * this, the rail derived the raw set and the precedence rule immediately flagged
 * it — the form produced a label its own rules rejected. Clauses that make a
 * pictogram *optional* are deliberately left in: omitting a hazard symbol is the
 * supplier's decision, not this tool's, and the rule raises those as guidance.
 */
const derivedPictograms = computed(() =>
  applyPrecedence(requiredPictograms(hazards.value), hazards.value, data.regime),
)

const signalWords = computed(() => data.signalWords ?? [])

function toggleSignalWord(word: GhsSignalWord, on: boolean): void {
  const next = on ? [...signalWords.value, word] : signalWords.value.filter((w) => w !== word)
  if (next.length === 0) delete data.signalWords
  else data.signalWords = next
}

/**
 * The statement text for a code, under this label's regime and no other.
 *
 * It read the EU tables directly, so a code sitting on a `us-osha` label was
 * captioned with CLP wording — the silent cross-regime substitution
 * `ghs/statements.ts` exists to prevent, printed in the editor beside the code
 * it misdescribes.
 *
 * **Three clicks away**, and not by way of a stored record: choose EU, pick a
 * statement, then change Market. Nothing clears the codes on a regime change,
 * which is its own entry in `docs/BACKLOG.md`.
 */
const textFor = (kind: 'hazard' | 'precautionary', code: string) =>
  (kind === 'hazard' ? hazardStatementText : precautionaryStatementText)(data.regime, code) ?? ''

/**
 * The statement tables, as options, for the regime this label is actually for.
 *
 * Only the EU tables carry text today, so a US label still offers nothing to
 * choose — which is honest rather than convenient, and the rail says so in words
 * instead of presenting an empty dropdown. The difference is that it now says so
 * because `knownHazardStatementCodes('us-osha')` is empty, rather than because
 * this file was written while that was true: a `regime === 'eu-clp'` ternary
 * over the EU constants happens to behave correctly and would go on offering
 * nothing the day Appendix C.4 is transcribed, until somebody remembered to come
 * back here.
 */
const optionsFor = (kind: 'hazard' | 'precautionary') =>
  (kind === 'hazard' ? knownHazardStatementCodes : knownPrecautionaryStatementCodes)(
    data.regime,
  ).map((code) => [code, textFor(kind, code)] as [string, string])

const hazardOptions = computed(() => optionsFor('hazard'))
const precautionaryOptions = computed(() => optionsFor('precautionary'))

const chosenHazardStatements = computed(() => data.hazardStatementCodes ?? [])
const chosenPrecautionary = computed(() => data.precautionaryStatementCodes ?? [])

/**
 * `#field-add-h` and `#field-add-p` have no bound value at all — the control is
 * an action, not state, and resets itself once the code is taken. `SelectField`
 * is used with no `v-model` for exactly this: its own `model` stays unbound, so
 * `:value="model"` never fights the reset this handler performs by hand.
 */
function addStatement(kind: 'hazard' | 'precautionary', event: Event): void {
  const select = event.target as HTMLSelectElement
  const code = select.value
  select.value = ''
  if (!code) return
  if (kind === 'hazard') {
    if (chosenHazardStatements.value.includes(code)) return
    data.hazardStatementCodes = [...chosenHazardStatements.value, code]
  } else {
    if (chosenPrecautionary.value.includes(code)) return
    data.precautionaryStatementCodes = [...chosenPrecautionary.value, code]
  }
}

function removeStatement(kind: 'hazard' | 'precautionary', code: string): void {
  if (kind === 'hazard') {
    const next = chosenHazardStatements.value.filter((c) => c !== code)
    if (next.length === 0) delete data.hazardStatementCodes
    else data.hazardStatementCodes = next
  } else {
    const next = chosenPrecautionary.value.filter((c) => c !== code)
    if (next.length === 0) delete data.precautionaryStatementCodes
    else data.precautionaryStatementCodes = next
  }
}

const smallContainer = computed({
  get: () => data.smallContainerLabelling === true,
  set: (on: boolean) => {
    if (on) data.smallContainerLabelling = true
    else delete data.smallContainerLabelling
  },
})

/**
 * Read from the rule that enforces it rather than restated here. A regulatory
 * figure written out twice is one that drifts silently — the rail would go on
 * telling the user 100 ml after the rule had been corrected.
 */
const thresholdL = computed(() => smallContainerThresholdL(data.regime))

/**
 * `outerPackageStatement` is optional on the document; `TextField`'s model is
 * not. Read back `''` for the unset case and write straight through — no trim,
 * no delete-on-empty, matching the plain native `v-model` this field used
 * before the migration.
 */
const outerPackageStatement = computed({
  get: () => data.outerPackageStatement ?? '',
  set: (value: string) => {
    data.outerPackageStatement = value
  },
})

const hasSupplier = computed({
  get: () => data.supplier !== undefined,
  set: (on: boolean) => {
    if (on) data.supplier = { name: 'Example Chemicals Ltd', address: '1 Example Way' }
    else delete data.supplier
  },
})

/** `telephone` is optional on `GhsSupplier`; same reasoning as `outerPackageStatement`. */
const supplierTelephone = computed({
  get: () => data.supplier?.telephone ?? '',
  set: (value: string) => {
    if (data.supplier) data.supplier.telephone = value
  },
})
</script>

<template>
  <div>
    <EditorSection
      title="Product"
      :element-id="GHS_ELEMENTS.productIdentifier"
      :selected-element-id="store.selectedElementId"
      @select="select"
    >
      <TextField
        id="field-ghs-product"
        v-model="data.productIdentifier"
        label="Product identifier"
      />

      <SelectField id="field-ghs-regime" v-model="regime" label="Market">
        <option v-for="option in GHS_REGIMES" :key="option" :value="option">
          {{ option === 'eu-clp' ? 'EU — CLP' : 'US — OSHA HazCom' }}
        </option>
      </SelectField>

      <MeasurementField
        id="field-ghs-capacity"
        v-model.number="data.capacityL"
        label="Package capacity (litres)"
        min="0.001"
        step="0.1"
      />
      <p class="text-chrome-400 text-xs">
        Capacity selects the minimum label and pictogram size. It is not the size of the label.
      </p>
    </EditorSection>

    <EditorSection
      title="Classification"
      :element-id="GHS_ELEMENTS.pictograms"
      :selected-element-id="store.selectedElementId"
      :status="hazards.length ? `${hazards.length} selected` : 'none'"
      @select="select"
    >
      <p class="text-chrome-400 text-xs">
        Pictograms are derived from the classification, not chosen.
        <span v-if="derivedPictograms.length" class="numeric text-chrome-200">
          Currently {{ derivedPictograms.join(', ') }}.
        </span>
      </p>

      <div v-for="group in hazardGroups" :key="group.part" class="flex flex-col gap-1">
        <h4 class="text-chrome-400 mt-2 text-xs font-semibold tracking-wide uppercase">
          {{ group.name }}
        </h4>
        <CheckboxField
          v-for="entry in group.entries"
          :id="`field-hazard-${entry.id}`"
          :key="entry.id"
          :checked="hazards.includes(entry.id)"
          :label="hazardLabel(entry)"
          @change="toggleHazard(entry.id, ($event.target as HTMLInputElement).checked)"
        >
          <!--
            The `label` prop above is still the accessible name — this slot only
            sets the same words differently. A hazard class number and a
            pictogram code are identifiers, so they take the mono face; the
            description between them is prose and does not.
          -->
          <span class="numeric text-chrome-400">{{ entry.section }}</span>
          {{ entry.description }}
          <span v-if="entry.pictogram" class="numeric text-chrome-200">
            → {{ entry.pictogram }}
          </span>
          <span v-else class="text-chrome-400">→ no pictogram</span>
        </CheckboxField>
      </div>
    </EditorSection>

    <EditorSection
      title="Signal word"
      :element-id="GHS_ELEMENTS.signalWord"
      :selected-element-id="store.selectedElementId"
      :status="signalWords.length ? signalWords.join(' + ') : 'none'"
      @select="select"
    >
      <CheckboxField
        v-for="word in GHS_SIGNAL_WORDS"
        :id="`field-signal-${word}`"
        :key="word"
        :checked="signalWords.includes(word)"
        :label="word"
        @change="toggleSignalWord(word, ($event.target as HTMLInputElement).checked)"
      />
      <p class="text-chrome-400 text-xs">
        Both can be selected, so a label carrying both can be drawn and reported.
      </p>
    </EditorSection>

    <EditorSection
      title="Hazard statements"
      :element-id="GHS_ELEMENTS.hazardStatements"
      :selected-element-id="store.selectedElementId"
      :status="`${chosenHazardStatements.length} selected`"
      @select="select"
    >
      <SelectField
        v-if="hazardOptions.length"
        id="field-add-h"
        label="Add a statement"
        @change="addStatement('hazard', $event)"
      >
        <option value="">Choose an H-statement…</option>
        <option v-for="[code, text] in hazardOptions" :key="code" :value="code">
          {{ code }} — {{ text }}
        </option>
      </SelectField>
      <p v-else class="text-chrome-400 text-xs">
        No verified statement text exists for this market yet, so none can be offered. The EU
        wording is deliberately not reused.
      </p>

      <ul v-if="chosenHazardStatements.length" class="flex flex-col gap-1">
        <li v-for="code in chosenHazardStatements" :key="code" :class="CHIP">
          <span
            ><span class="numeric">{{ code }}</span> {{ textFor('hazard', code) }}</span
          >
          <button
            type="button"
            :class="CHIP_REMOVE"
            :aria-label="`Remove ${code}`"
            @click="removeStatement('hazard', code)"
          >
            ×
          </button>
        </li>
      </ul>
    </EditorSection>

    <EditorSection
      title="Precautionary statements"
      :element-id="GHS_ELEMENTS.precautionaryStatements"
      :selected-element-id="store.selectedElementId"
      :status="`${chosenPrecautionary.length} selected`"
      @select="select"
    >
      <SelectField
        v-if="precautionaryOptions.length"
        id="field-add-p"
        label="Add a statement"
        @change="addStatement('precautionary', $event)"
      >
        <option value="">Choose a P-statement…</option>
        <option v-for="[code, text] in precautionaryOptions" :key="code" :value="code">
          {{ code }} — {{ text }}
        </option>
      </SelectField>
      <p v-else class="text-chrome-400 text-xs">
        No verified statement text exists for this market yet.
      </p>

      <ul v-if="chosenPrecautionary.length" class="flex flex-col gap-1">
        <li v-for="code in chosenPrecautionary" :key="code" :class="CHIP">
          <span
            ><span class="numeric">{{ code }}</span> {{ textFor('precautionary', code) }}</span
          >
          <button
            type="button"
            :class="CHIP_REMOVE"
            :aria-label="`Remove ${code}`"
            @click="removeStatement('precautionary', code)"
          >
            ×
          </button>
        </li>
      </ul>
    </EditorSection>

    <EditorSection
      title="Supplier"
      :element-id="GHS_ELEMENTS.supplier"
      :selected-element-id="store.selectedElementId"
      :status="hasSupplier ? 'set' : 'not set'"
      @select="select"
    >
      <CheckboxField
        id="field-has-supplier"
        v-model="hasSupplier"
        label="Include supplier identification"
      />

      <template v-if="data.supplier">
        <TextField id="field-supplier-name" v-model="data.supplier.name" label="Name" />
        <TextField id="field-supplier-address" v-model="data.supplier.address" label="Address" />
        <TextField id="field-supplier-phone" v-model="supplierTelephone" label="Telephone" />
      </template>
    </EditorSection>

    <EditorSection
      title="Small container"
      :element-id="GHS_ELEMENTS.outerPackageStatement"
      :selected-element-id="store.selectedElementId"
      :status="smallContainer ? 'in use' : 'not used'"
      @select="select"
    >
      <CheckboxField
        id="field-small-container"
        v-model="smallContainer"
        label="This container uses reduced labelling for small containers"
      />
      <p class="text-chrome-400 text-xs">
        Declared, not inferred from capacity. Both regimes make this conditional on a determination
        about the packaging that no label can settle — for
        {{
          data.regime === 'us-osha'
            ? 'OSHA, that full-information pull-out, fold-back or tag labelling is not feasible'
            : 'CLP, the conditions in Article 29'
        }}. The threshold is {{ thresholdL }} litres.
      </p>

      <TextField
        v-if="data.regime === 'us-osha'"
        id="field-outer-statement"
        v-model="outerPackageStatement"
        label="Outer package statement"
        placeholder="Full label information is provided on the immediate outer package."
      />
    </EditorSection>

    <EditorSection title="Stock" :selected-element-id="store.selectedElementId" @select="select">
      <MeasurementField
        id="field-ghs-width"
        v-model.number="store.ghsStock.widthMm"
        label="Width (mm)"
        min="1"
      />
      <MeasurementField
        id="field-ghs-height"
        v-model.number="store.ghsStock.heightMm"
        label="Height (mm)"
        min="1"
      />
      <MeasurementField
        id="field-ghs-margin"
        v-model.number="store.ghsStock.marginMm"
        label="Margin (mm)"
        min="0"
      />
    </EditorSection>
  </div>
</template>
