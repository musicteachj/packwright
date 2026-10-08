<script setup lang="ts">
import { nextTick, onScopeDispose, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LiveAnnouncer from './components/LiveAnnouncer.vue'
import { composeTitle, titleOverride } from './documentTitle'

const route = useRoute()
const router = useRouter()

watchEffect(() => {
  document.title = composeTitle(titleOverride() ?? route.meta.title)
})

/**
 * Both frames — the shell and the editor — declare one `<main id="main">`.
 *
 * A route change has already put the page where it belongs (`scrollBehavior`), so
 * focusing must not move it. The skip link is different: it is `fixed`, so it can
 * be used from anywhere down the page, and focus it moves must come into view.
 */
function focusMain({ scroll }: { scroll: boolean }) {
  const main = document.getElementById('main')
  if (main === null) return
  // Explicitly, because `focus()` scrolls only an element that is out of view,
  // and `main` spans the whole page: from far down it is still "in view", and
  // focus went to the top of a page the reader could not see.
  if (scroll) main.scrollIntoView({ block: 'start' })
  main.focus({ preventScroll: true })
}

/**
 * Arriving on a different page moves focus to it.
 *
 * Without this a keyboard or screen-reader user who follows a link stays focused
 * on the link, now detached from a page that has gone, and hears nothing of the
 * page that replaced it. Focusing `<main>` reads its new content from the top.
 * Not on the first load, where the browser already starts at the top of the
 * document, and not between the editor's two addresses, which are one page: a
 * first Save replaces `/labels/new` with `/labels/:id` and must leave focus on
 * the Save button.
 */
const stopFocusing = router.afterEach((to, from, failure) => {
  if (failure || from.matched.length === 0) return
  if (to.meta.page === from.meta.page) return
  void nextTick(() => focusMain({ scroll: false }))
})
onScopeDispose(stopFocusing)
</script>

<template>
  <!--
    First in the document, so it is the first thing Tab reaches. Visible only once
    it has focus. A click handler rather than the bare fragment, because a
    `#main` in the address would be read by the router as a navigation.
  -->
  <a
    href="#main"
    class="bg-chrome-900 text-chrome-100 border-chrome-700 focus-visible:outline-notice sr-only z-50 border px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    data-test="skip-link"
    @click.prevent="focusMain({ scroll: true })"
  >
    Skip to content
  </a>
  <RouterView />
  <!--
    Outside the router view, so it outlives every route: a region that came and
    went with the page would be created full on each arrival, which is the shape
    `stores/announcer.ts` exists to make impossible.
  -->
  <LiveAnnouncer />
</template>
