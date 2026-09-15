<script setup lang="ts">
/**
 * Audit a label from a photograph.
 *
 * **Mobile-first**, unlike the editor. `docs/DESIGN.md` splits the two on
 * purpose: laying out a 100 x 150 mm label is a desktop job and photographing a
 * drum in a store cupboard is not, so this is one column that grows rather than
 * three panes that collapse. It deliberately does not use `panes.ts`.
 *
 * **Nothing here is label data until it is accepted.** Every row arrives
 * unaccepted; `confirmed()` in `label-core` takes the accepted set and nothing
 * else, so the only route from a reading into a document runs through an
 * explicit act. The rule is `CLAUDE.md`'s and it is the whole point of the
 * screen.
 *
 * Three groups, and the split between the first two is the honest part:
 *
 * - **what the photograph showed** — accepted, edited or discarded, one at a time
 * - **what a photograph cannot show** — the market, the package capacity, the
 *   measured label. Typed by the user and labelled as theirs. **None of it is
 *   defaulted**, because `DEFAULT_GHS_STOCK` is the CLP minimum for its band and
 *   handing that to `ghs/label-dimensions` would clear a label nobody measured.
 * - **the document so far** — what has actually been confirmed, and what is
 *   still missing before anything can be checked.
 *
 * The engine does not run here. Findings and the hand-off into the editor are
 * the stage after this one.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import {
  confirmed,
  GHS_REGIMES,
  type ExtractionResult,
  type GhsLabelData,
  type GhsRegime,
} from '@packwright/label-core'
import { AuditError, readGhsLabel, type LabelReading } from '../api/audit'
import { useLabelPhoto } from '../audit/useLabelPhoto'
import {
  FIELD_SHAPES,
  READING_KEYS,
  formatValue,
  isListKey,
  parseValue,
  partitionEntries,
  unusableReason,
  type ReadingKey,
} from '../audit/readingRows'
import SiteHeader from '../components/SiteHeader.vue'
import { BUTTON, PAGE, PAGE_INNER } from '../components/chrome'
import { INPUT, LABEL } from '../components/formStyles'

const REGIME_NAMES: Readonly<Record<GhsRegime, string>> = {
  'eu-clp': 'European Union — CLP',
  'us-osha': 'United States — OSHA HazCom',
}

const video = shallowRef<HTMLVideoElement | null>(null)
const camera = useLabelPhoto({ video })

/** Chosen, never defaulted: it selects the rules, not merely the wording. */
const regime = ref<GhsRegime | ''>('')
const capacityL = ref('')
const widthMm = ref('')
const heightMm = ref('')

const reading = ref<LabelReading | null>(null)
const readingError = ref<string | null>(null)
const readingDetail = ref<readonly string[]>([])
const busy = ref(false)

/** The text of each field, which is what is shown and what is edited. */
const texts = ref<Partial<Record<ReadingKey, string>>>({})
const accepted = ref(new Set<ReadingKey>())
const editing = ref<ReadingKey | null>(null)

const chosenRegime = computed(() => (regime.value === '' ? 'eu-clp' : regime.value))

watch(regime, () => {
  // The whole reading goes, not merely the acceptances. The regime is sent with
  // the request, so a reading belongs to the market it was made under: keeping
  // it across a change meant a us-osha reading re-judged under CLP, and — since
  // `chosenRegime` falls back to `eu-clp` — re-judged under CLP merely for
  // returning the select to "Choose a market". Clearing it also makes that
  // fallback unreachable while there is anything on screen to judge.
  forgetReading()
})

function forgetReading() {
  reading.value = null
  texts.value = {}
  accepted.value = new Set()
  editing.value = null
  readingError.value = null
  readingDetail.value = []
}

