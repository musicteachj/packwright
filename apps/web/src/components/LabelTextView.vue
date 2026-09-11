<script setup lang="ts">
/**
 * The canvas as text.
 *
 * The canvas is an SVG, which is an image to a screen reader, so it needs a text
 * equivalent — every element and where it sits. That is an accessibility
 * requirement, and it turns out to be the fastest way for anyone to check what
 * the layout engine actually produced, which is why it is not tucked away.
 *
 * Omissions are listed alongside the elements rather than left out. A label
 * missing its barcode with no explanation reads as a rendering bug; saying why
 * it is missing is the whole difference.
 */
import { mm, type ResolvedLayout } from '@packwright/label-core'
import { computed } from 'vue'

const props = defineProps<{ layout: ResolvedLayout }>()

const rows = computed(() =>
  props.layout.elements.map((element) => ({
    id: element.elementId,
    label: element.label,
    // The house formatters, so a position here and a measurement in the rail
    // agree to the digit.
    position: `${mm(element.box.xMm)}, ${mm(element.box.yMm)}`,
    size: `${mm(element.box.widthMm)} × ${mm(element.box.heightMm)}`,
  })),
)
</script>

<template>
  <details class="border-chrome-800 border-t px-4 py-3">
    <summary
      class="text-chrome-300 focus-visible:outline-notice cursor-pointer text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Label contents as text
    </summary>

    <table class="mt-3 w-full text-left text-xs">
      <caption class="sr-only">
        Every element on the label, with its position and size in millimetres
      </caption>
      <thead class="text-chrome-400">
        <tr>
          <th scope="col" class="py-1 pr-3 font-normal">Element</th>
          <th scope="col" class="py-1 pr-3 font-normal">Position</th>
          <th scope="col" class="py-1 font-normal">Size</th>
        </tr>
      </thead>
      <tbody class="numeric text-chrome-200">
        <tr v-for="row in rows" :key="row.id" class="border-chrome-800 border-t">
          <td class="py-1 pr-3">{{ row.label }}</td>
          <td class="py-1 pr-3">{{ row.position }}</td>
          <td class="py-1">{{ row.size }}</td>
        </tr>
        <tr v-if="!rows.length" class="border-chrome-800 border-t">
          <td colspan="3" class="text-chrome-400 py-1">Nothing was placed on this label.</td>
        </tr>
      </tbody>
    </table>

    <ul v-if="layout.omissions.length" class="mt-3 flex flex-col gap-1">
      <li
        v-for="omission in layout.omissions"
        :key="omission.elementId"
        class="text-danger text-xs"
      >
        <span aria-hidden="true">⊘</span> {{ omission.reason }}
      </li>
    </ul>
  </details>
</template>
