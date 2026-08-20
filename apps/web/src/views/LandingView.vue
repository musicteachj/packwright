<script setup lang="ts">
import { buildDigitalLinkUri, calculateCheckDigit, quietZoneMm } from '@packwright/label-core'

// A placeholder view whose only job right now is to prove the workspace wiring:
// the browser bundle resolves label-core from source, and its output is real.
// Replaced by the actual landing page in phase 6.
const gtinPayload = '0950600013435'
const gtin = `${gtinPayload}${calculateCheckDigit(gtinPayload)}`
const digitalLink = buildDigitalLinkUri({
  domain: 'https://id.example.com',
  primary: { ai: '01', value: gtin },
})
const quietZone = quietZoneMm('UPC-A', 0.33)
</script>

<template>
  <main class="mx-auto max-w-2xl p-8 font-mono text-sm">
    <h1 class="mb-6 text-lg font-bold">packwright</h1>
    <dl class="space-y-2">
      <div>
        <dt class="inline">GTIN</dt>
        <dd class="inline">
          {{ gtin }}
        </dd>
      </div>
      <div>
        <dt class="inline">Digital Link</dt>
        <dd class="inline">
          {{ digitalLink }}
        </dd>
      </div>
      <div>
        <dt class="inline">UPC-A quiet zone</dt>
        <dd class="inline">{{ quietZone.leftMm.toFixed(2) }} mm each side at 0.33 mm X</dd>
      </div>
    </dl>
  </main>
</template>
