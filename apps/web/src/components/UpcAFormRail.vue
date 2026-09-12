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
        />
      </label>

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
