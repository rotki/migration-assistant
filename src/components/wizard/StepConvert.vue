<script setup lang="ts">
import { RuiAlert, RuiButton, RuiIcon, RuiProgress, RuiTextField } from '@rotki/ui-library';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { messageKey } from '@/modules/convert/messages';
import { serializeRecipe, SourceKind } from '@/modules/convert/recipe';
import { RowKind } from '@/modules/convert/row-converter';
import { ConversionState, downloadNames, useConversion } from '@/modules/convert/use-conversion';
import { useMessages } from '@/modules/convert/use-messages';
import { RotkiColumn } from '@/modules/rotki-format';
import { useWizard } from '@/modules/wizard/use-wizard';

const { locale, t } = useI18n({ useScope: 'global' });
const { rejectedFileTexts, translate } = useMessages();
const { file, preview, recipe, restart } = useWizard();
const { cancel, output, problems, rejected, reset, start, state, stats } = useConversion();

const recipeUrl = ref<string>();

const number = computed<Intl.NumberFormat>(() => new Intl.NumberFormat(locale.value));

const startLabel = computed<string>(() => {
  const labels: Record<ConversionState, string> = {
    [ConversionState.idle]: t('step_convert.start.idle'),
    [ConversionState.running]: t('step_convert.start.running'),
    [ConversionState.done]: t('step_convert.start.done'),
    [ConversionState.failed]: t('step_convert.start.failed'),
  };
  return labels[state.value];
});

function formatSize(size: number): string {
  if (size < 1024)
    return t('common.size.b', { size });
  if (size < 1024 * 1024)
    return t('common.size.kb', { size: (size / 1024).toFixed(1) });
  return t('common.size.mb', { size: (size / 1024 / 1024).toFixed(1) });
}

const names = computed(() => downloadNames(recipe.value, file.value?.name ?? ''));

/** Private windows keep stored files in memory, which matters from a few hundred MB on. */
const LARGE_FILE = 500 * 1024 * 1024;

const isLarge = computed<boolean>(() => (file.value?.size ?? 0) >= LARGE_FILE);

const location = computed<string>(() => {
  const source = recipe.value.fields[RotkiColumn.location]?.source;
  if (source?.kind === SourceKind.column)
    return t('step_convert.location.column', { column: source.column });
  return source?.kind === SourceKind.constant ? source.value : t('step_convert.location.not_set');
});

/** What the preview found, as the expectation for the whole file. */
const expectation = computed<string>(() => {
  const rows = preview.value.rows;
  const converted = rows.filter(row => row.result.kind === RowKind.converted).length;
  const rejectedRows = rows.filter(row => row.result.kind === RowKind.rejected).length;
  const skipped = rows.filter(row => row.result.kind === RowKind.skipped).length;
  const parts = [t('step_convert.expectation.converted', { converted, total: rows.length }, rows.length)];
  if (rejectedRows > 0)
    parts.push(t('step_convert.expectation.rejected', { count: rejectedRows }));
  if (skipped > 0)
    parts.push(t('step_convert.expectation.skipped', { count: skipped }));
  return parts.join(', ');
});

const progress = computed<number>(() => {
  const current = stats.value;
  if (!current || current.totalBytes === 0)
    return 0;
  return Math.round((current.bytesRead / current.totalBytes) * 100);
});

async function convert(): Promise<void> {
  if (file.value)
    await start(file.value, recipe.value, rejectedFileTexts(recipe.value.dates.format));
}

function convertAnother(): void {
  reset();
  restart();
}