const rows = computed(() =>
  READING_KEYS.flatMap((key) => {
    const text = texts.value[key]
    if (text === undefined) return []
    const field = reading.value?.extraction.fields[key]
    const { unusable } = partitionEntries(key, chosenRegime.value, text)
    const asRead = field === undefined ? undefined : formatValue(key, field.value)
    return [
      {
        key,
        ...FIELD_SHAPES[key],
        text,
        // Dropped once the text differs from what was read. A confidence is the
        // model's account of how clearly it could read something; carried over
        // an edit it becomes a number about text the model never saw, sitting
        // beside it as though it still meant something.
        confidence: asRead === text ? (field?.confidence ?? null) : null,
        unusable,
        unusableReason: unusableReason(key, REGIME_NAMES[chosenRegime.value]),
        contributes: contributes(key, text),
      },
    ]
  }),
)

/**
 * What a row would contribute, with entries this build cannot carry left out.
 *
 * A list field always goes through `partitionEntries`, never through
 * `parseValue`. The first version took the raw parse whenever nothing was
 * unusable, which looked like a shortcut and threw away the canonicalisation on
 * every clean list: an edited `h225` was confirmed verbatim, and the engine
 * looks these up by exact key, so the label drew nothing and recorded an
 * omission. Its test passed because it called `partitionEntries` directly and
 * never came through here.
 */
function valueOf(key: ReadingKey, text: string): unknown {
  if (!isListKey(key)) return parseValue(key, text)
  const { usable } = partitionEntries(key, chosenRegime.value, text)
  return usable.length === 0 ? undefined : usable
}

/** Whether accepting this row would actually put anything in the document. */
function contributes(key: ReadingKey, text: string): boolean {
  return valueOf(key, text) !== undefined
}

const working = computed<ExtractionResult<GhsLabelData>>(() => {
  const fields: ExtractionResult<GhsLabelData>['fields'] = {}
  for (const row of rows.value) {
    const value = valueOf(row.key, row.text)
    if (value === undefined) continue
    Object.assign(fields, { [row.key]: { value, confidence: row.confidence } })
  }
  return { fields, warnings: reading.value?.extraction.warnings ?? [] }
})

const document = computed(() => confirmed(working.value, accepted.value))

/**
 * A measurement, or nothing.
 *
 * `Number.parseFloat` was the first version and it reads `12mm abc` as 12 and
 * `0` as a size — so a gap the screen exists to name stopped being named on the
 * strength of a typo. A measurement is a positive finite number and the whole
 * of what was typed; anything else has not been supplied.
 */
