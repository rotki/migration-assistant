<script setup lang="ts">
import { RuiCheckbox, RuiMenuSelect } from '@rotki/ui-library';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { distinctValues } from '@/modules/convert/suggest';
import { RotkiColumn, RotkiFormat } from '@/modules/rotki-format';
import { useWizard } from '@/modules/wizard/use-wizard';
import FieldMappingEditor from './FieldMappingEditor.vue';

const GroupId = {
  spent: 'spent',
  received: 'received',
  fee: 'fee',
  whenAndWhere: 'when_and_where',
  note: 'note',
  whatHappened: 'what_happened',
  assetAndAmount: 'asset_and_amount',
} as const;

type GroupId = (typeof GroupId)[keyof typeof GroupId];

interface FieldGroup {
  id: GroupId;
  columns: RotkiColumn[];
}

const { t } = useI18n({ useScope: 'global' });
const { columnSamples, header, recipe } = useWizard();

/** Every rotki column of a format, in sections that read as the record they describe. */
const GROUPS: Record<RotkiFormat, FieldGroup[]> = {
  [RotkiFormat.trades]: [
    { id: GroupId.spent, columns: [RotkiColumn.spendCurrency, RotkiColumn.spendAmount] },
    { id: GroupId.received, columns: [RotkiColumn.receiveCurrency, RotkiColumn.receiveAmount] },
    { id: GroupId.fee, columns: [RotkiColumn.fee, RotkiColumn.feeCurrency] },
    { id: GroupId.whenAndWhere, columns: [RotkiColumn.timestamp, RotkiColumn.location] },
    { id: GroupId.note, columns: [RotkiColumn.description] },
  ],
  [RotkiFormat.events]: [
    { id: GroupId.whatHappened, columns: [RotkiColumn.type] },
    { id: GroupId.assetAndAmount, columns: [RotkiColumn.currency, RotkiColumn.amount] },
    { id: GroupId.fee, columns: [RotkiColumn.fee, RotkiColumn.feeCurrency] },
    { id: GroupId.whenAndWhere, columns: [RotkiColumn.timestamp, RotkiColumn.location] },
    { id: GroupId.note, columns: [RotkiColumn.description] },
  ],
};

const groupTitles = computed<Record<GroupId, string>>(() => ({
  [GroupId.spent]: t('step_mapping.groups.spent'),
  [GroupId.received]: t('step_mapping.groups.received'),
  [GroupId.fee]: t('step_mapping.groups.fee'),
  [GroupId.whenAndWhere]: t('step_mapping.groups.when_and_where'),
  [GroupId.note]: t('step_mapping.groups.note'),
  [GroupId.whatHappened]: t('step_mapping.groups.what_happened'),
  [GroupId.assetAndAmount]: t('step_mapping.groups.asset_and_amount'),
}));

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
      {{ t('step_mapping.matched_by_name') }}
    </p>

    <template
      v-for="group in groups"
      :key="`${recipe.format}-${group.id}`"
    >
      <section
        class="rounded-md border border-rui-divider px-4"
        :aria-label="groupTitles[group.id]"
      >
        <h2 class="pt-4 text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
          {{ groupTitles[group.id] }}
        </h2>
        <FieldMappingEditor
          v-for="column in group.columns"
          :key="`${recipe.format}-${column}`"
          :column="column"
        />
      </section>

      <section
        v-if="isTrades && group.id === GroupId.received"
        class="flex flex-col gap-3 rounded-md border border-rui-divider p-4"
        :aria-label="t('step_mapping.swap.title')"
        data-testid="swap-section"
      >
        <h2 class="text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
          {{ t('step_mapping.swap.title') }}
        </h2>
        <RuiCheckbox
          v-model="swapEnabled"
          hide-details
          :label="t('step_mapping.swap.enable')"
        />
        <p class="text-sm text-rui-text-secondary -mt-2">
          {{ t('step_mapping.swap.explanation') }}
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
            :label="t('step_mapping.swap.column_label')"
            @update:model-value="setSwapColumn($event)"
          />
          <fieldset class="flex flex-col gap-1">
            <legend class="mb-1 text-sm font-medium">
              {{ t('step_mapping.swap.values_legend') }}
            </legend>
            <RuiCheckbox
              v-for="candidate in swapCandidates"
              :key="candidate.value"
              :model-value="recipe.swap.values.includes(candidate.value)"
              size="sm"
              hide-details
              :label="t('step_mapping.swap.candidate', { value: candidate.value || t('common.empty_value'), rows: t('common.rows', candidate.count) })"
              @update:model-value="toggleSwapValue(candidate.value, !!$event)"
            />
          </fieldset>
        </div>
      </section>
    </template>
  </div>
</template>