function downloadRecipe(): void {
  if (recipeUrl.value)
    URL.revokeObjectURL(recipeUrl.value);
  recipeUrl.value = URL.createObjectURL(new Blob([serializeRecipe(recipe.value)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = recipeUrl.value;
  link.download = `${recipe.value.name.trim() || 'recipe'}.recipe.json`;
  link.click();
}

onBeforeUnmount(() => {
  if (recipeUrl.value)
    URL.revokeObjectURL(recipeUrl.value);
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <dl
      class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 rounded-md border border-rui-divider p-4 text-sm"
      data-testid="convert-summary"
    >
      <dt class="text-rui-text-secondary">
        {{ t('step_convert.file') }}
      </dt>
      <dd class="m-0 break-all">
        {{ t('common.name_and_size', { name: file?.name ?? '', size: formatSize(file?.size ?? 0) }) }}
      </dd>
      <dt class="text-rui-text-secondary">
        {{ t('step_convert.becomes') }}
      </dt>
      <dd class="m-0">
        {{ t('step_convert.becomes_value', { format: recipe.format, location }) }}
      </dd>
      <dt class="text-rui-text-secondary">
        {{ t('step_convert.in_preview') }}
      </dt>
      <dd class="m-0">
        {{ expectation }}
      </dd>
    </dl>

    <p
      v-if="isLarge && state !== ConversionState.done"
      class="flex gap-2 text-sm text-rui-text-secondary"
      data-testid="large-file-note"
    >
      <RuiIcon
        name="lu-info"
        size="16"
        class="mt-0.5 shrink-0"
      />
      {{ t('step_convert.large_file') }}
    </p>

    <RuiTextField
      v-model="recipe.name"
      :label="t('step_convert.name.label')"
      dense
      :hint="t('step_convert.name.hint', { name: names.output })"
      data-testid="output-name"
    />

    <div
      v-if="state !== ConversionState.done"
      class="flex flex-wrap gap-3"
    >
      <RuiButton
        color="primary"
        :disabled="state === ConversionState.running"
        data-testid="start-conversion"
        @click="convert()"
      >
        {{ startLabel }}
      </RuiButton>
      <RuiButton
        v-if="state === ConversionState.running"
        variant="outlined"
        @click="cancel()"
      >
        {{ t('step_convert.cancel') }}
      </RuiButton>
    </div>

    <div
      v-if="state === ConversionState.running && stats"
      class="flex flex-col gap-2"
    >
      <RuiProgress
        :value="progress"
        color="primary"
        show-label
        :aria-label="t('step_convert.progress.label')"
      />
      <p class="text-sm text-rui-text-secondary">
        {{ t('step_convert.progress.status', {
          read: formatSize(stats.bytesRead),
          total: formatSize(stats.totalBytes),
          converted: number.format(stats.converted),
          rejected: number.format(stats.rejected),
        }) }}
      </p>
    </div>

    <RuiAlert
      v-if="state === ConversionState.failed"
      type="error"
      :title="t('step_convert.failed_title')"
    >
      <ul class="list-disc pl-4">
        <li
          v-for="problem in problems"
          :key="messageKey(problem)"
        >
          {{ translate(problem) }}
        </li>
      </ul>
    </RuiAlert>

    <section
      v-if="state === ConversionState.done && stats && output"
      class="flex flex-col gap-4"
      data-testid="conversion-result"
    >
      <RuiAlert
        :type="stats.rejected > 0 ? 'warning' : 'success'"
        :title="t('step_convert.result.title', { count: number.format(stats.converted) }, stats.converted)"
        :description="t('step_convert.result.description', { skipped: number.format(stats.skipped), rejected: number.format(stats.rejected) })"
      />
      <div class="flex flex-wrap gap-3">
        <RuiButton
          tag="a"
          :href="output.url"
          :download="output.name"
          color="primary"
          data-testid="download-output"
        >
          <template #prepend>
            <RuiIcon
              name="lu-download"
              size="16"
            />
          </template>
          {{ t('common.name_and_size', { name: output.name, size: formatSize(output.size) }) }}
        </RuiButton>
        <RuiButton
          v-if="rejected"
          tag="a"
          :href="rejected.url"
          :download="rejected.name"
          variant="outlined"
          data-testid="download-rejected"
        >
          <template #prepend>
            <RuiIcon
              name="lu-download"
              size="16"
            />
          </template>
          {{ t('step_convert.rejected_download', { size: formatSize(rejected.size) }) }}
        </RuiButton>
      </div>
      <i18n-t
        keypath="step_convert.import_help"
        tag="p"
        scope="global"
        class="text-sm text-rui-text-secondary"
      >
        <template #import_data>
          <span class="font-medium text-rui-text">{{ t('step_convert.import_menu.import_data') }}</span>
        </template>
        <template #custom_import>
          <span class="font-medium text-rui-text">{{ t('step_convert.import_menu.custom_import') }}</span>
        </template>
        <template #import_format>
          <span class="font-medium text-rui-text">{{ t('step_convert.import_menu.import_format', { format: recipe.format }) }}</span>
        </template>
      </i18n-t>
      <p class="text-sm text-rui-text-secondary">
        {{ t('step_convert.recipe_note') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <RuiButton
          variant="outlined"
          data-testid="save-recipe"
          @click="downloadRecipe()"
        >
          <template #prepend>
            <RuiIcon
              name="lu-save"
              size="16"
            />
          </template>
          {{ t('step_convert.save_recipe') }}
        </RuiButton>
        <RuiButton
          variant="text"
          data-testid="start-conversion"
          @click="convert()"
        >
          {{ t('step_convert.start.done') }}
        </RuiButton>
        <RuiButton
          variant="text"
          color="primary"
          data-testid="convert-another"
          @click="convertAnother()"
        >
          <template #prepend>
            <RuiIcon
              name="lu-rotate-ccw"
              size="16"
            />
          </template>
          {{ t('step_convert.convert_another') }}
        </RuiButton>
      </div>
    </section>

    <div
      v-if="state !== ConversionState.done"
      class="text-sm text-rui-text-secondary"
    >
      <RuiButton
        variant="text"
        size="sm"
        data-testid="save-recipe"
        @click="downloadRecipe()"
      >
        <template #prepend>
          <RuiIcon
            name="lu-save"
            size="16"
          />
        </template>
        {{ t('step_convert.save_recipe_only') }}
      </RuiButton>
    </div>
  </div>
</template>