function measurement(text: string): number | undefined {
  const trimmed = text.trim()
  if (!/^\d*\.?\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

const supplied = computed(() => ({
  regime: regime.value === '' ? undefined : regime.value,
  capacityL: measurement(capacityL.value),
  widthMm: measurement(widthMm.value),
  heightMm: measurement(heightMm.value),
}))

/** Named rather than counted, so the screen can say which one is missing. */
const missing = computed(() => {
  const gaps: string[] = []
  if (supplied.value.regime === undefined) gaps.push('the market this label is for')
  if (document.value.productIdentifier === undefined) gaps.push('a confirmed product identifier')
  if (supplied.value.capacityL === undefined) gaps.push('the package capacity')
  if (supplied.value.widthMm === undefined || supplied.value.heightMm === undefined) {
    gaps.push('the measured label size')
  }
  return gaps
})

const summary = computed(() =>
  Object.entries(document.value).map(([key, value]) => ({
    key,
    label: FIELD_SHAPES[key as ReadingKey]?.label ?? key,
    text: formatValue(key as ReadingKey, value).replace(/\n/g, ' · '),
  })),
)

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared whatever happens, so choosing the same file twice fires `change`
  // twice. Without it, discarding a photograph and re-picking the same one from
  // the dialog did nothing at all — no event, no error, no photograph.
  input.value = ''
  if (file === undefined) return
  await camera.fromFile(file)
}

/**
 * A new photograph is a new label until proved otherwise.
 *
 * Without this the rows from the last one stay on screen, and stay acceptable,
 * under a preview of a different photograph — so somebody could accept a
 * reading of photo A while looking at photo B. Watched rather than cleared at
 * each call site because there are two ways a photograph arrives.
 */
watch(() => camera.photo.value, forgetReading)

/**
 * Bumped by anything that invalidates a reading in flight.
 *
 * `read()` takes a while and the photograph, the market and the discard button
 * are all still reachable while it does. Without this, a reading of photo A
 * landed after the watcher had cleared the screen for photo B — repopulating
 * the rows under a preview of a different label, which is exactly what that
 * watcher exists to prevent.
 */
let readGeneration = 0
watch([() => camera.photo.value, regime], () => {
  readGeneration += 1
})

async function read() {
  if (camera.photo.value === null || regime.value === '') return
  const mine = ++readGeneration
  busy.value = true
  readingError.value = null
  readingDetail.value = []
  try {
    const result = await readGhsLabel(camera.photo.value, regime.value)
    if (mine !== readGeneration) return
    reading.value = result
    accepted.value = new Set()
    editing.value = null
    texts.value = Object.fromEntries(
      READING_KEYS.flatMap((key) => {
        const field = result.extraction.fields[key]
        return field === undefined ? [] : [[key, formatValue(key, field.value)]]
      }),
    )
  } catch (caught) {
    if (mine !== readGeneration) return
    reading.value = null
    texts.value = {}
    readingError.value =
      caught instanceof AuditError
        ? caught.message
        : 'The label could not be read. Please try again.'
    readingDetail.value = caught instanceof AuditError ? caught.detail : []
  } finally {
    if (mine === readGeneration) busy.value = false
  }
}

function toggle(key: ReadingKey) {
  const next = new Set(accepted.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  accepted.value = next
}

function discard(key: ReadingKey) {
  const next = new Set(accepted.value)
  next.delete(key)
  accepted.value = next
  const remaining = { ...texts.value }
  delete remaining[key]
  texts.value = remaining
  if (editing.value === key) editing.value = null
}

function edit(key: ReadingKey, text: string) {
  texts.value = { ...texts.value, [key]: text }
  // An edited field stops being accepted. What was agreed to was the value that
  // was on screen when it was agreed to, and carrying the acceptance across an
  // edit would let a value nobody looked at into the document.
  const next = new Set(accepted.value)
  next.delete(key)
  accepted.value = next
}

const canRead = computed(() => camera.photo.value !== null && regime.value !== '' && !busy.value)
</script>

<template>
  <div :class="PAGE">
    <SiteHeader current="audit" />
    <main :class="PAGE_INNER">
      <header class="flex flex-col gap-2">
        <h1 class="text-2xl">Audit a label from a photograph</h1>
        <p class="text-chrome-300 max-w-2xl text-sm">
          Claude reads what is printed. Nothing it reads becomes label data until you accept it, and
          every compliance finding comes from this application's own rules rather than from the
          model.
        </p>
      </header>

      <section class="flex flex-col gap-4" aria-labelledby="market-heading">
        <h2 id="market-heading" class="text-chrome-200 text-sm tracking-widest uppercase">
          The market this label is for
        </h2>
        <label :class="LABEL" class="max-w-sm" for="audit-regime">
          Regime
          <select id="audit-regime" v-model="regime" :class="INPUT" data-test="regime">
            <option value="">Choose a market</option>
            <option v-for="value in GHS_REGIMES" :key="value" :value="value">
              {{ REGIME_NAMES[value] }}
            </option>
          </select>
        </label>
        <p class="text-chrome-400 max-w-2xl text-xs">
          Not read from the photograph, and deliberately not defaulted. It selects which rules apply
          and which statement wording is correct, so a label judged under the wrong one is judged
          wrongly rather than approximately.
        </p>
      </section>

      <section class="flex flex-col gap-4" aria-labelledby="photo-heading">
        <h2 id="photo-heading" class="text-chrome-200 text-sm tracking-widest uppercase">
          The photograph
        </h2>

        <div class="flex flex-wrap items-center gap-3">
          <label :class="[BUTTON, 'cursor-pointer px-3 py-1.5 text-sm']" for="audit-photo-file">
            Choose a photograph
            <input
              id="audit-photo-file"
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
              data-test="photo-file"
              @change="onFile"
            />
          </label>
          <button
            v-if="camera.state.value !== 'previewing'"
            type="button"
            :class="[BUTTON, 'px-3 py-1.5 text-sm']"
            data-test="camera-start"
            @click="camera.start()"
          >
            Use the camera
          </button>
          <button
            v-else
            type="button"
            :class="[BUTTON, 'px-3 py-1.5 text-sm']"
            data-test="camera-capture"
            @click="camera.capture()"
          >
            Take the photograph
          </button>
          <button
            v-if="camera.photo.value !== null"
            type="button"
            :class="[BUTTON, 'px-3 py-1.5 text-sm']"
            @click="camera.discard()"
          >
            Discard it
          </button>
        </div>

        <video
          v-show="camera.state.value === 'previewing'"
          ref="video"
          class="border-chrome-700 max-h-80 w-full max-w-lg border bg-black"
          muted
          playsinline
          aria-label="Camera preview"
        ></video>

        <!--
          The photograph itself, not merely a note that there is one.

          Added after seeing this screen in a browser for the first time, which
          is where it became obvious: the readings below are a claim about a
          label, and checking a claim against a label you cannot see is not
          checking it. On a phone the product is in your other hand; on a desktop
          it is a file you chose a minute ago and may not remember.
        -->
        <img
          v-if="camera.photo.value !== null"
          :src="`data:${camera.photo.value.mediaType};base64,${camera.photo.value.data}`"
          :width="camera.photo.value.widthPx"
          :height="camera.photo.value.heightPx"
          alt="The photograph being read. The fields read from it are listed below."
          class="border-chrome-700 max-h-80 w-auto max-w-lg border bg-white object-contain"
          data-test="photo-preview"
        />

        <p
          class="text-chrome-300 text-sm"
          role="status"
          aria-live="polite"
          :data-capture-state="camera.state.value"
        >
          <span v-if="camera.message.value !== null">{{ camera.message.value }}</span>
          <span v-else-if="camera.photo.value !== null" data-test="photo-taken">
            A photograph is ready — {{ camera.photo.value.widthPx }} ×
            {{ camera.photo.value.heightPx }} px.
          </span>
          <span v-else>No photograph yet.</span>
        </p>

        <div>
          <button
            type="button"
            :class="[BUTTON, 'px-4 py-2 text-sm']"
            :disabled="!canRead"
            data-test="read"
            @click="read()"
          >
            {{ busy ? 'Reading…' : 'Read this label' }}
          </button>
        </div>

        <p v-if="readingError !== null" class="text-danger max-w-2xl text-sm" role="alert">
          {{ readingError }}
          <span v-if="readingDetail.length > 0"> — {{ readingDetail.join('; ') }}</span>
        </p>
      </section>

      <section v-if="rows.length > 0" class="flex flex-col gap-4" aria-labelledby="read-heading">
        <h2 id="read-heading" class="text-chrome-200 text-sm tracking-widest uppercase">
          What the photograph showed
        </h2>
        <p class="text-chrome-400 max-w-2xl text-xs">
          Every reading below is unverified. Accept the ones that match the label in front of you.
        </p>

        <ul class="flex flex-col gap-3">
          <li
            v-for="row in rows"
            :key="row.key"
            class="border-chrome-800 flex flex-col gap-2 border-l-2 pl-4"
            :data-field="row.key"
            :data-accepted="accepted.has(row.key)"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-chrome-100 text-sm">{{ row.label }}</span>
              <span class="numeric text-chrome-400 text-xs">
                <template v-if="row.confidence !== null">
                  confidence {{ row.confidence.toFixed(2) }}
                </template>
                <template v-else>edited</template>
              </span>
            </div>

            <textarea
              v-if="editing === row.key"
              :class="INPUT"
              :rows="row.editor === 'supplier' ? 3 : 2"
              :value="row.text"
              :aria-label="`${row.label}, as read`"
              :data-test="`edit-${row.key}`"
              @input="edit(row.key, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <p v-else class="text-chrome-200 text-sm whitespace-pre-line" :data-value="row.key">
              {{ row.text }}
            </p>
            <p v-if="row.hint !== undefined && editing === row.key" class="text-chrome-400 text-xs">
              {{ row.hint }}
            </p>

            <p
              v-if="row.unusable.length > 0"
              class="border-caution text-caution border-l-2 pl-3 text-xs"
              :data-unusable="row.key"
            >
              {{ row.unusable.join(', ') }} — {{ row.unusableReason }}. It cannot be carried into a
              label here, and accepting this field takes the rest only.
            </p>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                :class="[BUTTON, 'px-2 py-1 text-xs']"
                :aria-pressed="accepted.has(row.key)"
                :disabled="!row.contributes"
                :data-test="`accept-${row.key}`"
                @click="toggle(row.key)"
              >
                {{ accepted.has(row.key) ? 'Accepted' : 'Accept' }}
              </button>
              <!--
                Disabled rather than silently inert. A field edited down to
                something the parser rejects — a supplier with only a name, a
                list of nothing — took the click, recorded the acceptance and
                contributed nothing, with no way to tell that from a field that
                had worked.
              -->
              <span v-if="!row.contributes" class="text-caution self-center text-xs">
                Nothing to accept yet.
              </span>
              <button
                type="button"
                :class="[BUTTON, 'px-2 py-1 text-xs']"
                @click="editing = editing === row.key ? null : row.key"
              >
                {{ editing === row.key ? 'Done' : 'Edit' }}
              </button>
              <button
                type="button"
                :class="[BUTTON, 'px-2 py-1 text-xs']"
                :data-test="`discard-${row.key}`"
                @click="discard(row.key)"
              >
                Discard
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section
        v-if="reading !== null"
        class="flex flex-col gap-4"
        aria-labelledby="measured-heading"
      >
        <h2 id="measured-heading" class="text-chrome-200 text-sm tracking-widest uppercase">
          What the photograph cannot show
        </h2>
        <p class="text-chrome-400 max-w-2xl text-xs">
          Measured or looked up by you, not read by the model. None of these is filled in for you:
          the smallest label CLP permits for a three-litre package is 74 × 105 mm, so a default here
          would clear a size nobody checked.
        </p>
        <div class="grid max-w-2xl gap-4 sm:grid-cols-3">
          <label :class="LABEL" for="audit-capacity">
            Package capacity (L)
            <input
              id="audit-capacity"
              v-model="capacityL"
              :class="INPUT"
              inputmode="decimal"
              data-test="capacity"
            />
          </label>
          <label :class="LABEL" for="audit-width">
            Label width (mm)
            <input
              id="audit-width"
              v-model="widthMm"
              :class="INPUT"
              inputmode="decimal"
              data-test="width"
            />
          </label>
          <label :class="LABEL" for="audit-height">
            Label height (mm)
            <input
              id="audit-height"
              v-model="heightMm"
              :class="INPUT"
              inputmode="decimal"
              data-test="height"
            />
          </label>
        </div>
      </section>

      <section
        v-if="reading !== null"
        class="flex flex-col gap-4"
        aria-labelledby="document-heading"
      >
        <h2 id="document-heading" class="text-chrome-200 text-sm tracking-widest uppercase">
          The document so far
        </h2>
        <p
          v-if="summary.length === 0"
          class="text-chrome-400 text-sm"
          data-test="nothing-confirmed"
        >
          Nothing has been accepted yet, so there is no document.
        </p>
        <dl v-else class="flex flex-col gap-2 text-sm" data-test="document">
          <div v-for="entry in summary" :key="entry.key" class="flex flex-col gap-0.5">
            <dt class="text-chrome-400 text-xs">{{ entry.label }}</dt>
            <dd class="text-chrome-100">{{ entry.text }}</dd>
          </div>
        </dl>
        <p v-if="missing.length > 0" class="text-chrome-300 max-w-2xl text-xs" data-test="missing">
          Still needed before this can be checked: {{ missing.join(', ') }}.
        </p>
      </section>
    </main>
  </div>
</template>
