<script setup lang="ts">
/**
 * Point the camera at a pack, and take the GTIN off it.
 *
 * The read goes to `store.applyScan` rather than into the field, so a symbol the
 * form cannot take is refused with the reason and the document is left alone.
 * Nothing here decides what may become a GTIN-12 — `normaliseScannedGtin` does,
 * and it is the only place permitted to.
 *
 * The camera is released the moment a read is accepted. A scanner that keeps
 * running after it has what it came for leaves the light on, and the light is how
 * the person holding the phone knows whether they are being watched.
 */
import { ref, useTemplateRef } from 'vue'
import { useLabelDocumentStore } from '../stores/labelDocument'
import { useBarcodeScanner } from '../scanner/useBarcodeScanner'
import type { SelectedDetector } from '../scanner/detector'
import { BUTTON } from './chrome'

const props = defineProps<{
  /** Injected by tests. Production takes the default. */
  detectorFactory?: () => Promise<SelectedDetector>
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}>()

const store = useLabelDocumentStore()
const open = ref(false)

/**
 * The component owns the element and hands it over.
 *
 * `ref="video"` binds to a *setup binding* of that name. An earlier version had
 * the composable own the ref and the component assign `const video =
 * scanner.video`, which vue-tsc reported as an unused local and Vue never
 * populated — `play()` was called on nothing and the camera sat paused with no
 * frames while the status read "scanning".
 */
const video = useTemplateRef<HTMLVideoElement>('video')

const scanner = useBarcodeScanner({
  video,
  ...(props.detectorFactory === undefined ? {} : { detectorFactory: props.detectorFactory }),
  ...(props.getMedia === undefined ? {} : { getMedia: props.getMedia }),
  onRead: (rawValue) => {
    const result = store.applyScan(rawValue)
    // Only a read the form could take closes the camera. A refusal leaves it
    // running, because the next thing the user does is point it at the barcode
    // again — and a scanner that shuts itself off after refusing reads as broken.
    if (result.ok) close()
  },
})

async function toggle() {
  if (open.value) return close()
  open.value = true
  await scanner.start()
}

function close() {
  scanner.stop()
  open.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      :class="[BUTTON, 'self-start px-3 py-1.5 text-xs']"
      :aria-expanded="open"
      aria-controls="gtin-scanner"
      @click="toggle"
    >
      {{ open ? 'Stop scanning' : 'Scan a barcode' }}
    </button>

    <div v-if="open" id="gtin-scanner" class="flex flex-col gap-2">
      <!--
        `playsinline` or iOS takes the video full-screen the moment it plays,
        which hides the form the scan is filling in. `muted` because a stream with
        no audio track still counts as un-muted to autoplay policy on some
        versions, and `play()` is then refused.
      -->
      <video
        ref="video"
        class="border-chrome-700 w-full border bg-black"
        :class="scanner.state.value === 'scanning' ? '' : 'hidden'"
        playsinline
        muted
        aria-label="Camera preview"
      ></video>

      <p
        class="text-chrome-400 text-xs"
        role="status"
        aria-live="polite"
        :data-scan-state="scanner.state.value"
        :data-scan-engine="scanner.engine.value ?? ''"
      >
        <template v-if="scanner.message.value">{{ scanner.message.value }}</template>
        <template v-else-if="scanner.state.value === 'starting'">Starting the camera…</template>
        <template v-else-if="scanner.state.value === 'scanning'">
          Point the camera at the barcode.
        </template>
      </p>
    </div>
  </div>
</template>
