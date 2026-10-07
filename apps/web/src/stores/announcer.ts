/**
 * What the application says aloud, and the one place it says it from.
 *
 * Settled in interface stage 5 after the same question had been deferred four
 * times. A screen reader announces a *change* to a live region it is already
 * observing; a region created with its text already in it usually says
 * nothing. Every live-region defect this project recorded was one shape of
 * that or its opposite:
 *
 * - the GTIN scan note's region was created in the same render as its text;
 * - the three refused measurements were described but never live at all, so
 *   typing a zero was silent;
 * - the editor's first wait swapped the findings rail out and rebuilt its
 *   region full, so opening a saved label was silent;
 * - and on a narrow screen showing Checks, two regions were perceivable at once
 *   and said the same counts in two different wordings — measured: "0
 *   findings, 6 checks passed." and "All 6 checks passed.".
 *
 * The rule now is **one announcer for everything said about the document**,
 * mounted once at the root and never unmounted, so nothing it says can arrive
 * in a region that was not already being listened to. A widget the user opens
 * — the barcode scanner, the audit camera — may still keep a status line about
 * its own state; that is a different concern, the user asked for it, and it
 * is what "one per concern" always meant in practice. `e2e/` asserts the
 * stronger thing that matters: any one fact is heard exactly once.
 *
 * **One line per concern, changed in place.** Lines are keyed. Saying something
 * under a key that already has a line changes that line's text, which is heard
 * as a change; saying the same text again changes nothing, so a count that
 * holds steady through a keystroke is not read out again. An empty string
 * removes the line.
 *
 * A Pinia store rather than a module-level singleton because every test file
 * already gives each test a fresh Pinia, so nothing said in one test can be
 * heard in the next.
 */
import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'

export interface AnnouncedLine {
  key: string
  text: string
}

export const useAnnouncerStore = defineStore('announcer', () => {
  /** In the order each concern first spoke, so a line does not move when it changes. */
  const lines = ref<AnnouncedLine[]>([])

  function say(key: string, text: string): void {
    const index = lines.value.findIndex((line) => line.key === key)
    if (text === '') {
      if (index !== -1) lines.value.splice(index, 1)
      return
    }
    if (index === -1) lines.value.push({ key, text })
    else lines.value[index]!.text = text
  }

  return { lines, say }
})

/**
 * Says whatever `source` returns under `key`, for as long as the calling
 * component exists.
 *
 * The line goes when the component does. Without that, leaving the editor
 * would leave its findings count standing in the region, heard beside whatever
 * the next page said.
 */
export function useAnnouncement(key: string, source: () => string): void {
  const store = useAnnouncerStore()
  watch(source, (text) => store.say(key, text), { immediate: true })
  onScopeDispose(() => store.say(key, ''))
}
