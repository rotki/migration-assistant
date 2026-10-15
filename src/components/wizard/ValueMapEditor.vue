<script setup lang="ts">
import { RuiMenuSelect, RuiTextField } from '@rotki/ui-library';
import { computed } from 'vue';
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

const KEEP = '__keep__';

const typeOptions = [
  ...ROTKI_EVENT_TYPES.map(type => ({ id: type, label: type })),
  { id: SKIP_ROW, label: 'Skip these rows' },
  { id: KEEP, label: 'Not mapped (rejected)' },
];

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
      No values in the sample yet.
    </p>
    <p
      v-if="unmapped.values > 0"
      class="rounded-md bg-rui-warning-subtle px-3 py-2 text-sm text-rui-text"
      data-testid="value-map-unmapped"
    >
      {{ unmapped.values }} {{ unmapped.values === 1 ? 'value is' : 'values are' }} not mapped yet, so
      {{ unmapped.rows }} {{ unmapped.rows === 1 ? 'row' : 'rows' }} of the sample would be rejected. Pick a
      type, or skip them if rotki should not import them.
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
        <span class="text-xs text-rui-text-secondary">{{ entry.count }} {{ entry.count === 1 ? 'row' : 'rows' }} in the sample</span>
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
        :label="`rotki type for ${entry.value}`"
        @update:model-value="update(entry.value, $event)"
      />
      <RuiTextField
        v-else
        :model-value="current(entry.value)"
        dense
        hide-details
        label-placement="hidden"
        :label="`Rename ${entry.value}`"
        placeholder="Keep as is"
        @update:model-value="update(entry.value, $event)"
      />
    </div>
  </div>
</template>
