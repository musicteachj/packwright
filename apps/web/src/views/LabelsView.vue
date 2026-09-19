<script setup lang="ts">
/**
 * The saved labels.
 *
 * Deliberately thin: name, kind, when it last changed, and the two things you
 * can do with it. The list endpoint omits each label's `data`, so this page
 * cannot show a preview without fetching every document — and a list whose cost
 * grows with the size of the labels in it is a list that gets slower the more
 * useful it becomes.
 */
import { onMounted, ref } from 'vue'
import {
  SavedLabelError,
  deleteLabel,
  listLabels,
  type SavedLabelSummary,
} from '../api/savedLabels'
import SiteHeader from '../components/SiteHeader.vue'
import { BUTTON, PAGE, PAGE_INNER } from '../components/chrome'

const TYPE_NAMES: Record<string, string> = {
  'gs1-retail': 'GS1 retail',
  'ghs-chemical': 'GHS chemical',
  'us-food': 'FDA food',
}

const labels = ref<SavedLabelSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
/** Which row is awaiting confirmation, so the question is asked in place. */
const confirming = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    labels.value = await listLabels()
  } catch (caught) {
    // The server's own sentence where there is one. A list that fails silently
    // reads as a list with nothing in it, which is the one wrong answer.
    error.value = caught instanceof Error ? caught.message : 'The saved labels could not be loaded.'
  } finally {
    loading.value = false
  }
}

async function remove(id: string) {
  confirming.value = null
  try {
    await deleteLabel(id)
    labels.value = labels.value.filter((label) => label.id !== id)
  } catch (caught) {
    // A label that is already gone is a delete that got what it wanted. Treating
    // 404 as a failure leaves a row for a record that no longer exists, and no
    // amount of retrying can clear it.
    if (caught instanceof SavedLabelError && caught.isMissing) {
      labels.value = labels.value.filter((label) => label.id !== id)
      return
    }
    error.value = caught instanceof Error ? caught.message : 'The label could not be deleted.'
  }
}

/** The date in the reader's locale; the machine-readable one stays in `datetime`. */
const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

onMounted(load)
</script>

<template>
  <div :class="PAGE">
    <div :class="PAGE_INNER">
      <SiteHeader current="labels" />

      <main class="flex flex-col gap-6">
        <header class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold tracking-tight">Saved labels</h1>
          <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
            Every label is stored with the stock it was designed at, so opening one gives you back
            the dimensions it was drawn to rather than a default.
          </p>
        </header>

        <p v-if="error" class="border-danger text-danger border-l-2 pl-4 text-sm" role="alert">
          <span class="font-semibold">Error</span> — {{ error }}
        </p>

        <p v-if="loading" class="text-chrome-400 text-sm">Loading…</p>

        <!--
          Gated on `error` as well as on the count. A failed request leaves the
          list empty too, and "nothing saved yet" is the wrong answer to "the
          request failed" — it tells a reader their work is gone.
        -->
        <p
          v-else-if="labels.length === 0 && error === null"
          class="text-chrome-400 text-sm leading-relaxed"
        >
          Nothing saved yet.
          <RouterLink class="text-chrome-100 underline" to="/labels/new"
            >Open the editor</RouterLink
          >
          and save a label to see it here.
        </p>

        <ul v-else class="flex flex-col">
          <li
            v-for="label in labels"
            :key="label.id"
            class="border-chrome-800 flex flex-wrap items-center gap-x-6 gap-y-2 border-b py-4"
          >
            <RouterLink
              :to="`/labels/${label.id}`"
              class="text-chrome-100 grow font-medium hover:underline"
            >
              {{ label.name }}
            </RouterLink>

            <span class="text-chrome-400 text-xs">{{
              TYPE_NAMES[label.labelType] ?? label.labelType
            }}</span>

            <time :datetime="label.updatedAt" class="numeric text-chrome-400 text-xs">
              {{ when(label.updatedAt) }}
            </time>

            <!--
              Asked in place rather than through a browser `confirm`, which cannot
              be styled, cannot be tested without dismissing a dialog, and blocks
              the page while it waits.
            -->
            <span v-if="confirming === label.id" class="flex items-center gap-3 text-xs">
              <span class="text-chrome-300">Delete “{{ label.name }}”?</span>
              <button
                type="button"
                class="text-danger underline"
                data-confirm-delete
                @click="remove(label.id)"
              >
                Delete
              </button>
              <button type="button" class="text-chrome-400 underline" @click="confirming = null">
                Keep
              </button>
            </span>
            <button
              v-else
              type="button"
              :class="[BUTTON, 'px-3 py-1 text-xs']"
              :aria-label="`Delete ${label.name}`"
              @click="confirming = label.id"
            >
              Delete
            </button>
          </li>
        </ul>
      </main>
    </div>
  </div>
</template>
