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
  EU_CLP_HAZARD_STATEMENTS,
  EU_CLP_PRECAUTIONARY_STATEMENTS,
  GHS_ELEMENTS,
  GHS_REGIMES,
  GHS_SIGNAL_WORDS,
  applyPrecedence,
  requiredPictograms,
  type GhsSignalWord,
} from '@packwright/label-core'
import { computed } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorSection from './EditorSection.vue'
import { CHIP, CHIP_REMOVE, INPUT, LABEL } from './formStyles'

const store = useLabelDocumentStore()
const data = store.ghsData
const select = (elementId: string) => store.select(elementId)

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
 * The statement tables, as options. Only the EU tables carry text today, so a US
 * label offers nothing to choose — which is honest rather than convenient, and
 * the rail says so in words instead of presenting an empty dropdown.
 */
const hazardOptions = computed(() =>
  data.regime === 'eu-clp' ? Object.entries(EU_CLP_HAZARD_STATEMENTS) : [],
)
const precautionaryOptions = computed(() =>
  data.regime === 'eu-clp' ? Object.entries(EU_CLP_PRECAUTIONARY_STATEMENTS) : [],
)

const chosenHazardStatements = computed(() => data.hazardStatementCodes ?? [])
const chosenPrecautionary = computed(() => data.precautionaryStatementCodes ?? [])

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

const textFor = (kind: 'hazard' | 'precautionary', code: string) =>
  (kind === 'hazard' ? EU_CLP_HAZARD_STATEMENTS : EU_CLP_PRECAUTIONARY_STATEMENTS)[code] ?? ''

const smallContainer = computed({
  get: () => data.smallContainerLabelling === true,
  set: (on: boolean) => {
    if (on) data.smallContainerLabelling = true
    else delete data.smallContainerLabelling
  },
})

/** Each regime's own threshold, for the note beside the control. */
const smallContainerThresholdL = computed(() => (data.regime === 'us-osha' ? 0.1 : 0.125))

