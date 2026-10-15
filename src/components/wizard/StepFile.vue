<script setup lang="ts">
import type { Message } from '@/modules/convert/messages';
import { RuiAlert, RuiButton, RuiFileUpload, RuiIcon, RuiMenuSelect } from '@rotki/ui-library';
import { computed, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { findNativeImporter, ImporterSection, type NativeImporter } from '@/modules/convert/native-importers';
import { parseRecipe } from '@/modules/convert/recipe';
import { useMessages } from '@/modules/convert/use-messages';
import { type Delimiter, DELIMITERS, ENCODINGS } from '@/modules/csv/sniff';
import { useWizard } from '@/modules/wizard/use-wizard';
import RawRecordsTable from './RawRecordsTable.vue';

const PREVIEW_RECORDS = 12;

const { t } = useI18n({ useScope: 'global' });
const { translate } = useMessages();
const { file, header, isWholeFile, records, recipe, applyRecipe, loadFile, restart } = useWizard();

const selected = ref<File>();
const recipeError = ref<Message>();
const recipeInput = useTemplateRef<HTMLInputElement>('recipeInput');

const encodingOptions = ENCODINGS.map(id => ({ id, label: id.toUpperCase() }));

const delimiterOptions = computed(() => {
  const labels: Record<Delimiter, string> = {
    ',': t('step_file.delimiter.options.comma'),
    ';': t('step_file.delimiter.options.semicolon'),
    '\t': t('step_file.delimiter.options.tab'),
    '|': t('step_file.delimiter.options.pipe'),
  };
  return DELIMITERS.map(id => ({ id, label: labels[id] }));
});

const previewRecords = computed<string[][]>(() => records.value.slice(0, recipe.value.input.headerIndex + PREVIEW_RECORDS));

const showSettings = ref(false);

const encodingLabel = computed<string>(() => encodingOptions.find(option => option.id === recipe.value.input.encoding)?.label ?? '');

const delimiterLabel = computed<string>(() => {
  const names: Record<Delimiter, string> = {
    ',': t('step_file.delimiter.names.comma'),
    ';': t('step_file.delimiter.names.semicolon'),
    '\t': t('step_file.delimiter.names.tab'),
    '|': t('step_file.delimiter.names.pipe'),
  };
  return names[recipe.value.input.delimiter];
});

const nativeImporter = computed<NativeImporter | undefined>(() => findNativeImporter(header.value, recipe.value.input.headerIndex));

/** Where the importer sits in rotki, as `Import Data → Custom Import → Import events`. */
const importerLocation = computed<string>(() => {
  const importer = nativeImporter.value;
  if (!importer)
    return '';
  const sections: Record<ImporterSection, string> = {
    [ImporterSection.events]: t('step_file.native_importer.sections.events'),
    [ImporterSection.trades]: t('step_file.native_importer.sections.trades'),
    [ImporterSection.transactions]: t('step_file.native_importer.sections.transactions'),
  };
  const section = importer.section && sections[importer.section];
  return [t('step_file.native_importer.import_data'), importer.name, section].filter(Boolean).join(' → ');
});

const sizeLabel = computed<string>(() => {
  const size = file.value?.size ?? 0;
  if (size < 1024 * 1024)
    return t('common.size.kb', { size: (size / 1024).toFixed(1) });
  return t('common.size.mb', { size: (size / 1024 / 1024).toFixed(1) });
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
  recipeError.value = undefined;
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
      <i18n-t
        keypath="step_file.help.where"
        tag="p"
        scope="global"
      >
        <template #history>
          <span class="font-medium text-rui-text">{{ t('step_file.help.transaction_history') }}</span>
        </template>
        <template #statements>
          <span class="font-medium text-rui-text">{{ t('step_file.help.statements') }}</span>
        </template>
        <template #reports>
          <span class="font-medium text-rui-text">{{ t('step_file.help.reports') }}</span>
        </template>
      </i18n-t>
      <p>
        {{ t('step_file.help.any_csv') }}
      </p>
    </div>

    <template v-if="file">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p
          class="text-sm text-rui-text-secondary"
          data-testid="detected-settings"
        >
          <i18n-t
            keypath="step_file.detected"
            scope="global"
          >
            <template #encoding>
              <span class="font-medium text-rui-text">{{ encodingLabel }}</span>
            </template>
            <template #delimiter>
              <span class="font-medium text-rui-text">{{ delimiterLabel }}</span>
            </template>
            <template #row>
              <span class="font-medium text-rui-text">{{ t('step_file.detected_row', { number: recipe.input.headerIndex + 1 }) }}</span>
            </template>
          </i18n-t>
          <button
            type="button"
            class="ml-1 text-rui-link underline underline-offset-2"
            :aria-expanded="showSettings"
            data-testid="change-settings"
            @click="showSettings = !showSettings"
          >
            {{ showSettings ? t('step_file.settings.hide') : t('step_file.settings.change') }}
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
            {{ t('step_file.use_recipe') }}
          </RuiButton>
        </div>
      </div>

      <RuiAlert
        v-if="recipeError"
        type="error"
        :description="translate(recipeError)"
      />

      <RuiAlert
        v-if="nativeImporter"
        type="info"
        :title="t('step_file.native_importer.title')"
        data-testid="native-importer"
      >
        <i18n-t
          keypath="step_file.native_importer.body"
          tag="span"
          scope="global"
        >
          <template #importer>
            {{ nativeImporter.name }}
          </template>
          <template #location>
            <span class="font-medium">{{ importerLocation }}</span>
          </template>
        </i18n-t>
      </RuiAlert>

      <div
        v-if="showSettings"
        class="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <RuiMenuSelect
          v-model="recipe.input.encoding"
          :options="encodingOptions"
          key-attr="id"
          text-attr="label"
          :label="t('step_file.encoding.label')"
          :hint="t('step_file.encoding.hint')"
        />
        <RuiMenuSelect
          v-model="recipe.input.delimiter"
          :options="delimiterOptions"
          key-attr="id"
          text-attr="label"
          :label="t('step_file.delimiter.label')"
          :hint="t('step_file.delimiter.hint')"
        />
      </div>

      <section class="flex flex-col gap-2">
        <h2 class="font-semibold">
          {{ t('step_file.your_file.title') }}
        </h2>
        <p class="text-sm text-rui-text-secondary">
          {{ t('step_file.your_file.description') }}
          <template v-if="!isWholeFile">
            {{ t('step_file.your_file.partial', { count: records.length, size: sizeLabel }, records.length) }}
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
