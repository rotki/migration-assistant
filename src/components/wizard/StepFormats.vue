<script setup lang="ts">
import type { SampleReading } from '@/modules/wizard/types';
import { RuiAlert, RuiMenuSelect, RuiRadio, RuiRadioGroup, RuiTextField, RuiTimezoneSelect } from '@rotki/ui-library';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DATE_FORMAT_CANDIDATES, DateFormat, parseDate } from '@/modules/convert/dates';
import { normalizeDecimal } from '@/modules/convert/numbers';
import { AMOUNT_COLUMNS, SourceKind } from '@/modules/convert/recipe';
import { useMessages } from '@/modules/convert/use-messages';
import { RotkiColumn } from '@/modules/rotki-format';
import { useWizard } from '@/modules/wizard/use-wizard';
import SampleReadings from './SampleReadings.vue';

const { locale, t } = useI18n({ useScope: 'global' });
const { dateFormatName } = useMessages();
const { columnSamples, dateFormats, recipe } = useWizard();

const CUSTOM = '__custom__';

/** Option labels, with an example where the name alone does not show the shape. */
const optionLabels = computed<Record<string, string>>(() => ({
  [DateFormat.iso]: t('step_formats.date_format.options.iso'),
  [DateFormat.unixSeconds]: t('step_formats.date_format.options.unix_s'),
  [DateFormat.unixMilliseconds]: t('step_formats.date_format.options.unix_ms'),
} satisfies Record<DateFormat, string>));

function list(formats: string[], type: Intl.ListFormatType): string {
  return new Intl.ListFormat(locale.value, { type, style: 'long' }).format(formats.map(dateFormatName));
}

const formatOptions = computed(() => [
  ...DATE_FORMAT_CANDIDATES.map(id => ({ id, label: optionLabels.value[id] ?? id })),
  { id: CUSTOM, label: t('step_formats.date_format.custom') },
]);

const isCustom = computed<boolean>(() => !DATE_FORMAT_CANDIDATES.includes(recipe.value.dates.format));

const formatChoice = computed<string>({
  get: () => (isCustom.value ? CUSTOM : recipe.value.dates.format),
  set: (value) => {
    recipe.value.dates.format = value === CUSTOM ? 'YYYY-MM-DD HH:mm:ss' : value;
  },
});

const isAmbiguous = computed<boolean>(() => dateFormats.value.length > 1);

/** Confirms a match, and lists other formats only when the user has a real choice. */
const formatHint = computed<string>(() => {
  const formats = dateFormats.value;
  if (formats.length === 0)
    return t('step_formats.date_format.hint.none');
  if (!formats.includes(recipe.value.dates.format))
    return t('step_formats.date_format.hint.sample_matches', { formats: list(formats, 'disjunction') });
  if (formats.length === 1)
    return t('step_formats.date_format.hint.matches_all');
  const others = formats.filter(format => format !== recipe.value.dates.format);
  return t('step_formats.date_format.hint.also_matches', { formats: list(others, 'unit') });
});

function distinctSamples(column: string | undefined, limit: number): string[] {
  return column ? [...new Set(columnSamples(column).map(value => value.trim()))].slice(0, limit) : [];
}

const dateReadings = computed<SampleReading[]>(() => {
  const source = recipe.value.fields[RotkiColumn.timestamp]?.source;
  return distinctSamples(source?.kind === SourceKind.column ? source.column : undefined, 5).map((raw) => {
    const epoch = parseDate(raw, recipe.value.dates.format, recipe.value.dates.timeZone);
    return { raw, read: epoch === undefined ? undefined : new Date(epoch).toISOString().replace('.000Z', 'Z') };
  });
});

const amountReadings = computed<SampleReading[]>(() => {
  const raws = [...AMOUNT_COLUMNS].flatMap((column) => {
    const source = recipe.value.fields[column]?.source;
    return distinctSamples(source?.kind === SourceKind.column ? source.column : undefined, 3);
  });
  return [...new Set(raws)].slice(0, 6).map(raw => ({ raw, read: normalizeDecimal(raw, recipe.value.numbers.decimalSeparator) }));
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <section
      class="flex flex-col gap-4 rounded-md border border-rui-divider p-4"
      :aria-label="t('step_formats.dates')"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
        {{ t('step_formats.dates') }}
      </h2>
      <RuiAlert
        v-if="isAmbiguous"
        type="warning"
        :title="t('step_formats.ambiguous.title')"
        :description="t('step_formats.ambiguous.description', { count: dateFormats.length }, dateFormats.length)"
      />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RuiMenuSelect
          v-model="formatChoice"
          :options="formatOptions"
          key-attr="id"
          text-attr="label"
          :label="t('step_formats.date_format.label')"
          :hint="formatHint"
          data-testid="date-format"
        />
        <RuiTimezoneSelect
          v-model="recipe.dates.timeZone"
          :label="t('step_formats.time_zone.label')"
          :hint="t('step_formats.time_zone.hint')"
        />
      </div>
      <RuiTextField
        v-if="isCustom"
        v-model="recipe.dates.format"
        :label="t('step_formats.pattern.label')"
        :hint="t('step_formats.pattern.hint')"
      />
      <SampleReadings
        v-if="dateReadings.length > 0"
        :readings="dateReadings"
        :unreadable="t('step_formats.unreadable.date')"
        data-testid="date-readings"
      />
    </section>

    <section
      class="flex flex-col gap-4 rounded-md border border-rui-divider p-4"
      :aria-label="t('step_formats.numbers')"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
        {{ t('step_formats.numbers') }}
      </h2>
      <RuiRadioGroup
        v-model="recipe.numbers.decimalSeparator"
        :label="t('step_formats.decimal_separator.label')"
        inline
        hide-details
      >
        <RuiRadio
          value="."
          :label="t('step_formats.decimal_separator.dot')"
        />
        <RuiRadio
          value=","
          :label="t('step_formats.decimal_separator.comma')"
        />
      </RuiRadioGroup>
      <SampleReadings
        v-if="amountReadings.length > 0"
        :readings="amountReadings"
        :unreadable="t('step_formats.unreadable.number')"
        data-testid="amount-readings"
      />
    </section>
  </div>
</template>