const hasSupplier = computed({
  get: () => data.supplier !== undefined,
  set: (on: boolean) => {
    if (on) data.supplier = { name: 'Example Chemicals Ltd', address: '1 Example Way' }
    else delete data.supplier
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
      <label :class="LABEL" for="field-ghs-product">
        Product identifier
        <input id="field-ghs-product" v-model="data.productIdentifier" :class="INPUT" type="text" />
      </label>

      <label :class="LABEL" for="field-ghs-regime">
        Market
        <select id="field-ghs-regime" v-model="data.regime" :class="INPUT">
          <option v-for="regime in GHS_REGIMES" :key="regime" :value="regime">
            {{ regime === 'eu-clp' ? 'EU — CLP' : 'US — OSHA HazCom' }}
          </option>
        </select>
      </label>

      <label :class="LABEL" for="field-ghs-capacity">
        Package capacity (litres)
        <input
          id="field-ghs-capacity"
          v-model.number="data.capacityL"
          :class="INPUT"
          type="number"
          min="0.001"
          step="0.1"
        />
      </label>
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
        <label
          v-for="entry in group.entries"
          :key="entry.id"
          :for="`field-hazard-${entry.id}`"
          class="text-chrome-300 flex items-start gap-2 text-xs"
        >
          <input
            :id="`field-hazard-${entry.id}`"
            type="checkbox"
            class="accent-notice mt-0.5 shrink-0"
            :checked="hazards.includes(entry.id)"
            @change="toggleHazard(entry.id, ($event.target as HTMLInputElement).checked)"
          />
          <span>
            <span class="numeric text-chrome-400">{{ entry.section }}</span>
            {{ entry.description }}
            <span v-if="entry.pictogram" class="numeric text-chrome-200">
              → {{ entry.pictogram }}
            </span>
            <span v-else class="text-chrome-400">→ no pictogram</span>
          </span>
        </label>
      </div>
    </EditorSection>

    <EditorSection
      title="Signal word"
      :element-id="GHS_ELEMENTS.signalWord"
      :selected-element-id="store.selectedElementId"
      :status="signalWords.length ? signalWords.join(' + ') : 'none'"
      @select="select"
    >
      <label
        v-for="word in GHS_SIGNAL_WORDS"
        :key="word"
        :for="`field-signal-${word}`"
        class="text-chrome-300 flex items-center gap-2 text-xs"
      >
        <input
          :id="`field-signal-${word}`"
          type="checkbox"
          class="accent-notice"
          :checked="signalWords.includes(word)"
          @change="toggleSignalWord(word, ($event.target as HTMLInputElement).checked)"
        />
        {{ word }}
      </label>
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
      <label v-if="hazardOptions.length" :class="LABEL" for="field-add-h">
        Add a statement
        <select id="field-add-h" :class="INPUT" @change="addStatement('hazard', $event)">
          <option value="">Choose an H-statement…</option>
          <option v-for="[code, text] in hazardOptions" :key="code" :value="code">
            {{ code }} — {{ text }}
          </option>
        </select>
      </label>
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
      <label v-if="precautionaryOptions.length" :class="LABEL" for="field-add-p">
        Add a statement
        <select id="field-add-p" :class="INPUT" @change="addStatement('precautionary', $event)">
          <option value="">Choose a P-statement…</option>
          <option v-for="[code, text] in precautionaryOptions" :key="code" :value="code">
            {{ code }} — {{ text }}
          </option>
        </select>
      </label>
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
      <label for="field-has-supplier" class="text-chrome-300 flex items-center gap-2 text-xs">
        <input
          id="field-has-supplier"
          v-model="hasSupplier"
          type="checkbox"
          class="accent-notice"
        />
        Include supplier identification
      </label>

      <template v-if="data.supplier">
        <label :class="LABEL" for="field-supplier-name">
          Name
          <input id="field-supplier-name" v-model="data.supplier.name" :class="INPUT" type="text" />
        </label>
        <label :class="LABEL" for="field-supplier-address">
          Address
          <input
            id="field-supplier-address"
            v-model="data.supplier.address"
            :class="INPUT"
            type="text"
          />
        </label>
        <label :class="LABEL" for="field-supplier-phone">
          Telephone
          <input
            id="field-supplier-phone"
            v-model="data.supplier.telephone"
            :class="INPUT"
            type="text"
          />
        </label>
      </template>
    </EditorSection>

    <EditorSection
      title="Small container"
      :element-id="GHS_ELEMENTS.outerPackageStatement"
      :selected-element-id="store.selectedElementId"
      :status="smallContainer ? 'in use' : 'not used'"
      @select="select"
    >
      <label for="field-small-container" class="text-chrome-300 flex items-start gap-2 text-xs">
        <input
          id="field-small-container"
          v-model="smallContainer"
          type="checkbox"
          class="accent-notice mt-0.5"
        />
        This container uses reduced labelling for small containers
      </label>
      <p class="text-chrome-400 text-xs">
        Declared, not inferred from capacity. Both regimes make this conditional on a determination
        about the packaging that no label can settle — for
        {{
          data.regime === 'us-osha'
            ? 'OSHA, that full-information pull-out, fold-back or tag labelling is not feasible'
            : 'CLP, the conditions in Article 29'
        }}. The threshold is {{ smallContainerThresholdL }} litres.
      </p>

      <label v-if="data.regime === 'us-osha'" :class="LABEL" for="field-outer-statement">
        Outer package statement
        <input
          id="field-outer-statement"
          v-model="data.outerPackageStatement"
          :class="INPUT"
          type="text"
          placeholder="Full label information is provided on the immediate outer package."
        />
      </label>
    </EditorSection>

    <EditorSection title="Stock" :selected-element-id="store.selectedElementId" @select="select">
      <label :class="LABEL" for="field-ghs-width">
        Width (mm)
        <input
          id="field-ghs-width"
          v-model.number="store.ghsStock.widthMm"
          :class="INPUT"
          type="number"
          min="1"
        />
      </label>
      <label :class="LABEL" for="field-ghs-height">
        Height (mm)
        <input
          id="field-ghs-height"
          v-model.number="store.ghsStock.heightMm"
          :class="INPUT"
          type="number"
          min="1"
        />
      </label>
      <label :class="LABEL" for="field-ghs-margin">
        Margin (mm)
        <input
          id="field-ghs-margin"
          v-model.number="store.ghsStock.marginMm"
          :class="INPUT"
          type="number"
          min="0"
        />
      </label>
    </EditorSection>
  </div>
</template>
