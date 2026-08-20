import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Route inventory from the plan. Only the landing route is implemented; the
 * rest are added as their phases land.
 *
 *   /              landing
 *   /labels        saved labels
 *   /labels/new    label type chooser
 *   /labels/:id    the editor — the app
 *   /audit         photo/camera label audit
 *   /rules         the rule catalogue, generated from the registry
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/LandingView.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
