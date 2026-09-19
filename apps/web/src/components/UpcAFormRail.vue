<script setup lang="ts">
/**
 * The form rail.
 *
 * Every control here is a constrained one — a GTIN of a fixed length, a
 * magnification with a step, an anchor from a list of nine. That is what lets
 * compliance be *enforced* rather than suggested: the template owns layout, so
 * there is no half-millimetre nudge that quietly breaks a quiet zone.
 *
 * It does not mean the result is compliant by construction, and it should not.
 * A 2x symbol on 60 mm stock and a brand block anchored hard against the bars
 * are both reachable from these controls in two clicks, because they are what
 * actually goes wrong on a pack.
 */
import { ANCHORS, type Anchor, UPC_A_ELEMENTS } from '@packwright/label-core'
import { computed } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import EditorSection from './EditorSection.vue'
import BarcodeScanner from './BarcodeScanner.vue'
import FormField from './ui/FormField.vue'
import TextField from './ui/TextField.vue'
import MeasurementField from './ui/MeasurementField.vue'
import SelectField from './ui/SelectField.vue'
import CheckboxField from './ui/CheckboxField.vue'

const store = useLabelDocumentStore()

/** Optional numbers clear the key rather than storing `undefined`, which `exactOptionalPropertyTypes` treats as a different type. */
function optionalNumber<K extends 'barHeightMm'>(key: K) {
  return computed<number | string>({
    get: () => store.data[key] ?? '',
    set: (value) => {
      const parsed = typeof value === 'string' ? Number.parseFloat(value) : value
      if (value === '' || Number.isNaN(parsed)) delete store.data[key]
      else store.data[key] = parsed
    },
  })
}

const barHeightMm = optionalNumber('barHeightMm')

const magnification = computed({
  get: () => store.data.magnification ?? 1,
  set: (value: number) => {
    store.data.magnification = value
  },
})

const symbolPlacement = computed({
  get: () => store.data.symbolPlacement ?? 'centre',
  set: (value: Anchor) => {
    store.data.symbolPlacement = value
  },
})

const gtinIsComplete = computed(() => /^[0-9]{12}$/.test(store.data.gtin))

/**
 * The shortest thing that could be a whole symbol read rather than a fragment.
 *
 * A GTIN-8 is the shortest key GS1 defines, so anything shorter is someone
 * pasting a piece of a number — a missing digit into a partly typed field. The
 * first version intercepted every paste, so pasting one character was answered
 * with "A GTIN is 8, 12, 13 or 14 digits; this scan is 1", which is true and
 * useless.
 */
const SHORTEST_WHOLE_READ = 8

/**
 * A paste is a scan by another route, and is handled as one.
 *
 * Anyone with a barcode in a spreadsheet pastes it, and what they paste is
 * whatever the symbol carried — thirteen digits as often as twelve. Left to the
 * input, `maxlength="12"` keeps the first twelve characters of a 13-digit read,
 * so `0036000291452` becomes `003600029145`: the *check digit* is what falls off,
 * not the leading zero.
 *
 * Most of the time that is caught, because a truncated code usually fails the
 * check digit. **Roughly one in ten does not** — measured at 527 of 5,000 random
 * 13-digit reads — and those become a structurally valid GTIN naming a different
 * article, with nothing said. That tenth is the reason this is intercepted.
 */
function onPaste(event: ClipboardEvent) {
  const pasted = (event.clipboardData?.getData('text') ?? '').trim()
  // A fragment goes into the field as typing would. Only a plausible whole read
  // is treated as a scan.
  if (pasted.length < SHORTEST_WHOLE_READ) return

  event.preventDefault()
  store.applyScan(pasted)
}

const hasArtwork = computed({
  get: () => store.data.artwork !== undefined,
  set: (on: boolean) => {
    if (on) store.data.artwork = { text: 'ACME', anchor: 'centre-left', widthMm: 10, heightMm: 8 }
    else delete store.data.artwork
  },
})

const hasDigitalLink = computed({
  get: () => store.data.digitalLink !== undefined,
  set: (on: boolean) => {
    if (on) store.data.digitalLink = { domain: 'https://id.example.com' }
    else delete store.data.digitalLink
  },
})

