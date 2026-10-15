<script setup lang="ts">
import { RotkiColumn } from '@/modules/rotki-format';

const { columns, rows } = defineProps<{
  columns: readonly string[];
  /** Converted rows, each its values in column order and its row number in the file. */
  rows: { row: number; values: string[] }[];
}>();

function isoTime(value: string): string {
  const epoch = Number(value);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString().replace('.000Z', 'Z') : value;
}

/** `2024-03-05 12:30:15` in UTC, short enough to keep the table inside the page. */
function display(column: string | undefined, value: string): string {
  if (column !== RotkiColumn.timestamp)
    return value;
  const iso = isoTime(value);
  return iso.length >= 19 ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso;
}

/** The non-empty values of a row with their column names, for the phone layout. */
function filled(values: string[]): { column: string; value: string }[] {
  return values.flatMap((value, index) => (value === '' ? [] : [{ column: columns[index] ?? '', value }]));
}
</script>

<template>
  <div class="hidden sm:block overflow-x-auto rounded-md border border-rui-divider">
    <table
      class="w-full text-[13px]"
      data-testid="preview-table"
    >
      <thead class="bg-rui-surface-muted">
        <tr>
          <th
            v-for="column in columns"
            :key="column"
            class="px-2 py-1.5 text-left font-medium whitespace-nowrap"
          >
            {{ column }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.row"
          class="border-t border-rui-divider"
        >
          <td
            v-for="(value, index) in row.values"
            :key="index"
            class="px-2 py-1 whitespace-nowrap font-mono"
            :title="columns[index] === RotkiColumn.timestamp ? isoTime(value) : undefined"
          >
            {{ display(columns[index], value) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <ul
    class="flex flex-col gap-2 sm:hidden"
    data-testid="preview-cards"
  >
    <li
      v-for="row in rows"
      :key="row.row"
      class="rounded-md border border-rui-divider px-3 py-2"
    >
      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
        <template
          v-for="item in filled(row.values)"
          :key="item.column"
        >
          <dt class="text-rui-text-secondary">
            {{ item.column }}
          </dt>
          <dd class="m-0 font-mono break-all">
            {{ display(item.column, item.value) }}
          </dd>
        </template>
      </dl>
    </li>
  </ul>
</template>
