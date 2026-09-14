import { onUnmounted, ref, type Ref } from 'vue'

/**
 * The editor's three panes, and which one a narrow screen is showing.
 *
 * The editor is desktop-first and says so: a phone is a bad place to lay out a
 * 100 × 150 mm label, and pretending otherwise produces a worse desktop tool. So
 * below 1024px the three panes do not shrink — they take turns, and this names
 * whose turn it is.
 *
 * Above that width the value is inert: all three panes are displayed and nothing
 * reads it. It is not cleared on the way up, so a window dragged narrow again
 * returns to the pane it was on rather than to a default.
 */
export const EDITOR_PANES = [
  { id: 'form', label: 'Form' },
  { id: 'preview', label: 'Preview' },
  { id: 'checks', label: 'Checks' },
] as const

export type EditorPane = (typeof EDITOR_PANES)[number]['id']

/**
 * Preview, because it is the one pane that is unusable at a glance anywhere else.
 *
 * The form and the findings are both legible in a list; the label is the thing
 * the tool exists to draw, and opening on it is how a narrow screen shows what
 * this application is.
 */
export const DEFAULT_EDITOR_PANE: EditorPane = 'preview'

/**
 * Whether the editor is below the width its three panes fit in.
 *
 * The collapse is a CSS concern and its **accessibility is not**: `role` cannot be
 * set by a media query, so with the tablist merely `lg:hidden` a wide screen had
 * three `tabpanel`s and no visible `tab` owning them, and a narrow one had its
 * only `aria-live` region inside a pane that was `display:none`. Both were
 * measured in a browser rather than argued about — zero visible tabs against
 * three visible panels, and a live region with no client rects.
 *
 * 1023.98px rather than 1023px, because a viewport can be fractional on a
 * scaled display and `max-width: 1023px` leaves 1023.5 matching neither this nor
 * Tailwind's `lg`.
 */
export const NARROW_EDITOR_QUERY = '(max-width: 1023.98px)'

export function useNarrowEditor(): Ref<boolean> {
  // jsdom implements no `matchMedia`, and a component that threw there would take
  // every existing editor test with it. Absent means wide, which is the shape
  // those tests already assert.
  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW_EDITOR_QUERY)
      : undefined

  const narrow = ref(media?.matches ?? false)
  if (media === undefined) return narrow

  const update = (event: MediaQueryListEvent) => {
    narrow.value = event.matches
  }
  media.addEventListener('change', update)
  onUnmounted(() => media.removeEventListener('change', update))

  return narrow
}