/**
 * `CheckboxField.vue`'s model is `defineModel<boolean>()` — a plain `boolean`,
 * not `boolean | undefined`. Both flags below are optional on the document
 * (`omitHri?: boolean`, `useConvenienceAlphas?: boolean`), so binding the store
 * field straight through fails `exactOptionalPropertyTypes`. It is a type-level
 * gap only: a native checkbox's own `v-model`, which is what these fields used
 * before this migration, already assigns a definite `true`/`false` on every
 * change, never `undefined`, so treating an unset flag as `false` here changes
 * nothing at runtime — it only gives the compiler the type it already behaved as.
 */
const omitHri = computed({
  get: () => store.data.omitHri ?? false,
  set: (value: boolean) => {
    store.data.omitHri = value
  },
})

const useConvenienceAlphas = computed({
  get: () => store.data.digitalLink?.useConvenienceAlphas ?? false,
  set: (value: boolean) => {
    if (store.data.digitalLink) store.data.digitalLink.useConvenienceAlphas = value
  },
})

/**
 * `TextField` has no `.trim` modifier of its own.
 *
 * `defineModel` only applies a transform a component asks for by destructuring
 * `modelModifiers` — `MeasurementField` does this for `.number`, but `TextField`
 * does not do it for `.trim`, so a bare `v-model.trim="…"` written on the
 * component (rather than on a raw `<input>`) would silently stop stripping
 * whitespace: the modifier would still be passed down as an unread prop, and
 * nothing would ever call `.trim()`. The five fields that used to lean on the
 * native modifier do their own trimming here instead, in the same place the
 * rest of their validation already lives, rather than teaching the shared
 * component a modifier only they use.
 */
const gtin = computed({
  get: () => store.data.gtin,
  set: (value: string) => {
    store.data.gtin = value.trim()
  },
})

const digitalLinkDomain = computed({
  get: () => store.data.digitalLink?.domain ?? '',
  set: (value: string) => {
    if (store.data.digitalLink) store.data.digitalLink.domain = value.trim()
  },
})

function optionalText(field: 'lot' | 'serial' | 'expiry') {
  return computed<string>({
    get: () => store.data.digitalLink?.[field] ?? '',
    set: (value) => {
      if (!store.data.digitalLink) return
      const trimmed = value.trim()
      if (trimmed === '') delete store.data.digitalLink[field]
      else store.data.digitalLink[field] = trimmed
    },
  })
}

const lot = optionalText('lot')
const serial = optionalText('serial')
const expiry = optionalText('expiry')

const select = (elementId: string) => store.select(elementId)
</script>

