import { onScopeDispose, ref, watch } from 'vue'

/**
 * The window's title: the route's own, unless a page has something more exact.
 *
 * Every route names itself in `meta.title`. The editor knows more than its route
 * does — which label is open — and says so through `useDocumentTitle`. The two are
 * read together in `App.vue`, in one place, so nothing races to write
 * `document.title` last.
 */

export const APP_NAME = 'packwright'

/** What the window says on the landing page, and anywhere a route names nothing. */
export const DEFAULT_TITLE = `${APP_NAME} — packaging label compliance`

interface Claim {
  readonly owner: symbol
  readonly title: string
}

const claim = ref<Claim | null>(null)

/** A page's more exact title, or `null` when the route's own stands. */
export const titleOverride = () => claim.value?.title ?? null

/**
 * Lets a page name the window while it is mounted.
 *
 * `source` returning `undefined` hands the title back to the route. The claim is
 * owned, so a page leaving cannot clear a title the page after it has already
 * set.
 */
export function useDocumentTitle(source: () => string | undefined): void {
  const owner = Symbol('documentTitle')
  watch(
    source,
    (title) => {
      if (title !== undefined) claim.value = { owner, title }
      else if (claim.value?.owner === owner) claim.value = null
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    if (claim.value?.owner === owner) claim.value = null
  })
}

/** "Rules — packwright", or the default where there is nothing to name. */
export function composeTitle(name: string | undefined): string {
  return name === undefined ? DEFAULT_TITLE : `${name} — ${APP_NAME}`
}
