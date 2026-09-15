import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Route inventory from the plan. Implemented routes only; the rest are added as
 * their phases land.
 *
 *   /              landing                                   — done
 *   /labels        saved labels                              — done
 *   /labels/new    the editor, on a new document             — done
 *   /labels/:id    the editor, on a saved document           — done
 *   /audit         photo/camera label audit                  — done
 *   /rules         the rule catalogue, from the registry     — done
 *
 * `/labels/new` used to carry the editor *instead of* `/labels/:id`, because
 * there was nothing to have an id. Both exist now, and the order below matters:
 * a literal segment and a parameter both match `/labels/new`, so the literal one
 * has to be declared first or every new document would be read as a saved label
 * called "new".
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
    path: '/labels',
    name: 'labels',
    component: () => import('../views/LabelsView.vue'),
  },
  {
    // After `/labels/new`, so the literal route is matched before the parameter.
    path: '/labels/:id',
    name: 'saved-editor',
    component: () => import('../views/EditorView.vue'),
  },
  {
    path: '/audit',
    name: 'audit',
    component: () => import('../views/AuditView.vue'),
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
