<script setup lang="ts">
import { RuiCheckbox, RuiMenuSelect } from '@rotki/ui-library';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { type Condition, ConditionKind, meetsAll, RecipeFormat } from '@/modules/convert/recipe';
import { distinctValues } from '@/modules/convert/suggest';
import { RotkiColumn } from '@/modules/rotki-format';
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
  oneSide: 'one_side',
} as const;

type GroupId = (typeof GroupId)[keyof typeof GroupId];

interface FieldGroup {
  id: GroupId;
  columns: RotkiColumn[];
}

const { t } = useI18n({ useScope: 'global' });
const { columnSamples, header, recipe, rows } = useWizard();

/** Every rotki column a recipe maps, in sections that read as the record they describe. */
const GROUPS: Record<RecipeFormat, FieldGroup[]> = {
  [RecipeFormat.both]: [
    { id: GroupId.spent, columns: [RotkiColumn.spendCurrency, RotkiColumn.spendAmount] },
    { id: GroupId.received, columns: [RotkiColumn.receiveCurrency, RotkiColumn.receiveAmount] },
    { id: GroupId.oneSide, columns: [RotkiColumn.type, RotkiColumn.currency, RotkiColumn.amount] },
    { id: GroupId.fee, columns: [RotkiColumn.fee, RotkiColumn.feeCurrency] },
    { id: GroupId.whenAndWhere, columns: [RotkiColumn.timestamp, RotkiColumn.location] },
    { id: GroupId.note, columns: [RotkiColumn.description] },
  ],
  [RecipeFormat.trades]: [
    { id: GroupId.spent, columns: [RotkiColumn.spendCurrency, RotkiColumn.spendAmount] },
    { id: GroupId.received, columns: [RotkiColumn.receiveCurrency, RotkiColumn.receiveAmount] },
    { id: GroupId.fee, columns: [RotkiColumn.fee, RotkiColumn.feeCurrency] },
    { id: GroupId.whenAndWhere, columns: [RotkiColumn.timestamp, RotkiColumn.location] },
    { id: GroupId.note, columns: [RotkiColumn.description] },
  ],
  [RecipeFormat.events]: [
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
  [GroupId.oneSide]: t('step_mapping.groups.one_side'),
}));

const groups = computed<FieldGroup[]>(() => GROUPS[recipe.value.format]);
const isTrades = computed<boolean>(() => recipe.value.format === RecipeFormat.trades);
const isBoth = computed<boolean>(() => recipe.value.format === RecipeFormat.both);

/** The two columns of the guided rule, a trade when both have a value; `undefined` for a rule from a recipe file. */
function guidedRouteColumns(route: readonly Condition[]): [string, string] | undefined {
  const [first, second] = route;
  if (route.length !== 2 || first?.kind !== ConditionKind.filled || second?.kind !== ConditionKind.filled)
    return undefined;
  return [first.column, second.column];
}

const route = computed<readonly Condition[]>(() => recipe.value.route ?? []);
const isGuidedRoute = computed<boolean>(() => route.value.length === 0 || guidedRouteColumns(route.value) !== undefined);

function setRouteColumn(position: 0 | 1, column: string | undefined): void {
  const columns: (string | undefined)[] = [...(guidedRouteColumns(route.value) ?? ['', ''])];
  columns[position] = column;
  recipe.value.route = columns
    .filter((name): name is string => !!name)
    .map(name => ({ kind: ConditionKind.filled, column: name }));
}

const routeColumns = computed<[string, string]>(() => guidedRouteColumns(route.value) ?? [route.value[0]?.column ?? '', '']);

/** How the rule splits the sample, so a rule that sends every row one way shows before converting. */
const routeCounts = computed<{ trades: number; events: number }>(() => {
  const names = header.value;
  const trades = route.value.length === 0
    ? 0
    : rows.value.filter(record => meetsAll(route.value, name => record[names.indexOf(name)] ?? '')).length;
  return { trades, events: rows.value.length - trades };
});

function conditionText(condition: Condition): string {
  if (condition.kind === ConditionKind.oneOf)
    return t('step_mapping.route.conditions.one_of', { column: condition.column, values: condition.values.join(', ') });
  if (condition.kind === ConditionKind.empty)
    return t('step_mapping.route.conditions.empty', { column: condition.column });
  return t('step_mapping.route.conditions.filled', { column: condition.column });
}

/** A rule from a recipe file, in words; the guided controls only edit the two-column rule. */
const routeSummary = computed<string>(() => route.value.map(conditionText).join(t('step_mapping.route.and')));

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

    <section
      v-if="isBoth"
      class="flex flex-col gap-3 rounded-md border border-rui-divider p-4"
      :aria-label="t('step_mapping.route.title')"
      data-testid="route-section"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
        {{ t('step_mapping.route.title') }}
      </h2>
      <p class="text-sm text-rui-text-secondary">
        {{ t('step_mapping.route.explanation') }}
      </p>
      <div
        v-if="isGuidedRoute"
        class="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <RuiMenuSelect
          :model-value="routeColumns[0]"
          :options="columnOptions"
          key-attr="id"
          text-attr="label"
          dense
          hide-details
          :label="t('step_mapping.route.first_column')"
          data-testid="route-first"
          @update:model-value="setRouteColumn(0, $event)"
        />
        <RuiMenuSelect
          :model-value="routeColumns[1]"
          :options="columnOptions"
          key-attr="id"
          text-attr="label"
          dense
          hide-details
          :label="t('step_mapping.route.second_column')"
          data-testid="route-second"
          @update:model-value="setRouteColumn(1, $event)"
        />
      </div>
      <p
        v-else
        class="text-sm"
        data-testid="route-custom"
      >
        {{ t('step_mapping.route.custom', { rule: routeSummary }) }}
      </p>
      <p
        class="text-sm text-rui-text-secondary"
        data-testid="route-counts"
      >
        {{ t('step_mapping.route.counts', { trades: t('common.rows', routeCounts.trades), events: t('common.rows', routeCounts.events) }) }}
      </p>
    </section>

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
