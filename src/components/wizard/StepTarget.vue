<script setup lang="ts">
import { RuiIcon, type RuiIcons } from '@rotki/ui-library';
import { computed, nextTick, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { RotkiFormat } from '@/modules/rotki-format';
import { useWizard } from '@/modules/wizard/use-wizard';

interface Choice {
  format: RotkiFormat;
  icon: RuiIcons;
  title: string;
  description: string;
  example: string;
}

const { t } = useI18n({ useScope: 'global' });
const { recipe, setFormat, suggestedFormat } = useWizard();

const choices = computed<Choice[]>(() => [
  {
    format: RotkiFormat.trades,
    icon: 'lu-arrow-left-right',
    title: t('step_target.choices.trades.title'),
    description: t('step_target.choices.trades.description'),
    example: t('step_target.choices.trades.example'),
  },
  {
    format: RotkiFormat.events,
    icon: 'lu-list',
    title: t('step_target.choices.events.title'),
    description: t('step_target.choices.events.description'),
    example: t('step_target.choices.events.example'),
  },
]);

const group = useTemplateRef<HTMLElement>('group');

const KEY_STEPS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/** Arrow keys move the choice and the focus together, as in a native radio group. */
async function onKeydown(event: KeyboardEvent): Promise<void> {
  const step = KEY_STEPS[event.key];
  if (step === undefined)
    return;
  event.preventDefault();
  const options = choices.value;
  const current = options.findIndex(choice => choice.format === recipe.value.format);
  const next = options[(current + step + options.length) % options.length];
  if (!next)
    return;
  setFormat(next.format);
  await nextTick();
  group.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      ref="group"
      class="grid grid-cols-1 md:grid-cols-2 gap-4"
      role="radiogroup"
      :aria-label="t('step_target.label')"
      @keydown="onKeydown($event)"
    >
      <button
        v-for="choice in choices"
        :key="choice.format"
        type="button"
        role="radio"
        :aria-checked="recipe.format === choice.format"
        :tabindex="recipe.format === choice.format ? 0 : -1"
        class="relative flex flex-col gap-2 rounded-md border-2 p-4 pr-10 text-left transition-colors"
        :class="recipe.format === choice.format
          ? 'border-rui-primary bg-rui-primary-subtle'
          : 'border-rui-divider hover:border-rui-primary-border hover:bg-rui-hover'"
        :data-testid="`format-${choice.format}`"
        @click="setFormat(choice.format)"
      >
        <span
          class="absolute right-4 top-4 flex size-5 items-center justify-center rounded-full border-2"
          :class="recipe.format === choice.format ? 'border-rui-primary' : 'border-rui-text-disabled'"
          aria-hidden="true"
        >
          <span
            v-if="recipe.format === choice.format"
            class="size-2.5 rounded-full bg-rui-primary"
          />
        </span>
        <RuiIcon
          :name="choice.icon"
          color="primary"
        />
        <span class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">{{ choice.title }}</span>
          <span
            v-if="suggestedFormat === choice.format"
            class="rounded bg-rui-primary-soft px-1.5 py-0.5 text-xs font-medium text-rui-primary"
            :data-testid="`suggested-${choice.format}`"
          >
            {{ t('step_target.suggested') }}
          </span>
        </span>
        <span class="text-sm text-rui-text-secondary">{{ choice.description }}</span>
        <span class="text-sm italic text-rui-text-secondary">{{ choice.example }}</span>
      </button>
    </div>
    <p class="flex gap-2 text-sm text-rui-text-secondary">
      <RuiIcon
        name="lu-info"
        size="16"
        class="mt-0.5 shrink-0"
      />
      {{ t('step_target.separate_files') }}
    </p>
  </div>
</template>
