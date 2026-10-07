<script setup lang="ts">
import LiveAnnouncer from './components/LiveAnnouncer.vue'
</script>

<template>
  <RouterView />
  <!--
    Outside the router view, so it outlives every route: a region that came and
    went with the page would be created full on each arrival, which is the shape
    `stores/announcer.ts` exists to make impossible.
  -->
  <LiveAnnouncer />
</template>
