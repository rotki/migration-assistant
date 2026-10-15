<script setup lang="ts">
import { RuiAlert, RuiButton, RuiIcon, RuiProgress, RuiTextField } from '@rotki/ui-library';
import { computed, onBeforeUnmount, ref } from 'vue';
import { serializeRecipe, SourceKind } from '@/modules/convert/recipe';
import { RowKind } from '@/modules/convert/row-converter';
import { ConversionState, downloadNames, useConversion } from '@/modules/convert/use-conversion';
import { RotkiColumn } from '@/modules/rotki-format';
import { useWizard } from '@/modules/wizard/use-wizard';

const { file, preview, recipe, restart } = useWizard();
const { cancel, output, problems, rejected, reset, start, state, stats } = useConversion();

const recipeUrl = ref<string>();

const number = new Intl.NumberFormat();

const START_LABELS: Record<ConversionState, string> = {
  [ConversionState.idle]: 'Convert the whole file',
  [ConversionState.running]: 'Converting…',
  [ConversionState.done]: 'Convert again',
  [ConversionState.failed]: 'Try again',
};

function formatSize(size: number): string {
  if (size < 1024)
    return `${size} B`;
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const names = computed(() => downloadNames(recipe.value, file.value?.name ?? ''));

/** Private windows keep stored files in memory, which matters from a few hundred MB on. */
const LARGE_FILE = 500 * 1024 * 1024;

const isLarge = computed<boolean>(() => (file.value?.size ?? 0) >= LARGE_FILE);

const location = computed<string>(() => {
  const source = recipe.value.fields[RotkiColumn.location]?.source;
  if (source?.kind === SourceKind.column)
    return `from the ${source.column} column`;
  return source?.kind === SourceKind.constant ? source.value : 'not set';
});

/** What the preview found, as the expectation for the whole file. */
const expectation = computed<string>(() => {
  const rows = preview.value.rows;
  const converted = rows.filter(row => row.result.kind === RowKind.converted).length;
  const rejectedRows = rows.filter(row => row.result.kind === RowKind.rejected).length;
  const skipped = rows.filter(row => row.result.kind === RowKind.skipped).length;
  const parts = [`${converted} of ${rows.length} rows convert`];
  if (rejectedRows > 0)
    parts.push(`${rejectedRows} rejected`);
  if (skipped > 0)
    parts.push(`${skipped} skipped`);
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
    await start(file.value, recipe.value);
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
        File
      </dt>
      <dd class="m-0 break-all">
        {{ file?.name }} · {{ formatSize(file?.size ?? 0) }}
      </dd>
      <dt class="text-rui-text-secondary">
        Becomes
      </dt>
      <dd class="m-0">
        rotki {{ recipe.format }}, location {{ location }}
      </dd>
      <dt class="text-rui-text-secondary">
        In the preview
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
      A large file converts best in a normal window: private windows keep the result in memory
      instead of on disk.
    </p>

    <RuiTextField
      v-model="recipe.name"
      label="Name"
      dense
      :hint="`Downloads as ${names.output}`"
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
        {{ START_LABELS[state] }}
      </RuiButton>
      <RuiButton
        v-if="state === ConversionState.running"
        variant="outlined"
        @click="cancel()"
      >
        Cancel
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
        aria-label="Conversion progress"
      />
      <p class="text-sm text-rui-text-secondary">
        {{ formatSize(stats.bytesRead) }} of {{ formatSize(stats.totalBytes) }} ·
        {{ number.format(stats.converted) }} converted · {{ number.format(stats.rejected) }} rejected
      </p>
    </div>

    <RuiAlert
      v-if="state === ConversionState.failed"
      type="error"
      title="The conversion stopped"
    >
      <ul class="list-disc pl-4">
        <li
          v-for="problem in problems"
          :key="problem"
        >
          {{ problem }}
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
        :title="`${number.format(stats.converted)} rows converted`"
        :description="`${number.format(stats.skipped)} skipped, ${number.format(stats.rejected)} rejected.`"
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
          {{ output.name }} · {{ formatSize(output.size) }}
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
          Rejected rows · {{ formatSize(rejected.size) }}
        </RuiButton>
      </div>
      <p class="text-sm text-rui-text-secondary">
        In rotki, open <span class="font-medium text-rui-text">Import Data</span>, pick
        <span class="font-medium text-rui-text">Custom Import</span>, then
        <span class="font-medium text-rui-text">Import {{ recipe.format }}</span>, and choose the
        downloaded file. The rejected file lists each row with the reason in its last column.
      </p>
      <p class="text-sm text-rui-text-secondary">
        Next time this exchange exports, the saved recipe sets every step up for you.
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
          Save recipe
        </RuiButton>
        <RuiButton
          variant="text"
          data-testid="start-conversion"
          @click="convert()"
        >
          Convert again
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
          Convert another file
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
        Save the recipe without converting
      </RuiButton>
    </div>
  </div>
</template>
