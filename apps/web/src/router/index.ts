import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
  type RouterScrollBehavior,
} from 'vue-router'
import type { Section } from '../components/SiteHeader.vue'

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
 *   /design        the interface catalogue, from the components — done
 *   anything else  the 404, inside the shell                   — done
 *
 * `/labels/new` used to carry the editor *instead of* `/labels/:id`, because
 * there was nothing to have an id. Both exist now, and the order below matters:
 * a literal segment and a parameter both match `/labels/new`, so the literal one
 * has to be declared first or every new document would be read as a saved label
 * called "new".
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** The window's title for this route; `undefined` keeps the application's own. */
    title?: string
    /** Which masthead entry is current. Absent on the editor and the 404. */
    section?: Section
    /**
     * Which page this is, for deciding whether a navigation arrived somewhere new.
     * The two editor routes share one, so a first Save replacing `/labels/new`
     * with `/labels/:id` is not treated as arriving at a different page.
     */
    page?: string
  }
}

/** One loader for both editor routes, which are one page at two addresses. */
const EditorView = () => import('../views/EditorView.vue')

const routes: RouteRecordRaw[] = [
  {
    path: '/labels/new',
    name: 'editor',
    component: EditorView,
    meta: { title: 'New label', page: 'editor' },
  },
  {
    // After `/labels/new`, so the literal route is matched before the parameter.
    path: '/labels/:id',
    name: 'saved-editor',
    component: EditorView,
    meta: { title: 'Saved label', page: 'editor' },
  },
  {
    // The reading routes, as children of the shell so its masthead stays
    // mounted between them. The editor is not among them: it owns its frame.
    path: '/',
    component: () => import('../components/AppShell.vue'),
    children: [
      {
        path: '',
        name: 'landing',
        component: () => import('../views/LandingView.vue'),
        meta: { section: 'landing', page: 'landing' },
      },
      {
        path: 'labels',
        name: 'labels',
        component: () => import('../views/LabelsView.vue'),
        meta: { title: 'Saved labels', section: 'labels', page: 'labels' },
      },
      {
        path: 'audit',
        name: 'audit',
        component: () => import('../views/AuditView.vue'),
        meta: { title: 'Audit a label', section: 'audit', page: 'audit' },
      },
      {
        path: 'rules',
        name: 'rules',
        component: () => import('../views/RulesView.vue'),
        meta: { title: 'Rules', section: 'rules', page: 'rules' },
      },
      {
        path: 'design',
        name: 'design',
        component: () => import('../views/DesignView.vue'),
        meta: { title: 'Design', section: 'design', page: 'design' },
      },
      {
        // Ranked below every other path by the router whatever its position,
        // because a repeated catch-all parameter is the least specific match.
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('../views/NotFoundView.vue'),
        meta: { title: 'Page not found', page: 'not-found' },
      },
    ],
  },
]

/**
 * Back and forward return to where the reader was; anything else starts at the
 * top. Without this a long page like `/rules`, left from far down, came back at
 * the top, and a new page opened at the scroll offset of the last one.
 *
 * A change of query or hash on the same page does not scroll at all.
 */
const scrollBehavior: RouterScrollBehavior = (to, from, savedPosition) => {
  if (savedPosition) return savedPosition
  if (to.path === from.path) return false
  return { top: 0 }
}

/**
 * The application's router over a given history: the browser's in the app, a
 * memory one in tests, so a test mounts the real route table rather than a copy.
 */
export function createAppRouter(history: RouterHistory): Router {
  return createRouter({ history, routes, scrollBehavior })
}

export const router = createAppRouter(createWebHistory())
