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
import { INPUT, LABEL } from './formStyles'

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

function optionalText(field: 'lot' | 'serial' | 'expiry') {
  return computed<string>({
    get: () => store.data.digitalLink?.[field] ?? '',
    set: (value) => {
      if (!store.data.digitalLink) return
      if (value === '') delete store.data.digitalLink[field]
      else store.data.digitalLink[field] = value
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
      <label :class="LABEL" for="field-gtin">
        <span>GTIN-12, as printed on the pack</span>
        <input
          id="field-gtin"
          v-model.trim="store.data.gtin"
          :class="INPUT"
          type="text"
          inputmode="numeric"
          maxlength="12"
          autocomplete="off"
          :aria-invalid="!gtinIsComplete"
          :aria-describedby="store.lastScan ? 'gtin-scan-note' : undefined"
          @paste="onPaste"
          @input="store.clearScan()"
        />
      </label>

      <!--
        A pasted symbol goes through the normaliser rather than into the field.
        `maxlength="12"` is right for typing and wrong for a paste: it keeps the
        first twelve characters of a 13-digit read, so the check digit is what
        falls off. Most truncations then fail that check — but about one in ten
        passes it, and becomes a structurally valid GTIN naming a different
        article with nothing said.

        Announced, not merely shown. A refusal a screen reader never hears is the
        state the whole feature exists to avoid: the field simply does not change
        and nothing says why.
      -->
      <p
        v-if="store.lastScan && !store.lastScan.ok"
        id="gtin-scan-note"
        class="text-caution text-xs"
        role="status"
        aria-live="polite"
      >
        <span class="numeric">{{ store.lastScan.scanned }}</span> was not taken:
        {{ store.lastScan.reason }}
      </p>
      <p
        v-else-if="store.lastScan?.note"
        id="gtin-scan-note"
        class="text-chrome-300 text-xs"
        role="status"
        aria-live="polite"
      >
        {{ store.lastScan.note }}
      </p>

      <p v-if="!gtinIsComplete" class="text-chrome-400 text-xs">
        Twelve digits, check digit included. The check digit is verified rather than computed, so a
        transposed one is caught instead of silently corrected.
      </p>
    </EditorSection>

    <EditorSection
      title="Symbol"
      :element-id="UPC_A_ELEMENTS.symbol"
      :scroll-on-select="false"
      :selected-element-id="store.selectedElementId"
      :status="`${magnification.toFixed(2)}x`"
      @select="select"
    >
      <label :class="LABEL" for="field-magnification">
        <span>Magnification</span>
        <input
          id="field-magnification"
          v-model.number="magnification"
          type="range"
          min="0.5"
          max="2.5"
          step="0.05"
        />
      </label>

      <label :class="LABEL" for="field-bar-height">
        <span>Bar height, mm — blank uses the specification’s minimum</span>
        <input
          id="field-bar-height"
          v-model="barHeightMm"
          :class="INPUT"
          type="number"
          min="1"
          step="0.5"
        />
      </label>

      <label :class="LABEL" for="field-placement">
        <span>Placement</span>
        <select id="field-placement" v-model="symbolPlacement" :class="INPUT">
          <option v-for="anchor in ANCHORS" :key="anchor" :value="anchor">{{ anchor }}</option>
        </select>
      </label>

      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-omit-hri">
        <input
          id="field-omit-hri"
          v-model="store.data.omitHri"
          type="checkbox"
          class="accent-notice"
        />
        <span>Omit the human-readable digits</span>
      </label>
    </EditorSection>

    <EditorSection
      title="Stock"
      :selected-element-id="store.selectedElementId"
      :status="`${store.stock.widthMm} × ${store.stock.heightMm} mm`"
      @select="select"
    >
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label :class="LABEL" for="field-stock-width">
            <span>Width</span>
            <input
              id="field-stock-width"
              v-model.number="store.stock.widthMm"
              :class="INPUT"
              type="number"
              min="1"
            />
          </label>
        </div>
        <div>
          <label :class="LABEL" for="field-stock-height">
            <span>Height</span>
            <input
              id="field-stock-height"
              v-model.number="store.stock.heightMm"
              :class="INPUT"
              type="number"
              min="1"
            />
          </label>
        </div>
        <div>
          <label :class="LABEL" for="field-stock-margin">
            <span>Margin</span>
            <input
              id="field-stock-margin"
              v-model.number="store.stock.marginMm"
              :class="INPUT"
              type="number"
              min="0"
            />
          </label>
        </div>
      </div>
    </EditorSection>

    <EditorSection
      title="Artwork"
      :element-id="UPC_A_ELEMENTS.artwork"
      :selected-element-id="store.selectedElementId"
      :status="hasArtwork ? 'placed' : 'none'"
      @select="select"
    >
      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-artwork-enabled">
        <input
          id="field-artwork-enabled"
          v-model="hasArtwork"
          type="checkbox"
          class="accent-notice"
        />
        <span>Place a brand block</span>
      </label>

      <template v-if="store.data.artwork">
        <label :class="LABEL" for="field-artwork-text">
          <span>Text</span>
          <input
            id="field-artwork-text"
            v-model="store.data.artwork.text"
            :class="INPUT"
            type="text"
          />
        </label>

        <label :class="LABEL" for="field-artwork-anchor">
          <span>Anchor</span>
          <select id="field-artwork-anchor" v-model="store.data.artwork.anchor" :class="INPUT">
            <option v-for="anchor in ANCHORS" :key="anchor" :value="anchor">{{ anchor }}</option>
          </select>
        </label>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label :class="LABEL" for="field-artwork-width">
              <span>Width, mm</span>
              <input
                id="field-artwork-width"
                v-model.number="store.data.artwork.widthMm"
                :class="INPUT"
                type="number"
                min="1"
              />
            </label>
          </div>
          <div>
            <label :class="LABEL" for="field-artwork-height">
              <span>Height, mm</span>
              <input
                id="field-artwork-height"
                v-model.number="store.data.artwork.heightMm"
                :class="INPUT"
                type="number"
                min="1"
              />
            </label>
          </div>
        </div>
      </template>
    </EditorSection>

    <EditorSection
      title="Digital Link"
      :selected-element-id="store.selectedElementId"
      :status="hasDigitalLink ? 'configured' : 'none'"
      @select="select"
    >
      <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-dl-enabled">
        <input
          id="field-dl-enabled"
          v-model="hasDigitalLink"
          type="checkbox"
          class="accent-notice"
        />
        <span>Carry a GS1 Digital Link</span>
      </label>

      <template v-if="store.data.digitalLink">
        <label :class="LABEL" for="field-dl-domain">
          <span>Resolver domain</span>
          <input
            id="field-dl-domain"
            v-model.trim="store.data.digitalLink.domain"
            :class="INPUT"
            type="text"
          />
        </label>

        <div class="grid grid-cols-3 gap-2">
          <div>
            <label :class="LABEL" for="field-dl-lot">
              <span>Lot (10)</span>
              <input id="field-dl-lot" v-model.trim="lot" :class="INPUT" type="text" />
            </label>
          </div>
          <div>
            <label :class="LABEL" for="field-dl-serial">
              <span>Serial (21)</span>
              <input id="field-dl-serial" v-model.trim="serial" :class="INPUT" type="text" />
            </label>
          </div>
          <div>
            <label :class="LABEL" for="field-dl-expiry">
              <span>Expiry (17)</span>
              <input
                id="field-dl-expiry"
                v-model.trim="expiry"
                :class="INPUT"
                type="text"
                placeholder="YYMMDD"
              />
            </label>
          </div>
        </div>

        <label class="text-chrome-300 flex items-center gap-2 text-xs" for="field-dl-alphas">
          <input
            id="field-dl-alphas"
            v-model="store.data.digitalLink.useConvenienceAlphas"
            type="checkbox"
            class="accent-notice"
          />
          <span>Use the convenience alphas (/gtin/)</span>
        </label>
      </template>
    </EditorSection>
  </div>
</template>
