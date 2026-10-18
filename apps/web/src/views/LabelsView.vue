<script setup lang="ts">
/**
 * The labels this browser saved.
 *
 * Only this browser's, since 2026-10-18. The page used to list every label on
 * the server, which published every link, and anyone could then change or
 * delete any of them (`docs/security-review-2026-10-18.md`, finding 4). Now a
 * label can be changed only with the edit token its creator was handed, and the
 * list is of the labels this browser holds tokens for (`api/heldLabels.ts`).
 * The page says so in plain words, along with the two ways a label leaves it:
 * clearing the browser's storage, and expiry thirty days after its last change.
 *
 * Deliberately thin: name, kind, when it last changed, and the two things you
 * can do with it. The list endpoint omits each label's `data`, so this page
 * cannot show a preview without fetching every document — and a list whose cost
 * grows with the size of the labels in it is a list that gets slower the more
 * useful it becomes.
 *
 * **What happens here is said through the announcer**, not through a region of
 * this page's own: loading, what loaded, a failure, a deletion. The error line
 * below is visible and nothing more. It was `role="alert"`, which beside the
 * announcer would have said every failure twice.
 */
import { computed, onMounted, ref } from 'vue'
import {
  SavedLabelError,
  deleteLabel,
  listLabels,
  type LabelCount,
  type SavedLabelSummary,
} from '../api/savedLabels'
import { BUTTON } from '../components/chrome'
import { useAnnouncement } from '../stores/announcer'

const TYPE_NAMES: Record<string, string> = {
  'gs1-retail': 'GS1 retail',
  'ghs-chemical': 'GHS chemical',
  'us-food': 'FDA food',
}

const labels = ref<SavedLabelSummary[]>([])
/** The server's cap and count, or `null` where it gave none; then no figure is shown. */
const counted = ref<LabelCount | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
/** Which row is awaiting confirmation, so the question is asked in place. */
const confirming = ref<string | null>(null)
/** The name of the label just deleted, until anything else happens. */
const deleted = ref<string | null>(null)

const atCap = computed(() => counted.value !== null && counted.value.count >= counted.value.cap)

/**
 * "3 saved in this browser.", counted from the list itself. The server's count
 * is of everyone's labels, and is said only where it matters to this reader:
 * when the app is full and nothing new can be saved.
 */
const tally = computed(() => {
  const yours = labels.value.length
  return yours === 0 ? 'No labels saved in this browser yet.' : `${yours} saved in this browser.`
})

/** Said when the app is full, which stops this reader saving as surely as anyone. */
const fullSentence = computed(() =>
  counted.value === null
    ? ''
    : `This app keeps ${counted.value.cap} labels and has ${counted.value.count}, so nothing new can be saved until one is deleted or expires.`,
)

/** The count line, shown and said alike. */
const countLine = computed(() =>
  atCap.value ? `${tally.value} ${fullSentence.value}` : tally.value,
)

useAnnouncement('saved-labels', () => {
  if (loading.value) return 'Loading saved labels…'
  if (error.value !== null) return error.value
  if (deleted.value !== null) return `Deleted “${deleted.value}”. ${countLine.value}`
  return countLine.value
})

async function load() {
  loading.value = true
  error.value = null
  deleted.value = null
  try {
    const list = await listLabels()
    labels.value = list.labels
    counted.value = list.counted
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
  error.value = null
  deleted.value = null
  const name = labels.value.find((label) => label.id === id)?.name ?? 'the label'
  /** Gone from the list and from the count, which the server's own count no longer includes. */
  const forget = () => {
    labels.value = labels.value.filter((label) => label.id !== id)
    if (counted.value !== null) {
      counted.value = { ...counted.value, count: Math.max(0, counted.value.count - 1) }
    }
    deleted.value = name
  }
  try {
    await deleteLabel(id)
    forget()
  } catch (caught) {
    // A label that is already gone is a delete that got what it wanted. Treating
    // 404 as a failure leaves a row for a record that no longer exists, and no
    // amount of retrying can clear it.
    if (caught instanceof SavedLabelError && caught.isMissing) {
      forget()
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
  <div class="flex flex-col gap-6">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold tracking-tight">Saved labels</h1>
      <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed">
        The labels saved in this browser. Each is stored with the stock it was designed at, so
        opening one gives you back the dimensions it was drawn to rather than a default.
      </p>
      <!--
        Said plainly and up front, because both are permanent and neither is
        something a person would guess: there are no accounts, so this browser's
        storage is the only key to its labels.
      -->
      <p class="text-chrome-400 max-w-2xl text-sm leading-relaxed" data-labels-ownership>
        A label can be changed or deleted only from the browser that saved it. Clearing this
        browser's storage loses that for good, though anyone with a label's link can still open it.
        Labels are removed 30 days after their last change.
      </p>
      <!--
        A count of labels, not a measurement, so it is set in the sentence's own
        face. This browser's count is the list's own; the app's is said only when
        it is full. Not shown over an empty list, which the line below says.
      -->
      <p
        v-if="!loading && error === null && (labels.length > 0 || atCap)"
        class="text-chrome-300 text-sm"
        data-label-count
      >
        {{ countLine }}
      </p>
    </header>

    <!-- Visible only. The announcer says it; a role here would say it twice. -->
    <p v-if="error" class="border-danger text-danger border-l-2 pl-4 text-sm" data-labels-error>
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
      Nothing saved in this browser yet.
      <RouterLink class="text-chrome-100 underline" to="/labels/new">Open the editor</RouterLink>
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
  </div>
</template>
