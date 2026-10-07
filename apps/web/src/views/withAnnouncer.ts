/**
 * A view mounted the way `App.vue` mounts it: beside the one region the
 * application speaks through.
 *
 * The views say things through `stores/announcer.ts`, and the region that
 * makes them audible lives at the root, outside every view. A test mounting a
 * view alone would have nothing to read; one reading the store instead would
 * be asserting a list rather than what a screen reader is given. So the tests
 * that care about what is heard mount this, and read the DOM.
 */
import { defineComponent, h, type Component } from 'vue'
import LiveAnnouncer from '../components/LiveAnnouncer.vue'

export const withAnnouncer = (view: Component) =>
  defineComponent({ setup: () => () => [h(view), h(LiveAnnouncer)] })
