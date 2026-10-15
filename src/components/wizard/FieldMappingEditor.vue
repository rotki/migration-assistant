<script setup lang="ts">
import { RuiCheckbox, RuiIcon, RuiMenuSelect, RuiTextField } from '@rotki/ui-library';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { AMOUNT_COLUMNS, type FieldMapping, isRequiredColumn, mappedValue, SourceKind, splitValue, type ValueSource } from '@/modules/convert/recipe';
import { guessEventTypes, guessSeparator } from '@/modules/convert/suggest';
import { DEFAULT_LOCATION, ROTKI_EVENT_TYPES, ROTKI_LOCATIONS, RotkiColumn } from '@/modules/rotki-format';
import { ValueMapMode } from '@/modules/wizard/types';
import { useWizard } from '@/modules/wizard/use-wizard';
import ValueMapEditor from './ValueMapEditor.vue';

interface Example {
  raw: string;
  result: string;
}

const { column } = defineProps<{ column: RotkiColumn }>();

const { t } = useI18n({ useScope: 'global' });
const { columnSamples, header, recipe } = useWizard();

const EMPTY = '__empty__';
const CONSTANT = '__constant__';
const COLUMN_PREFIX = 'column:';

const help = computed<string>(() => {
  const texts: Record<RotkiColumn, string> = {
    [RotkiColumn.location]: t('field_mapping.help.location'),
    [RotkiColumn.spendCurrency]: t('field_mapping.help.spend_currency'),
    [RotkiColumn.spendAmount]: t('field_mapping.help.spend_amount'),
    [RotkiColumn.receiveCurrency]: t('field_mapping.help.receive_currency'),
    [RotkiColumn.receiveAmount]: t('field_mapping.help.receive_amount'),
    [RotkiColumn.fee]: t('field_mapping.help.fee'),
    [RotkiColumn.feeCurrency]: t('field_mapping.help.fee_currency'),
    [RotkiColumn.description]: t('field_mapping.help.description'),
    [RotkiColumn.timestamp]: t('field_mapping.help.timestamp'),
    [RotkiColumn.type]: t('field_mapping.help.type'),
    [RotkiColumn.currency]: t('field_mapping.help.currency'),
    [RotkiColumn.amount]: t('field_mapping.help.amount'),
  };
  return texts[column];
});

const mapping = computed<FieldMapping>({
  get: () => recipe.value.fields[column] ?? { source: { kind: SourceKind.empty } },
  set: (value) => {
    recipe.value.fields[column] = value;
  },
});

const required = computed<boolean>(() => isRequiredColumn(recipe.value.format, column));
const isAmount = AMOUNT_COLUMNS.has(column);
const isCurrency = column.includes('Currency');

const sourceOptions = computed<{ id: string; label: string }[]>(() => [
  ...header.value.map(name => ({ id: `${COLUMN_PREFIX}${name}`, label: name })),
  { id: CONSTANT, label: t('field_mapping.source.constant') },
  ...(required.value ? [] : [{ id: EMPTY, label: t('field_mapping.source.empty') }]),
]);

const sourceId = computed<string>({
  get: () => {
    const { source } = mapping.value;
    if (source.kind === SourceKind.column)
      return `${COLUMN_PREFIX}${source.column}`;
    return source.kind === SourceKind.constant ? CONSTANT : EMPTY;
  },
  set: (id) => {
    let source: ValueSource = { kind: SourceKind.empty };
    if (id === CONSTANT)
      source = { kind: SourceKind.constant, value: column === RotkiColumn.location ? DEFAULT_LOCATION : '' };
    else if (id.startsWith(COLUMN_PREFIX))
      source = { kind: SourceKind.column, column: id.slice(COLUMN_PREFIX.length) };
    mapping.value = { source, absolute: mapping.value.absolute };
    if (column === RotkiColumn.type && source.kind === SourceKind.column)
      guessTypes();
  },
});

const rawSamples = computed<string[]>(() => {
  const { source } = mapping.value;
  return source.kind === SourceKind.column ? columnSamples(source.column) : [];
});

/** Sample values after the split, as the converter sees them. */
const samples = computed<string[]>(() => rawSamples.value.map(value => splitValue(value, mapping.value.split)));

/**
 * A few distinct sample values with what the mapping turns each into. Each is split as written
 * and then trimmed, as the converter does.
 */
