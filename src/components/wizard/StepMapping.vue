<script setup lang="ts">
import { RuiCheckbox, RuiMenuSelect } from '@rotki/ui-library';
import { computed } from 'vue';
import { distinctValues } from '@/modules/convert/suggest';
import { RotkiColumn, RotkiFormat } from '@/modules/rotki-format';
import { useWizard } from '@/modules/wizard/use-wizard';
import FieldMappingEditor from './FieldMappingEditor.vue';

interface FieldGroup {
  title: string;
  columns: RotkiColumn[];
}

const { columnSamples, header, recipe } = useWizard();

/** Every rotki column of a format, in sections that read as the record they describe. */
const GROUPS: Record<RotkiFormat, FieldGroup[]> = {
  [RotkiFormat.trades]: [
    { title: 'Spent', columns: [RotkiColumn.spendCurrency, RotkiColumn.spendAmount] },
    { title: 'Received', columns: [RotkiColumn.receiveCurrency, RotkiColumn.receiveAmount] },
    { title: 'Fee', columns: [RotkiColumn.fee, RotkiColumn.feeCurrency] },
    { title: 'When and where', columns: [RotkiColumn.timestamp, RotkiColumn.location] },
    { title: 'Note', columns: [RotkiColumn.description] },
  ],
  [RotkiFormat.events]: [
    { title: 'What happened', columns: [RotkiColumn.type] },
    { title: 'Asset and amount', columns: [RotkiColumn.currency, RotkiColumn.amount] },
    { title: 'Fee', columns: [RotkiColumn.fee, RotkiColumn.feeCurrency] },
    { title: 'When and where', columns: [RotkiColumn.timestamp, RotkiColumn.location] },
    { title: 'Note', columns: [RotkiColumn.description] },
  ],
};

const groups = computed<FieldGroup[]>(() => GROUPS[recipe.value.format]);
const isTrades = computed<boolean>(() => recipe.value.format === RotkiFormat.trades);

const swapEnabled = computed<boolean>({
  get: () => !!recipe.value.swap,
  set: (enabled) => {
    if (enabled)
      setSwapColumn(guessSideColumn());
    else
      delete recipe.value.swap;
  },
});

function guessSideColumn(): string {
  return header.value.find(name => /side|type|direction|buy|sell/i.test(name)) ?? header.value[0] ?? '';
}

const columnOptions = computed(() => header.value.map(name => ({ id: name, label: name })));

const swapCandidates = computed<{ value: string; count: number }[]>(() => {
  const column = recipe.value.swap?.column;
  return column ? distinctValues(columnSamples(column), 20) : [];
});

function toggleSwapValue(value: string, enabled: boolean): void {
  const swap = recipe.value.swap;
  if (!swap)
    return;
  swap.values = enabled ? [...swap.values, value] : swap.values.filter(item => item !== value);
}

function setSwapColumn(column: string | undefined): void {
  if (!column)
    return;
  const sells = distinctValues(columnSamples(column), 20)
    .map(entry => entry.value)
    .filter(value => /sell|ask|short/i.test(value));
  recipe.value.swap = { column, values: sells };
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="text-sm text-rui-text-secondary -mt-2">
      Columns are matched by name, so a saved recipe still works when the exchange moves them
      around.
    </p>

    <template
      v-for="group in groups"
      :key="`${recipe.format}-${group.title}`"
    >
      <section
        class="rounded-md border border-rui-divider px-4"
        :aria-label="group.title"
      >
        <h2 class="pt-4 text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
          {{ group.title }}
        </h2>
        <FieldMappingEditor
          v-for="column in group.columns"
          :key="`${recipe.format}-${column}`"
          :column="column"
        />
      </section>

      <section
        v-if="isTrades && group.title === 'Received'"
        class="flex flex-col gap-3 rounded-md border border-rui-divider p-4"
        aria-label="Buys and sells"
        data-testid="swap-section"
      >
        <h2 class="text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
          Buys and sells
        </h2>
        <RuiCheckbox
          v-model="swapEnabled"
          hide-details
          label="Some rows are sells"
        />
        <p class="text-sm text-rui-text-secondary -mt-2">
          Map the columns above as they read for a buy. On a sell, what was spent and what was
          received are swapped.
        </p>
        <div
          v-if="recipe.swap"
          class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start"
        >
          <RuiMenuSelect
            :model-value="recipe.swap.column"
            :options="columnOptions"
            key-attr="id"
            text-attr="label"
            dense
            label="Sells are the rows where"
            @update:model-value="setSwapColumn($event)"
          />
          <fieldset class="flex flex-col gap-1">
            <legend class="mb-1 text-sm font-medium">
              is one of
            </legend>
            <RuiCheckbox
              v-for="candidate in swapCandidates"
              :key="candidate.value"
              :model-value="recipe.swap.values.includes(candidate.value)"
              size="sm"
              hide-details
              :label="`${candidate.value || '(empty)'} · ${candidate.count} ${candidate.count === 1 ? 'row' : 'rows'}`"
              @update:model-value="toggleSwapValue(candidate.value, !!$event)"
            />
          </fieldset>
        </div>
      </section>
    </template>
  </div>
</template>
