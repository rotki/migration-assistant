<script setup lang="ts">
import { RuiMenuSelect, RuiTextField } from '@rotki/ui-library';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SKIP_ROW } from '@/modules/convert/recipe';
import { distinctValues } from '@/modules/convert/suggest';
import { ROTKI_EVENT_TYPES } from '@/modules/rotki-format';
import { ValueMapMode } from '@/modules/wizard/types';

const model = defineModel<Record<string, string>>({ required: true });

const { values: samples, mode } = defineProps<{
  /** The values found in the sample, after any split. */
  values: string[];
  mode: ValueMapMode;
}>();

const { t } = useI18n({ useScope: 'global' });

const KEEP = '__keep__';

const typeOptions = computed<{ id: string; label: string }[]>(() => [
  ...ROTKI_EVENT_TYPES.map(type => ({ id: type, label: type })),
  { id: SKIP_ROW, label: t('value_map.skip') },
  { id: KEEP, label: t('value_map.not_mapped') },
]);

const entries = computed<{ value: string; count: number }[]>(() => distinctValues(samples).filter(entry => entry.value !== ''));

function current(value: string): string {
  if (mode === ValueMapMode.type)
    return model.value[value] ?? KEEP;
  return model.value[value] ?? '';
}

function isUnmapped(value: string): boolean {
  return mode === ValueMapMode.type && !model.value[value];
}

/** Values whose rows would be rejected, with how many rows of the sample that is. */
const unmapped = computed<{ values: number; rows: number }>(() => {
  const open = entries.value.filter(entry => isUnmapped(entry.value));
  return { values: open.length, rows: open.reduce((sum, entry) => sum + entry.count, 0) };
});

function update(value: string, next: string | undefined): void {
  const values = { ...model.value };
  if (!next || next === KEEP)
    delete values[value];
  else
    values[value] = next;
  model.value = values;
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p
      v-if="entries.length === 0"
      class="text-sm text-rui-text-secondary"
    >
      {{ t('value_map.empty') }}
    </p>
    <p
      v-if="unmapped.values > 0"
      class="rounded-md bg-rui-warning-subtle px-3 py-2 text-sm text-rui-text"
      data-testid="value-map-unmapped"
    >
      {{ t('value_map.unmapped', { values: t('value_map.unmapped_values', unmapped.values), rows: t('common.rows', unmapped.rows) }) }}
    </p>
    <div
      v-for="entry in entries"
      :key="entry.value"
      class="grid grid-cols-1 sm:grid-cols-2 items-center gap-2 border-l-2 pl-3"
      :class="isUnmapped(entry.value) ? 'border-rui-warning' : 'border-transparent'"
      :data-testid="`value-map-${entry.value}`"
    >
      <span class="flex min-w-0 flex-col text-sm">
        <span class="break-words">{{ entry.value }}</span>
        <span class="text-xs text-rui-text-secondary">{{ t('value_map.in_sample', entry.count) }}</span>
      </span>
      <RuiMenuSelect
        v-if="mode === ValueMapMode.type"
        :model-value="current(entry.value)"
        :options="typeOptions"
        key-attr="id"
        text-attr="label"
        dense
        hide-details
        label-placement="hidden"
        :label="t('value_map.type_label', { value: entry.value })"
        @update:model-value="update(entry.value, $event)"
      />
      <RuiTextField
        v-else
        :model-value="current(entry.value)"
        dense
        hide-details
        label-placement="hidden"
        :label="t('value_map.rename_label', { value: entry.value })"
        :placeholder="t('value_map.keep_placeholder')"
        @update:model-value="update(entry.value, $event)"
      />
    </div>
  </div>
</template>
