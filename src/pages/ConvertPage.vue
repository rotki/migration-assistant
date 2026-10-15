<script setup lang="ts">
import { RuiButton, RuiIcon } from '@rotki/ui-library';
import { useHead } from '@unhead/vue';
import { type Component, computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import StepConvert from '@/components/wizard/StepConvert.vue';
import StepFile from '@/components/wizard/StepFile.vue';
import StepFormats from '@/components/wizard/StepFormats.vue';
import StepMapping from '@/components/wizard/StepMapping.vue';
import StepNav from '@/components/wizard/StepNav.vue';
import StepPreview from '@/components/wizard/StepPreview.vue';
import StepTarget from '@/components/wizard/StepTarget.vue';
import { SourceKind } from '@/modules/convert/recipe';
import { RowKind } from '@/modules/convert/row-converter';
import { useMessages } from '@/modules/convert/use-messages';
import { RotkiColumn } from '@/modules/rotki-format';
import { provideWizard } from '@/modules/wizard/use-wizard';

interface Step {
  title: string;
  description: string;
  component: Component;
}

const { t } = useI18n({ useScope: 'global' });
const { translate } = useMessages();

useHead({ title: () => t('convert_page.title') });

const { dateFormats, file, header, preview, recipe, step: current } = provideWizard();

const steps = computed<Step[]>(() => [
  { title: t('convert_page.steps.file.title'), description: t('convert_page.steps.file.description'), component: StepFile },
  { title: t('convert_page.steps.target.title'), description: t('convert_page.steps.target.description'), component: StepTarget },
  { title: t('convert_page.steps.mapping.title'), description: t('convert_page.steps.mapping.description'), component: StepMapping },
  { title: t('convert_page.steps.formats.title'), description: t('convert_page.steps.formats.description'), component: StepFormats },
  { title: t('convert_page.steps.preview.title'), description: t('convert_page.steps.preview.description'), component: StepPreview },
  { title: t('convert_page.steps.convert.title'), description: t('convert_page.steps.convert.description'), component: StepConvert },
]);

const titles = computed<string[]>(() => steps.value.map(step => step.title));

/** The first thing keeping the recipe from converting the file, in the page's language. */
const firstProblem = computed<string | undefined>(() => {
  const [problem] = preview.value.problems;
  return problem && translate(problem);
});

/** Why the user cannot go on from the current step, if anything stops them. */
const blocker = computed<string | undefined>(() => {
  switch (current.value) {
    case 0:
      return file.value && header.value.length > 1 ? undefined : t('convert_page.blocker.no_file');
    case 2:
      return firstProblem.value;
    case 3:
      return recipe.value.fields[RotkiColumn.timestamp]?.source.kind === SourceKind.column && dateFormats.value.length === 0
        && !preview.value.rows.some(row => row.result.kind === RowKind.converted)
        ? t('convert_page.blocker.no_date_match')
        : undefined;
    default:
      return undefined;
  }
});

const isLast = computed<boolean>(() => current.value === steps.value.length - 1);
const activeStep = computed<Step>(() => steps.value[current.value] ?? steps.value[0]!);

function next(): void {
  if (!blocker.value && !isLast.value)
    current.value++;
}

function back(): void {
  if (current.value > 0)
    current.value--;
}

watch(current, async () => {
  await nextTick();
  window.scrollTo({ top: 0 });
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <StepNav
      v-model="current"
      :titles="titles"
    />

    <section
      class="flex flex-col gap-6 min-w-0"
      :aria-label="activeStep.title"
    >
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">
          {{ activeStep.title }}
        </h1>
        <p class="text-rui-text-secondary">
          {{ activeStep.description }}
        </p>
      </div>

      <KeepAlive>
        <component :is="activeStep.component" />
      </KeepAlive>

      <div
        class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-rui-divider bg-rui-background px-4 py-3"
        data-testid="wizard-actions"
      >
        <RuiButton
          variant="text"
          :disabled="current === 0"
          data-testid="wizard-back"
          @click="back()"
        >
          <template #prepend>
            <RuiIcon
              name="lu-arrow-left"
              size="16"
            />
          </template>
          {{ t('convert_page.back') }}
        </RuiButton>
        <div class="flex items-center gap-3">
          <span
            v-if="blocker"
            class="text-xs text-right text-rui-text-secondary"
            data-testid="wizard-blocker"
          >
            {{ blocker }}
          </span>
          <RuiButton
            v-if="!isLast"
            color="primary"
            :disabled="!!blocker"
            data-testid="wizard-next"
            @click="next()"
          >
            {{ t('convert_page.next') }}
            <template #append>
              <RuiIcon
                name="lu-arrow-right"
                size="16"
              />
            </template>
          </RuiButton>
        </div>
      </div>
    </section>
  </div>
</template>
