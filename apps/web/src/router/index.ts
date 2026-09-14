import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Route inventory from the plan. Implemented routes only; the rest are added as
 * their phases land.
 *
 *   /              landing                                   — done
 *   /labels/new    the editor, on an in-memory document      — done
 *   /labels        saved labels
 *   /labels/:id    the editor, on a saved document
 *   /audit         photo/camera label audit
 *   /rules         the rule catalogue, from the registry       — done
 *
 * `/labels/new` carries the editor rather than `/labels/:id` because there is no
 * persistence yet. An id would have to be invented, and inventing one means
 * either a fake route parameter or a browser-storage layer built to be thrown
 * away. The route shape is the cheaper of the two to change later.
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/LandingView.vue'),
  },
  {
    path: '/labels/new',
    name: 'editor',
    component: () => import('../views/EditorView.vue'),
  },
  {
    path: '/rules',
    name: 'rules',
    component: () => import('../views/RulesView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
