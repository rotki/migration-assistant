<script setup lang="ts">
import { RuiButton, RuiIcon } from '@rotki/ui-library';
import { useHead } from '@unhead/vue';
import { type Component, computed, nextTick, watch } from 'vue';
import StepConvert from '@/components/wizard/StepConvert.vue';
import StepFile from '@/components/wizard/StepFile.vue';
import StepFormats from '@/components/wizard/StepFormats.vue';
import StepMapping from '@/components/wizard/StepMapping.vue';
import StepNav from '@/components/wizard/StepNav.vue';
import StepPreview from '@/components/wizard/StepPreview.vue';
import StepTarget from '@/components/wizard/StepTarget.vue';
import { SourceKind } from '@/modules/convert/recipe';
import { RowKind } from '@/modules/convert/row-converter';
import { RotkiColumn } from '@/modules/rotki-format';
import { provideWizard } from '@/modules/wizard/use-wizard';

interface Step {
  title: string;
  description: string;
  component: Component;
}

useHead({ title: 'Convert' });

const { dateFormats, file, header, preview, recipe, step: current } = provideWizard();

const steps: Step[] = [
  { title: 'Choose file', description: 'Pick the CSV your exchange exported.', component: StepFile },
  { title: 'rotki format', description: 'Choose what the rows describe.', component: StepTarget },
  { title: 'Map columns', description: 'Tell the converter where each value rotki needs comes from.', component: StepMapping },
  { title: 'Dates and numbers', description: 'Check how the export writes dates and decimals.', component: StepFormats },
  { title: 'Preview', description: 'See what rotki will import from the first rows.', component: StepPreview },
  { title: 'Convert', description: 'Convert the whole file and download the result.', component: StepConvert },
];

const titles = steps.map(step => step.title);

/** Why the user cannot go on from the current step, if anything stops them. */
const blocker = computed<string | undefined>(() => {
  switch (current.value) {
    case 0:
      return file.value && header.value.length > 1 ? undefined : 'Choose a CSV file with at least two columns.';
    case 2:
      return preview.value.problems[0];
    case 3:
      return recipe.value.fields[RotkiColumn.timestamp]?.source.kind === SourceKind.column && dateFormats.value.length === 0
        && !preview.value.rows.some(row => row.result.kind === RowKind.converted)
        ? 'No date in the sample matches this format.'
        : undefined;
    default:
      return undefined;
  }
});

const isLast = computed<boolean>(() => current.value === steps.length - 1);
const activeStep = computed<Step>(() => steps[current.value] ?? steps[0]!);

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
          Back
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
            Next
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
