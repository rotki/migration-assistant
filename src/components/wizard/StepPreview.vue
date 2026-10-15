<script setup lang="ts">
import { RuiAlert, RuiButton, RuiChip } from '@rotki/ui-library';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { messageKey } from '@/modules/convert/messages';
import { type Rejection, RejectionCause, RowKind } from '@/modules/convert/row-converter';
import { useMessages } from '@/modules/convert/use-messages';
import { getRotkiColumns } from '@/modules/rotki-format';
import { type PreviewRow, useWizard } from '@/modules/wizard/use-wizard';
import ConvertedRows from './ConvertedRows.vue';

const { t } = useI18n({ useScope: 'global' });
const { translate } = useMessages();
const { isWholeFile, preview, recipe, step } = useWizard();

/** The wizard steps a rejection points back to. */
const fixSteps = computed<Record<RejectionCause, { index: number; label: string }>>(() => ({
  [RejectionCause.mapping]: { index: 2, label: t('step_preview.fix_in', { step: t('convert_page.steps.mapping.title') }) },
  [RejectionCause.format]: { index: 3, label: t('step_preview.fix_in', { step: t('convert_page.steps.formats.title') }) },
}));

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
      :title="t('step_preview.incomplete')"
    >
      <ul class="list-disc pl-4">
        <li
          v-for="problem in preview.problems"
          :key="messageKey(problem)"
        >
          {{ translate(problem) }}
        </li>
      </ul>
    </RuiAlert>

    <template v-else>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-rui-text-secondary">
          {{ isWholeFile
            ? t('step_preview.first_rows', { count: preview.rows.length }, preview.rows.length)
            : t('step_preview.first_rows_of_file', { count: preview.rows.length }, preview.rows.length) }}
        </span>
        <RuiChip
          size="sm"
          color="success"
        >
          {{ t('step_preview.chips.converted', { count: converted.length }) }}
        </RuiChip>
        <RuiChip
          size="sm"
          color="error"
        >
          {{ t('step_preview.chips.rejected', { count: rejected.length }) }}
        </RuiChip>
        <RuiChip size="sm">
          {{ t('step_preview.chips.skipped', { count: skipped }) }}
        </RuiChip>
      </div>

      <section
        v-if="rejected.length > 0"
        class="flex flex-col gap-2"
        data-testid="preview-rejected"
      >
        <h2 class="font-semibold">
          {{ t('step_preview.rejected.title') }}
        </h2>
        <p class="text-sm text-rui-text-secondary">
          {{ t('step_preview.rejected.description') }}
        </p>
        <ul class="flex flex-col divide-y divide-rui-divider rounded-md border border-rui-divider text-sm">
          <li
            v-for="row in rejected.slice(0, 10)"
            :key="row.row"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
          >
            <span class="font-mono text-rui-text-secondary shrink-0">{{ t('step_preview.rejected.row', { row: row.row }) }}</span>
            <span class="min-w-0 flex-1">{{ translate(row.rejection.reason) }}</span>
            <RuiButton
              variant="text"
              color="primary"
              size="sm"
              :data-testid="`fix-${row.row}`"
              @click="step = fixSteps[row.rejection.cause].index"
            >
              {{ fixSteps[row.rejection.cause].label }}
            </RuiButton>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-2">
        <h2 class="font-semibold">
          {{ t('step_preview.import.title') }}
        </h2>
        <p
          v-if="converted.length === 0"
          class="rounded-md border border-rui-divider px-3 py-6 text-center text-sm text-rui-text-secondary"
        >
          {{ t('step_preview.import.nothing') }}
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