<template>
  <div>
    <EditorSection
      title="Product"
      :element-id="UPC_A_ELEMENTS.symbol"
      :selected-element-id="store.selectedElementId"
      :status="gtinIsComplete ? '12 digits' : 'incomplete'"
      @select="select"
    >
      <TextField
        id="field-gtin"
        v-model="gtin"
        label="GTIN-12, as printed on the pack"
        identifier
        :invalid="!gtinIsComplete"
        :live="store.lastScan !== null"
        inputmode="numeric"
        maxlength="12"
        autocomplete="off"
        @paste="onPaste"
        @input="store.clearScan()"
      >
        <!--
          A pasted symbol goes through the normaliser rather than into the field.
          `maxlength="12"` is right for typing and wrong for a paste: it keeps the
          first twelve characters of a 13-digit read, so the check digit is what
          falls off. Most truncations then fail that check — but about one in ten
          passes it, and becomes a structurally valid GTIN naming a different
          article with nothing said.

          `live` is conditional, and that is a compromise rather than a design.
          The region is created in the same render as the text it carries, which
          is weak — a screen reader has nothing to observe changing. Making it
          unconditional fixes the announcement and gives the editor a second
          always-present `aria-live` region, which the app deliberately does not
          have: the findings rail carries the only one, and
          `the-responsive-collapse.spec.ts` asserts exactly that. The original
          markup had the same weakness and this keeps it rather than trading it
          for a broken invariant. `docs/BACKLOG.md` records what closing it
          properly would take.
        -->
        <template v-if="store.lastScan && !store.lastScan.ok" #description>
          <p class="text-caution text-xs">
            <span class="numeric">{{ store.lastScan.scanned }}</span> was not taken:
            {{ store.lastScan.reason }}
          </p>
        </template>
        <template v-else-if="store.lastScan?.note" #description>
          <p class="text-chrome-300 text-xs">{{ store.lastScan.note }}</p>
        </template>
        <template v-else-if="!gtinIsComplete" #description>
          <p class="text-chrome-400 text-xs">
            Twelve digits, check digit included. The check digit is verified rather than computed,
            so a transposed one is caught instead of silently corrected.
          </p>
        </template>
      </TextField>

      <BarcodeScanner />
    </EditorSection>

    <EditorSection
      title="Symbol"
      :element-id="UPC_A_ELEMENTS.symbol"
      :scroll-on-select="false"
      :selected-element-id="store.selectedElementId"
      :status="`${magnification.toFixed(2)}x`"
      @select="select"
    >
      <!--
        A bare `FormField` wrapping a `range` input with no `v-model` on the
        component itself — none of the four named controls covers a slider, so
        the control is handed the slot directly, the same shape `DesignView.vue`
        demonstrates for this exact field.
      -->
      <FormField id="field-magnification" label="Magnification">
        <template #default="{ id: controlId, describedBy }">
          <input
            :id="controlId"
            v-model.number="magnification"
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            :aria-describedby="describedBy"
          />
        </template>
      </FormField>

      <MeasurementField
        id="field-bar-height"
        v-model="barHeightMm"
        label="Bar height, mm — blank uses the specification’s minimum"
        min="1"
        step="0.5"
      />

      <SelectField id="field-placement" v-model="symbolPlacement" label="Placement">
        <option v-for="anchor in ANCHORS" :key="anchor" :value="anchor">{{ anchor }}</option>
      </SelectField>

      <CheckboxField id="field-omit-hri" v-model="omitHri" label="Omit the human-readable digits" />
    </EditorSection>

    <EditorSection
      title="Stock"
      :selected-element-id="store.selectedElementId"
      :status="`${store.stock.widthMm} × ${store.stock.heightMm} mm`"
      @select="select"
    >
      <div class="grid grid-cols-3 gap-2">
        <MeasurementField
          id="field-stock-width"
          v-model.number="store.stock.widthMm"
          label="Width"
          min="1"
        />
        <MeasurementField
          id="field-stock-height"
          v-model.number="store.stock.heightMm"
          label="Height"
          min="1"
        />
        <MeasurementField
          id="field-stock-margin"
          v-model.number="store.stock.marginMm"
          label="Margin"
          min="0"
        />
      </div>
    </EditorSection>

    <EditorSection
      title="Artwork"
      :element-id="UPC_A_ELEMENTS.artwork"
      :selected-element-id="store.selectedElementId"
      :status="hasArtwork ? 'placed' : 'none'"
      @select="select"
    >
      <CheckboxField id="field-artwork-enabled" v-model="hasArtwork" label="Place a brand block" />

      <template v-if="store.data.artwork">
        <TextField id="field-artwork-text" v-model="store.data.artwork.text" label="Text" />

        <SelectField id="field-artwork-anchor" v-model="store.data.artwork.anchor" label="Anchor">
          <option v-for="anchor in ANCHORS" :key="anchor" :value="anchor">{{ anchor }}</option>
        </SelectField>

        <div class="grid grid-cols-2 gap-2">
          <MeasurementField
            id="field-artwork-width"
            v-model.number="store.data.artwork.widthMm"
            label="Width, mm"
            min="1"
          />
          <MeasurementField
            id="field-artwork-height"
            v-model.number="store.data.artwork.heightMm"
            label="Height, mm"
            min="1"
          />
        </div>
      </template>
    </EditorSection>

    <EditorSection
      title="Digital Link"
      :selected-element-id="store.selectedElementId"
      :status="hasDigitalLink ? 'configured' : 'none'"
      @select="select"
    >
      <CheckboxField
        id="field-dl-enabled"
        v-model="hasDigitalLink"
        label="Carry a GS1 Digital Link"
      />

      <template v-if="store.data.digitalLink">
        <TextField id="field-dl-domain" v-model="digitalLinkDomain" label="Resolver domain" />

        <div class="grid grid-cols-3 gap-2">
          <TextField id="field-dl-lot" v-model="lot" label="Lot (10)" identifier />
          <TextField id="field-dl-serial" v-model="serial" label="Serial (21)" />
          <TextField
            id="field-dl-expiry"
            v-model="expiry"
            label="Expiry (17)"
            placeholder="YYMMDD"
          />
        </div>

        <CheckboxField
          id="field-dl-alphas"
          v-model="useConvenienceAlphas"
          label="Use the convenience alphas (/gtin/)"
        />
      </template>
    </EditorSection>
  </div>
</template>
