<script setup lang="ts">
import type { SampleReading } from '@/modules/wizard/types';
import { RuiAlert, RuiMenuSelect, RuiRadio, RuiRadioGroup, RuiTextField, RuiTimezoneSelect } from '@rotki/ui-library';
import { computed } from 'vue';
import { DATE_FORMAT_CANDIDATES, DateFormat, describeDateFormat, parseDate } from '@/modules/convert/dates';
import { normalizeDecimal } from '@/modules/convert/numbers';
import { AMOUNT_COLUMNS, SourceKind } from '@/modules/convert/recipe';
import { RotkiColumn } from '@/modules/rotki-format';
import { useWizard } from '@/modules/wizard/use-wizard';
import SampleReadings from './SampleReadings.vue';

const { columnSamples, dateFormats, recipe } = useWizard();

const EXAMPLES: Record<string, string> = {
  [DateFormat.iso]: 'such as 2024-03-05 12:30:15 or 2024-03-05T12:30:15Z',
  [DateFormat.unixSeconds]: 'Unix time',
};

const CUSTOM = '__custom__';

const formatOptions = computed(() => [
  ...DATE_FORMAT_CANDIDATES.map((id) => {
    const example = EXAMPLES[id];
    const name = describeDateFormat(id);
    return { id, label: example ? `${name[0]?.toUpperCase()}${name.slice(1)}, ${example}` : name };
  }),
  { id: CUSTOM, label: 'Custom pattern' },
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
    return 'No format matches the dates in the sample.';
  if (!formats.includes(recipe.value.dates.format))
    return `The sample matches ${formats.map(describeDateFormat).join(' or ')}.`;
  return formats.length === 1 ? 'Matches every date in the sample.' : `Also matches ${formats.filter(format => format !== recipe.value.dates.format).map(describeDateFormat).join(', ')}.`;
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
      aria-label="Dates"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
        Dates
      </h2>
      <RuiAlert
        v-if="isAmbiguous"
        type="warning"
        title="Check the day and month order"
        :description="`The sample fits ${dateFormats.length} formats that read the dates differently, for example day-first and month-first. Pick the one your exchange uses.`"
      />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RuiMenuSelect
          v-model="formatChoice"
          :options="formatOptions"
          key-attr="id"
          text-attr="label"
          label="Date format"
          :hint="formatHint"
          data-testid="date-format"
        />
        <RuiTimezoneSelect
          v-model="recipe.dates.timeZone"
          label="Time zone of the export"
          hint="Used when a date carries no offset. Many exchanges export in UTC."
        />
      </div>
      <RuiTextField
        v-if="isCustom"
        v-model="recipe.dates.format"
        label="Pattern"
        hint="Tokens: YYYY MM M DD D HH H hh h mm ss SSS A MMM. Put words in brackets, as [at]. Anything else must match as written."
      />
      <SampleReadings
        v-if="dateReadings.length > 0"
        :readings="dateReadings"
        unreadable="does not match"
        data-testid="date-readings"
      />
    </section>

    <section
      class="flex flex-col gap-4 rounded-md border border-rui-divider p-4"
      aria-label="Numbers"
    >
      <h2 class="text-sm font-semibold uppercase tracking-wide text-rui-text-secondary">
        Numbers
      </h2>
      <RuiRadioGroup
        v-model="recipe.numbers.decimalSeparator"
        label="Decimal separator"
        inline
        hide-details
      >
        <RuiRadio
          value="."
          label="Dot: 1,234.56"
        />
        <RuiRadio
          value=","
          label="Comma: 1.234,56"
        />
      </RuiRadioGroup>
      <SampleReadings
        v-if="amountReadings.length > 0"
        :readings="amountReadings"
        unreadable="not a number with this separator"
        data-testid="amount-readings"
      />
    </section>
  </div>
</template>
