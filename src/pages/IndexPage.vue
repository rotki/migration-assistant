<script setup lang="ts">
import { RuiButton, RuiCard, RuiIcon, type RuiIcons } from '@rotki/ui-library';
import { useHead } from '@unhead/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface Feature {
  icon: RuiIcons;
  title: string;
  description: string;
}

const { t } = useI18n({ useScope: 'global' });

/** The directive as the policy writes it; not translated. */
const CONNECT_POLICY = `connect-src 'none'`;

useHead({ title: () => t('index_page.title') });

const features = computed<Feature[]>(() => [
  {
    icon: 'lu-lock',
    title: t('index_page.features.on_device.title'),
    description: t('index_page.features.on_device.description'),
  },
  {
    icon: 'lu-file-spreadsheet',
    title: t('index_page.features.any_export.title'),
    description: t('index_page.features.any_export.description'),
  },
  {
    icon: 'lu-hard-drive',
    title: t('index_page.features.large_files.title'),
    description: t('index_page.features.large_files.description'),
  },
]);
</script>

<template>
  <div class="flex flex-col gap-10">
    <section class="flex flex-col gap-4 pt-4">
      <h1 class="text-3xl sm:text-4xl font-semibold">
        {{ t('index_page.heading') }}
      </h1>
      <i18n-t
        keypath="index_page.intro"
        tag="p"
        scope="global"
        class="text-lg text-rui-text-secondary max-w-3xl"
      >
        <template #menu>
          <span class="font-medium text-rui-text">{{ t('index_page.intro_menu') }}</span>
        </template>
      </i18n-t>
      <div class="w-fit">
        <RouterLink
          #default="{ href, navigate }"
          to="/convert"
          custom
        >
          <RuiButton
            tag="a"
            :href="href"
            color="primary"
            @click="navigate($event)"
          >
            {{ t('index_page.start') }}
            <template #append>
              <RuiIcon
                name="lu-arrow-right"
                size="18"
              />
            </template>
          </RuiButton>
        </RouterLink>
      </div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <RuiCard
        v-for="feature in features"
        :key="feature.icon"
      >
        <div class="flex flex-col gap-2">
          <RuiIcon
            :name="feature.icon"
            color="primary"
          />
          <h2 class="font-semibold">
            {{ feature.title }}
          </h2>
          <p class="text-sm text-rui-text-secondary">
            {{ feature.description }}
          </p>
        </div>
      </RuiCard>
    </section>

    <section class="flex flex-col gap-2 max-w-3xl">
      <h2 class="text-xl font-semibold">
        {{ t('index_page.verify.heading') }}
      </h2>
      <i18n-t
        keypath="index_page.verify.body"
        tag="p"
        scope="global"
        class="text-rui-text-secondary"
      >
        <template #policy>
          <code class="font-mono text-sm">{{ CONNECT_POLICY }}</code>
        </template>
      </i18n-t>
    </section>
  </div>
</template>
