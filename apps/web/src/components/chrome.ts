/**
 * Shared chrome, for the same reason `formStyles.ts` exists.
 *
 * This recipe had copies in the editor's export button and the landing page's
 * call to action, and a third was about to be written for the catalogue. Copies
 * of a style drift, and the drift is invisible: a button a shade different from
 * its neighbour reads as sloppiness rather than as a bug, so nothing ever fails
 * because of it. They had already drifted — the landing button is `px-4 py-2` and
 * the editor's `px-3 py-1.5`.
 *
 * **Carries no size**, because that difference is real rather than drift: the
 * landing page's is a primary call to action and the editor's is a toolbar
 * control. Callers add their own padding and type scale. Flattening the two into
 * one size would have been a visual regression dressed as a cleanup.
 *
 * The canvas zoom control deliberately does not use this. It is a `role="group"`
 * of toggle buttons whose background is conditional on `aria-pressed` and whose
 * resting text is `chrome-300`, so sharing the recipe would mean parameterising
 * away the parts that differ until nothing was shared.
 */
export const BUTTON =
  'border-chrome-700 bg-chrome-900 text-chrome-100 hover:bg-chrome-800 focus-visible:outline-notice border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'

/**
 * The page frame the reading routes sit in.
 *
 * The editor is `h-screen` and owns its own frame: it is a full-height three-pane
 * application whose rails scroll independently, and a `min-h-screen` page that
 * grows with its content is the opposite shape.
 */
export const PAGE = 'bg-chrome-950 text-chrome-100 min-h-screen'

export const PAGE_INNER = 'mx-auto flex max-w-5xl flex-col gap-12 px-8 py-16'
