<script setup lang="ts">
import { RuiIcon } from '@rotki/ui-library';
import { useI18n } from 'vue-i18n';

const current = defineModel<number>({ required: true });

const { titles } = defineProps<{ titles: string[] }>();

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <nav :aria-label="t('step_nav.label')">
    <ol class="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      <li
        v-for="(title, index) in titles"
        :key="title"
        class="flex items-center gap-1"
      >
        <button
          type="button"
          class="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors"
          :class="{
            'bg-rui-primary-subtle text-rui-text font-medium': index === current,
            'text-rui-text hover:bg-rui-hover': index < current,
            'text-rui-text-disabled cursor-default': index > current,
          }"
          :disabled="index > current"
          :aria-current="index === current ? 'step' : undefined"
          :data-testid="`step-${index}`"
          @click="current = index"
        >
          <span
            class="flex size-6 items-center justify-center rounded-full text-xs"
            :class="index <= current ? 'bg-rui-primary text-rui-primary-foreground' : 'border border-rui-divider'"
          >
            <RuiIcon
              v-if="index < current"
              name="lu-check"
              size="14"
            />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span :class="index === current ? '' : 'sr-only sm:not-sr-only'">{{ title }}</span>
        </button>
        <span
          v-if="index < titles.length - 1"
          class="hidden xl:block w-3 border-t border-rui-divider"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>
