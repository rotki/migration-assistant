<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { useI18n } from 'vue-i18n';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';

const { locale, t } = useI18n({ useScope: 'global' });

useHead({
  titleTemplate: title => (title ? t('app.title_template', { title }) : t('app.name')),
  htmlAttrs: { lang: locale },
  meta: [
    {
      name: 'description',
      content: () => t('app.description'),
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
