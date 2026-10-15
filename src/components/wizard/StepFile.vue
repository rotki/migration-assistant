<script setup lang="ts">
import { RuiAlert, RuiButton, RuiFileUpload, RuiIcon, RuiMenuSelect } from '@rotki/ui-library';
import { computed, ref, useTemplateRef, watch } from 'vue';
import { parseRecipe } from '@/modules/convert/recipe';
import { DELIMITERS, ENCODINGS } from '@/modules/csv/sniff';
import { useWizard } from '@/modules/wizard/use-wizard';
import RawRecordsTable from './RawRecordsTable.vue';

const PREVIEW_RECORDS = 12;

const { file, isWholeFile, records, recipe, applyRecipe, loadFile, restart } = useWizard();

const selected = ref<File>();
const recipeError = ref('');
const recipeInput = useTemplateRef<HTMLInputElement>('recipeInput');

const encodingOptions = ENCODINGS.map(id => ({ id, label: id.toUpperCase() }));
const delimiterOptions = DELIMITERS.map(id => ({
  id,
  label: { ',': 'Comma (,)', ';': 'Semicolon (;)', '\t': 'Tab', '|': 'Pipe (|)' }[id],
}));

const previewRecords = computed<string[][]>(() => records.value.slice(0, recipe.value.input.headerIndex + PREVIEW_RECORDS));

const showSettings = ref(false);

const encodingLabel = computed<string>(() => encodingOptions.find(option => option.id === recipe.value.input.encoding)?.label ?? '');
const delimiterLabel = computed<string>(() => ({ ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' })[recipe.value.input.delimiter]);

const sizeLabel = computed<string>(() => {
  const size = file.value?.size ?? 0;
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
});

// Removing the file from the upload field starts the wizard over.
watch(selected, async (value) => {
  if (value)
    await loadFile(value);
  else if (file.value)
    restart();
});

// A restart from the last step empties the upload field.
watch(file, (value) => {
  if (!value)
    selected.value = undefined;
});

async function loadRecipe(event: Event): Promise<void> {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.files?.[0])
    return;
  const saved = parseRecipe(await input.files[0].text());
  input.value = '';
  if (!saved.ok) {
    recipeError.value = saved.error;
    return;
  }
  recipeError.value = '';
  applyRecipe(saved.value);
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <RuiFileUpload
      v-model="selected"
      accept=".csv,.tsv,.txt,text/csv"
      hide-details
      data-testid="csv-file"
    />

    <div
      v-if="!file"
      class="flex flex-col gap-2 text-sm text-rui-text-secondary"
      data-testid="file-help"
    >
      <p>
        Most exchanges put the export under <span class="font-medium text-rui-text">Transaction history</span>,
        <span class="font-medium text-rui-text">Statements</span> or <span class="font-medium text-rui-text">Reports</span>,
        as CSV. Pick the full history if the exchange offers a choice.
      </p>
      <p>
        Any CSV works: the next steps detect its layout and let you say what each column holds.
      </p>
    </div>

    <template v-if="file">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p
          class="text-sm text-rui-text-secondary"
          data-testid="detected-settings"
        >
          Detected <span class="font-medium text-rui-text">{{ encodingLabel }}</span>,
          <span class="font-medium text-rui-text">{{ delimiterLabel }}</span> separated, column names on
          <span class="font-medium text-rui-text">row {{ recipe.input.headerIndex + 1 }}</span>.
          <button
            type="button"
            class="text-rui-link underline underline-offset-2"
            :aria-expanded="showSettings"
            data-testid="change-settings"
            @click="showSettings = !showSettings"
          >
            {{ showSettings ? 'Hide' : 'Change' }}
          </button>
        </p>
        <div class="flex items-center gap-2">
          <input
            ref="recipeInput"
            type="file"
            accept=".json,application/json"
            class="hidden"
            data-testid="recipe-file"
            @change="loadRecipe($event)"
          />
          <RuiButton
            variant="outlined"
            size="sm"
            @click="recipeInput?.click()"
          >
            <template #prepend>
              <RuiIcon
                name="lu-upload"
                size="16"
              />
            </template>
            Use a saved recipe
          </RuiButton>
        </div>
      </div>

      <RuiAlert
        v-if="recipeError"
        type="error"
        :description="recipeError"
      />

      <div
        v-if="showSettings"
        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <RuiMenuSelect
          v-model="recipe.input.encoding"
          :options="encodingOptions"
          key-attr="id"
          text-attr="label"
          label="Encoding"
          hint="Change it if letters such as ü or é look garbled."
        />
        <RuiMenuSelect
          v-model="recipe.input.delimiter"
          :options="delimiterOptions"
          key-attr="id"
          text-attr="label"
          label="Delimiter"
          hint="The character between the columns."
        />
      </div>

      <section class="flex flex-col gap-2">
        <h2 class="font-semibold">
          Your file
        </h2>
        <p class="text-sm text-rui-text-secondary">
          The highlighted row holds the column names. If the exchange wrote other lines above
          them, click the right row.
          <template v-if="!isWholeFile">
            Settings and previews use the first {{ records.length }} records of {{ sizeLabel }}.
          </template>
        </p>
        <RawRecordsTable
          v-model:header-index="recipe.input.headerIndex"
          :records="previewRecords"
        />
      </section>
    </template>
  </div>
</template>
