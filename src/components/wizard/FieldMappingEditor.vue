<script setup lang="ts">
import { RuiCheckbox, RuiIcon, RuiMenuSelect, RuiTextField } from '@rotki/ui-library';
import { computed } from 'vue';
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

const { columnSamples, header, recipe } = useWizard();

const EMPTY = '__empty__';
const CONSTANT = '__constant__';
const COLUMN_PREFIX = 'column:';

const HELP: Record<RotkiColumn, string> = {
  [RotkiColumn.location]: 'The exchange or place these rows come from.',
  [RotkiColumn.spendCurrency]: 'The asset given up. On a buy of BTC/EUR, that is EUR.',
  [RotkiColumn.spendAmount]: 'How much of it was given up.',
  [RotkiColumn.receiveCurrency]: 'The asset received. On a buy of BTC/EUR, that is BTC.',
  [RotkiColumn.receiveAmount]: 'How much of it was received.',
  [RotkiColumn.fee]: 'A zero or empty fee is left out.',
  [RotkiColumn.feeCurrency]: 'The asset the fee was paid in. Needed when there is a fee.',
  [RotkiColumn.description]: 'A note shown in rotki, such as an order or transaction id.',
  [RotkiColumn.timestamp]: 'When it happened. The date format is set in the next step.',
  [RotkiColumn.type]: 'What kind of event each row is. Map every value the export uses below.',
  [RotkiColumn.currency]: 'The asset that moved.',
  [RotkiColumn.amount]: 'How much of it moved.',
};

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
  { id: CONSTANT, label: 'A fixed value' },
  ...(required.value ? [] : [{ id: EMPTY, label: 'Leave empty' }]),
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
  .map(({ raw, result }) => (result === raw ? raw : `${raw} → ${result || '(empty)'}`))
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
  const options = parts.map((part, index) => ({ id: index, label: `Part ${index + 1}: ${part || '(empty)'}` }));
  if (parts.length > 1)
    options.push({ id: -1, label: `Last part: ${parts.at(-1) ?? ''}` });
  return options.length > 0 ? options : [{ id: 0, label: 'Part 1' }];
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
            optional
          </span>
        </div>
        <p class="text-sm text-rui-text-secondary mt-1">
          {{ HELP[column] }}
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
            :label="`Source for ${column}`"
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
              label="Location"
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
              label="Type"
            />
            <RuiTextField
              v-else
              v-model="constantValue"
              dense
              hide-details
              label-placement="hidden"
              :label="`Fixed ${column}`"
              placeholder="Value for every row"
            />
          </template>
          <p
            v-else-if="mapping.source.kind === SourceKind.column && column !== RotkiColumn.type"
            class="text-sm text-rui-text-secondary self-center truncate"
          >
            <template v-if="exampleText">
              e.g. <span class="font-mono text-rui-text">{{ exampleText }}</span>
            </template>
            <template v-else>
              Empty in the sample
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
          rotki will list these rows under External. Pick the exchange if it is in the list.
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
              label="Take one part of the value"
            />
            <RuiCheckbox
              v-if="isAmount"
              :model-value="!!mapping.absolute"
              size="sm"
              hide-details
              label="Ignore the sign"
              @update:model-value="mapping = { ...mapping, absolute: $event || undefined }"
            />
            <RuiCheckbox
              v-if="isCurrency"
              v-model="renameEnabled"
              size="sm"
              hide-details
              label="Rename some values"
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
              label="Separator"
              @update:model-value="updateSplit({ separator: $event })"
            />
            <RuiMenuSelect
              :model-value="mapping.split.part"
              :options="partOptions"
              key-attr="id"
              text-attr="label"
              dense
              hide-details
              label="Part to keep"
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
