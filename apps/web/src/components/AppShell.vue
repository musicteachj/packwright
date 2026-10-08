<script setup lang="ts">
/**
 * The frame every reading route is set in: the masthead, then the page.
 *
 * A parent route rather than a wrapper in `App.vue`, so the editor — which owns
 * its own full-height frame — is simply not a child of it, and so navigating
 * between two reading routes swaps the page and keeps the masthead mounted.
 *
 * `<main>` lives here, once, with the id the skip link targets. Each page used to
 * declare its own; a page now renders its content and nothing around it.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from './SiteHeader.vue'
import { PAGE, PAGE_INNER } from './chrome'

const route = useRoute()
const section = computed(() => route.meta.section)
</script>

<template>
  <div :class="PAGE">
    <SiteHeader :current="section" />
    <!--
      `tabindex="-1"` so the skip link and a route change can move focus here.
      Focus arriving by script draws no ring: this is a landmark, not a control,
      and a ring round the whole page on every navigation would say otherwise.
    -->
    <main id="main" tabindex="-1" :class="[PAGE_INNER, 'focus:outline-none']">
      <RouterView />
    </main>
  </div>
</template>
