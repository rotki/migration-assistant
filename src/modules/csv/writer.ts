const NEEDS_QUOTES = /[",\r\n]/;

function formatField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** One comma-separated record with a trailing `\n`, the format rotki's importer reads. */
export function formatCsvRow(values: readonly string[]): string {
  return `${values.map(formatField).join(',')}\n`;
}
