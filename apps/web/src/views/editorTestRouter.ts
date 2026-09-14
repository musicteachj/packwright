/**
 * A router for mounting the editor in jsdom.
 *
 * The editor reads `useRoute().params.id` to decide whether it is opening a
 * saved label, and registers `onBeforeRouteLeave` to defend unsaved work. Both
 * need a router installed; without one `useRoute()` is undefined and every mount
 * throws before a single assertion runs.
 *
 * Given rather than stubbed, because the thing under test in several of these
 * files is what the editor does on mount — and a stub that returns an empty
 * route would answer that question by not asking it.
 */
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

const blank = { template: '<div />' }

export function testRouter(initial = '/labels/new'): Router {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/labels', component: blank },
      { path: '/labels/new', component: blank },
      { path: '/labels/:id', component: blank },
      { path: '/rules', component: blank },
    ],
  })
  void router.push(initial)
  return router
}
