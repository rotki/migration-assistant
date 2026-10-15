<script setup lang="ts">
import type { SampleReading } from '@/modules/wizard/types';
import { RuiIcon } from '@rotki/ui-library';
import { useI18n } from 'vue-i18n';

const { readings, unreadable } = defineProps<{
  readings: SampleReading[];
  /** Shown in place of a value the converter cannot read. */
  unreadable: string;
}>();

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <div class="w-fit max-w-full overflow-x-auto rounded-md border border-rui-divider">
    <table class="text-sm">
      <thead class="bg-rui-surface-muted text-left text-rui-text-secondary">
        <tr>
          <th class="px-3 py-1.5 font-medium">
            {{ t('sample_readings.in_file') }}
          </th>
          <th
            class="w-6"
            aria-hidden="true"
          />
          <th class="px-3 py-1.5 font-medium">
            {{ t('sample_readings.read_as') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="reading in readings"
          :key="reading.raw"
          class="border-t border-rui-divider"
        >
          <td class="px-3 py-1.5 font-mono whitespace-nowrap">
            {{ reading.raw }}
          </td>
          <td
            class="text-rui-text-secondary"
            aria-hidden="true"
          >
            <RuiIcon
              name="lu-arrow-right"
              size="14"
            />
          </td>
          <td
            class="px-3 py-1.5 font-mono whitespace-nowrap"
            :class="{ 'text-rui-error': reading.read === undefined }"
          >
            {{ reading.read ?? unreadable }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
