<script setup lang="ts">
import { RuiAlert, RuiButton, RuiChip } from '@rotki/ui-library';
import { computed } from 'vue';
import { type Rejection, RejectionCause, RowKind } from '@/modules/convert/row-converter';
import { getRotkiColumns } from '@/modules/rotki-format';
import { type PreviewRow, useWizard } from '@/modules/wizard/use-wizard';
import ConvertedRows from './ConvertedRows.vue';

const { isWholeFile, preview, recipe, step } = useWizard();

/** The wizard steps a rejection points back to. */
const FIX_STEPS: Record<RejectionCause, { index: number; label: string }> = {
  [RejectionCause.mapping]: { index: 2, label: 'Fix in Map columns' },
  [RejectionCause.format]: { index: 3, label: 'Fix in Dates and numbers' },
};

const columns = computed(() => getRotkiColumns(recipe.value.format));

const converted = computed<(PreviewRow & { values: string[] })[]>(() => preview.value.rows.flatMap(row =>
  row.result.kind === RowKind.converted ? [{ ...row, values: row.result.values }] : []));

const rejected = computed<(PreviewRow & { rejection: Rejection })[]>(() => preview.value.rows.flatMap(row =>
  row.result.kind === RowKind.rejected ? [{ ...row, rejection: row.result }] : []));

const skipped = computed<number>(() => preview.value.rows.filter(row => row.result.kind === RowKind.skipped).length);
</script>

<template>
  <div class="flex flex-col gap-6">
    <RuiAlert
      v-if="preview.problems.length > 0"
      type="error"
      title="The mapping is not complete"
    >
      <ul class="list-disc pl-4">
        <li
          v-for="problem in preview.problems"
          :key="problem"
        >
          {{ problem }}
        </li>
      </ul>
    </RuiAlert>

    <template v-else>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-rui-text-secondary">
          First {{ preview.rows.length }} rows{{ isWholeFile ? '' : ' of the file' }}:
        </span>
        <RuiChip
          size="sm"
          color="success"
        >
          {{ converted.length }} converted
        </RuiChip>
        <RuiChip
          size="sm"
          color="error"
        >
          {{ rejected.length }} rejected
        </RuiChip>
        <RuiChip size="sm">
          {{ skipped }} skipped
        </RuiChip>
      </div>

      <section
        v-if="rejected.length > 0"
        class="flex flex-col gap-2"
        data-testid="preview-rejected"
      >
        <h2 class="font-semibold">
          Rejected rows
        </h2>
        <p class="text-sm text-rui-text-secondary">
          These rows would go to a separate file. Fix the cause to bring them in, or leave them out.
          Row numbers match the file table in the first step.
        </p>
        <ul class="flex flex-col divide-y divide-rui-divider rounded-md border border-rui-divider text-sm">
          <li
            v-for="row in rejected.slice(0, 10)"
            :key="row.row"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
          >
            <span class="font-mono text-rui-text-secondary shrink-0">Row {{ row.row }}</span>
            <span class="min-w-0 flex-1">{{ row.rejection.reason }}</span>
            <RuiButton
              variant="text"
              color="primary"
              size="sm"
              :data-testid="`fix-${row.row}`"
              @click="step = FIX_STEPS[row.rejection.cause].index"
            >
              {{ FIX_STEPS[row.rejection.cause].label }}
            </RuiButton>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="font-semibold">
          What rotki will import
        </h2>
        <p
          v-if="converted.length === 0"
          class="rounded-md border border-rui-divider px-3 py-6 text-center text-sm text-rui-text-secondary"
        >
          No row converts yet.
        </p>
        <ConvertedRows
          v-else
          :columns="columns"
          :rows="converted.slice(0, 20)"
        />
      </section>
    </template>
  </div>
</template>
