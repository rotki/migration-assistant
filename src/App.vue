<script setup lang="ts">
import { useHead } from '@unhead/vue';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';

useHead({
  titleTemplate: title => (title ? `${title} | rotki migration assistant` : 'rotki migration assistant'),
  htmlAttrs: { lang: 'en' },
  meta: [
    {
      name: 'description',
      content: 'Convert exchange CSV history to rotki\'s import format. Everything runs in your browser, nothing is uploaded.',
    },
  ],
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-rui-background text-rui-text">
    <AppHeader />
    <main class="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
