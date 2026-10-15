import { createCsvParser } from '@/modules/csv/parser';
import { normalizeHeader } from '@/modules/csv/sniff';
import { formatCsvRow } from '@/modules/csv/writer';
import { getRotkiColumns, RotkiFormat } from '@/modules/rotki-format';
import { message, MessageCode, MessageError, type RejectedFileTexts, rejectionText } from './messages';
import { outputFormats, type Recipe } from './recipe';
import { createRowConverter, type RowConverter, RowKind } from './row-converter';

export interface ConversionStats {
  bytesRead: number;
  totalBytes: number;
  converted: number;
  /** Converted rows per rotki file; a recipe of format `both` splits them between trades and events. */
  convertedByFormat: Record<RotkiFormat, number>;
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
  /** One sink per rotki file the recipe writes, as {@link outputFormats} lists them. */
  outputs: Partial<Record<RotkiFormat, TextSink>>;
  /** Gets the source header plus a row number and a reason column, then every rejected record. */
  rejected: TextSink;
  /** The rejected file's column headers and reason texts, in the page's language. */
  texts: RejectedFileTexts;
  onProgress?: (stats: ConversionStats) => void;
}

/**
 * Converts a file record by record as its bytes arrive, so memory use does not grow with the
 * file. Throws a `RecipeError` when the header does not fit the recipe, and a `MessageError`
 * when the file ends before its header.
 */
export async function convertStream(options: ConvertStreamOptions): Promise<ConversionStats> {
  const { stream, totalBytes, recipe, outputs, rejected, texts, onProgress } = options;
  const formats = outputFormats(recipe.format);
  const sinks = new Map(formats.map((format) => {
    const sink = outputs[format];
    if (!sink)
      throw new Error(`convertStream got no output for the ${format} file.`);
    return [format, sink];
  }));
  const stats: ConversionStats = {
    bytesRead: 0,
    totalBytes,
    converted: 0,
    convertedByFormat: { [RotkiFormat.trades]: 0, [RotkiFormat.events]: 0 },
    skipped: 0,
    rejected: 0,
  };
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
        for (const [format, sink] of sinks)
          sink.write(formatCsvRow(getRotkiColumns(format)));
        rejected.write(formatCsvRow([...header, texts.row, texts.reason]));
        continue;
      }
      const result = convert(record);
      if (result.kind === RowKind.converted) {
        stats.converted++;
        stats.convertedByFormat[result.format]++;
        sinks.get(result.format)?.write(formatCsvRow(result.values));
      }
      else if (result.kind === RowKind.skipped) {
        stats.skipped++;
      }
      else {
        stats.rejected++;
        // Rows are numbered as the file counts its records, preamble and header included.
        rejected.write(formatCsvRow([...record, String(index + 1), rejectionText(texts, result.reason)]));
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
    throw new MessageError(message(MessageCode.noHeader));
  return stats;
}
