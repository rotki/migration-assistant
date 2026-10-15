import type { Recipe } from './recipe';
import { createCsvParser } from '@/modules/csv/parser';
import { normalizeHeader } from '@/modules/csv/sniff';
import { formatCsvRow } from '@/modules/csv/writer';
import { getRotkiColumns } from '@/modules/rotki-format';
import { createRowConverter, type RowConverter, RowKind } from './row-converter';

export interface ConversionStats {
  bytesRead: number;
  totalBytes: number;
  converted: number;
  skipped: number;
  rejected: number;
}

export interface TextSink {
  write: (text: string) => void;
}

export interface ConvertStreamOptions {
  stream: ReadableStream<Uint8Array>;
  totalBytes: number;
  recipe: Recipe;
  output: TextSink;
  /** Gets the source header plus `Row` and `Reason`, then every rejected record. */
  rejected: TextSink;
  onProgress?: (stats: ConversionStats) => void;
}

/**
 * Converts a file record by record as its bytes arrive, so memory use does not grow with the
 * file. Throws a `RecipeError` when the header does not fit the recipe, and an `Error` when
 * the file ends before its header.
 */
export async function convertStream(options: ConvertStreamOptions): Promise<ConversionStats> {
  const { stream, totalBytes, recipe, output, rejected, onProgress } = options;
  const stats: ConversionStats = { bytesRead: 0, totalBytes, converted: 0, skipped: 0, rejected: 0 };
  const parser = createCsvParser(recipe.input.delimiter);
  const decoder = new TextDecoder(recipe.input.encoding);
  let recordIndex = 0;
  let convert: RowConverter | undefined;

  function handle(records: string[][]): void {
    for (const record of records) {
      const index = recordIndex++;
      if (index < recipe.input.headerIndex)
        continue;
      if (!convert) {
        const header = normalizeHeader(record);
        convert = createRowConverter(recipe, header);
        output.write(formatCsvRow(getRotkiColumns(recipe.format)));
        rejected.write(formatCsvRow([...header, 'Row', 'Reason']));
        continue;
      }
      const result = convert(record);
      if (result.kind === RowKind.converted) {
        stats.converted++;
        output.write(formatCsvRow(result.values));
      }
      else if (result.kind === RowKind.skipped) {
        stats.skipped++;
      }
      else {
        stats.rejected++;
        // Rows are numbered as the file counts its records, preamble and header included.
        rejected.write(formatCsvRow([...record, String(index + 1), result.reason]));
      }
    }
  }

  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done)
      break;
    stats.bytesRead += value.byteLength;
    handle(parser.push(decoder.decode(value, { stream: true })));
    onProgress?.({ ...stats });
  }
  handle(parser.push(decoder.decode()));
  handle(parser.flush());

  if (!convert)
    throw new Error('The file ended before its header row.');
  return stats;
}
