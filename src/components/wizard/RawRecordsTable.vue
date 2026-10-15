<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/** The index of the record that holds the column names. */
const headerIndex = defineModel<number>('headerIndex', { required: true });

const { records } = defineProps<{
  /** Records as parsed, preamble included. */
  records: string[][];
}>();

const { t } = useI18n({ useScope: 'global' });

const width = computed<number>(() => Math.max(1, ...records.map(record => record.length)));

function rowClass(index: number): Record<string, boolean> {
  const isHeader = index === headerIndex.value;
  return {
    'bg-rui-primary-soft font-semibold': isHeader,
    'hover:bg-rui-hover': !isHeader,
    'text-rui-text-disabled line-through': index < headerIndex.value,
  };
}
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-rui-divider">
    <table class="w-full text-sm">
      <tbody>
        <tr
          v-for="(record, index) in records"
          :key="index"
          class="cursor-pointer border-b border-rui-divider last:border-b-0"
          :class="rowClass(index)"
          :aria-selected="index === headerIndex"
          :data-testid="`raw-row-${index}`"
          @click="headerIndex = index"
        >
          <td
            class="px-3 py-1.5 text-rui-text-secondary font-mono whitespace-nowrap border-l-4"
            :class="index === headerIndex ? 'border-rui-primary' : 'border-transparent'"
          >
            <span
              v-if="index === headerIndex"
              class="rounded bg-rui-primary px-1.5 py-0.5 font-sans text-xs font-medium text-rui-primary-foreground"
            >
              {{ t('raw_records.header') }}
            </span>
            <template v-else>
              {{ index + 1 }}
            </template>
          </td>
          <td
            v-for="column in width"
            :key="column"
            class="px-3 py-1.5 whitespace-nowrap max-w-64 truncate"
          >
            {{ record[column - 1] ?? '' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