const examples = computed<Example[]>(() => {
  const raws = [...new Map(rawSamples.value.map(value => [value.trim(), value])).entries()].slice(0, 3);
  const { split, values } = mapping.value;
  return raws.map(([raw, written]) => {
    const part = splitValue(written, split).trim();
    return { raw, result: mappedValue(values, part) ?? part };
  });
});

const exampleText = computed<string>(() => examples.value
  .map(({ raw, result }) => (result === raw ? raw : t('field_mapping.example_mapped', { raw, result: result || t('common.empty_value') })))
  .join(', '));

const NUMBER_LIKE = /^[+-]?[\d.,\s']+$/;

/** A space only separates parts in amounts such as `0.5 BTC`; in labels and notes it is just a space. */
const SPLIT_SEPARATORS = isAmount ? ['/', '-', '_', ':', ' '] : ['/', '-', '_', ':'];

/** Splitting only makes sense for values made of parts, such as a pair; not for dates or plain numbers. */
const canSplit = computed<boolean>(() => {
  if (mapping.value.split)
    return true;
  if (column === RotkiColumn.timestamp)
    return false;
  const candidates = rawSamples.value.slice(0, 100).filter(value => !NUMBER_LIKE.test(value.trim()));
  return candidates.length > 0 && guessSeparator(candidates, SPLIT_SEPARATORS) !== undefined;
});

const splitEnabled = computed<boolean>({
  get: () => !!mapping.value.split,
  set: (enabled) => {
    const next = { ...mapping.value };
    if (enabled)
      next.split = { separator: guessSeparator(rawSamples.value.slice(0, 100), SPLIT_SEPARATORS) ?? '/', part: 0 };
    else
      delete next.split;
    mapping.value = next;
  },
});

const partOptions = computed<{ id: number; label: string }[]>(() => {
  const separator = mapping.value.split?.separator ?? '';
  const parts = separator ? (rawSamples.value[0] ?? '').split(separator) : [];
  const options = parts.map((part, index) => ({
    id: index,
    label: t('field_mapping.part_with_value', { number: index + 1, part: part || t('common.empty_value') }),
  }));
  if (parts.length > 1)
    options.push({ id: -1, label: t('field_mapping.last_part', { part: parts.at(-1) ?? '' }) });
  return options.length > 0 ? options : [{ id: 0, label: t('field_mapping.part', { number: 1 }) }];
});

const valueMap = computed<Record<string, string>>({
  get: () => mapping.value.values ?? {},
  set: (values) => {
    mapping.value = { ...mapping.value, values };
  },
});

const renameEnabled = computed<boolean>({
  get: () => mapping.value.values !== undefined,
  set: (enabled) => {
    const next = { ...mapping.value };
    if (enabled)
      next.values = {};
    else
      delete next.values;
    mapping.value = next;
  },
});

function guessTypes(): void {
  mapping.value = { ...mapping.value, values: guessEventTypes(samples.value, mapping.value.values) };
}

/** Other fields that split the same source column, as the three currencies of a trading pair do. */
function siblingSplits(): FieldMapping[] {
  const { source } = mapping.value;
  if (source.kind !== SourceKind.column)
    return [];
  return Object.entries(recipe.value.fields).flatMap(([other, sibling]) =>
    other !== column && sibling.split && sibling.source.kind === SourceKind.column && sibling.source.column === source.column ? [sibling] : []);
}

function updateSplit(change: Partial<NonNullable<FieldMapping['split']>>): void {
  const split = mapping.value.split ?? { separator: '/', part: 0 };
  mapping.value = { ...mapping.value, split: { ...split, ...change } };
  // A pair has one separator: keep the other fields that split the same column in step.
  if (change.separator !== undefined) {
    for (const sibling of siblingSplits()) {
      if (sibling.split)
        sibling.split.separator = change.separator;
    }
  }
}

const isExternal = computed<boolean>(() => mapping.value.source.kind === SourceKind.constant && mapping.value.source.value === DEFAULT_LOCATION);

const constantValue = computed<string>({
  get: () => (mapping.value.source.kind === SourceKind.constant ? mapping.value.source.value : ''),
  set: (value) => {
    mapping.value = { ...mapping.value, source: { kind: SourceKind.constant, value } };
  },
});

const locationOptions = ROTKI_LOCATIONS.map(id => ({ id, label: id }));
const typeOptions = ROTKI_EVENT_TYPES.map(id => ({ id, label: id }));
</script>

<template>
  <div
    class="flex flex-col gap-3 py-4 border-b border-rui-divider last:border-b-0"
    :data-testid="`field-${column}`"
  >
    <div class="grid grid-cols-1 md:grid-cols-[13rem_1fr] gap-x-6 gap-y-2">
      <div>
        <div class="flex items-baseline gap-2">
          <span class="font-medium">{{ column }}</span>
          <span
            v-if="!required"
            class="text-xs text-rui-text-secondary"
          >
            {{ t('field_mapping.optional') }}
          </span>
        </div>
        <p class="text-sm text-rui-text-secondary mt-1">
          {{ help }}
        </p>
      </div>

      <div class="flex flex-col gap-3 min-w-0">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RuiMenuSelect
            v-model="sourceId"
            :options="sourceOptions"
            key-attr="id"
            text-attr="label"
            dense
            hide-details
            label-placement="hidden"
            :label="t('field_mapping.source.label', { column })"
          />
          <template v-if="mapping.source.kind === SourceKind.constant">
            <RuiMenuSelect
              v-if="column === RotkiColumn.location"
              v-model="constantValue"
              :options="locationOptions"
              key-attr="id"
              text-attr="label"
              dense
              hide-details
              label-placement="hidden"
              :label="column"
            />
            <RuiMenuSelect
              v-else-if="column === RotkiColumn.type"
              v-model="constantValue"
              :options="typeOptions"
              key-attr="id"
              text-attr="label"
              dense
              hide-details
              label-placement="hidden"
              :label="column"
            />
            <RuiTextField
              v-else
              v-model="constantValue"
              dense
              hide-details
              label-placement="hidden"
              :label="t('field_mapping.fixed_label', { column })"
              :placeholder="t('field_mapping.fixed_placeholder')"
            />
          </template>
          <p
            v-else-if="mapping.source.kind === SourceKind.column && column !== RotkiColumn.type"
            class="text-sm text-rui-text-secondary self-center truncate"
          >
            <i18n-t
              v-if="exampleText"
              keypath="field_mapping.example"
              scope="global"
            >
              <template #example>
                <span class="font-mono text-rui-text">{{ exampleText }}</span>
              </template>
            </i18n-t>
            <template v-else>
              {{ t('field_mapping.empty_in_sample') }}
            </template>
          </p>
        </div>

        <p
          v-if="column === RotkiColumn.location && isExternal"
          class="flex gap-2 text-sm text-rui-text-secondary"
          data-testid="location-external"
        >
          <RuiIcon
            name="lu-info"
            size="16"
            class="mt-0.5 shrink-0"
          />
          {{ t('field_mapping.location_external') }}
        </p>

        <template v-if="mapping.source.kind === SourceKind.column">
          <div
            v-if="canSplit || isAmount || isCurrency"
            class="flex flex-wrap items-center gap-x-6 gap-y-2"
          >
            <RuiCheckbox
              v-if="canSplit"
              v-model="splitEnabled"
              size="sm"
              hide-details
              :label="t('field_mapping.split')"
            />
            <RuiCheckbox
              v-if="isAmount"
              :model-value="!!mapping.absolute"
              size="sm"
              hide-details
              :label="t('field_mapping.absolute')"
              @update:model-value="mapping = { ...mapping, absolute: $event || undefined }"
            />
            <RuiCheckbox
              v-if="isCurrency"
              v-model="renameEnabled"
              size="sm"
              hide-details
              :label="t('field_mapping.rename')"
            />
          </div>

          <div
            v-if="mapping.split"
            class="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <RuiTextField
              :model-value="mapping.split.separator"
              dense
              hide-details
              :label="t('field_mapping.separator')"
              @update:model-value="updateSplit({ separator: $event })"
            />
            <RuiMenuSelect
              :model-value="mapping.split.part"
              :options="partOptions"
              key-attr="id"
              text-attr="label"
              dense
              hide-details
              :label="t('field_mapping.part_to_keep')"
              @update:model-value="updateSplit({ part: $event ?? 0 })"
            />
          </div>

          <ValueMapEditor
            v-if="column === RotkiColumn.type"
            v-model="valueMap"
            :values="samples"
            :mode="ValueMapMode.type"
          />
          <ValueMapEditor
            v-else-if="isCurrency && mapping.values"
            v-model="valueMap"
            :values="samples"
            :mode="ValueMapMode.rename"
          />
        </template>
      </div>
    </div>
  </div>
</template>
