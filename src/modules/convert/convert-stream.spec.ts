import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/modules/csv/parser';
import { RotkiFormat } from '@/modules/rotki-format';
import { type ConversionStats, convertStream, type TextSink } from './convert-stream';
import { type Recipe, SKIP_ROW } from './recipe';
import { RecipeError } from './row-converter';

const recipe: Recipe = {
  version: 1,
  name: 'ledger',
  input: { encoding: 'utf-8', delimiter: ';', headerIndex: 1 },
  format: RotkiFormat.events,
  fields: {
    Type: { source: { kind: 'column', column: 'Kind' }, values: { reward: 'Staking', transfer: SKIP_ROW } },
    Location: { source: { kind: 'constant', value: 'kraken' } },
    Currency: { source: { kind: 'column', column: 'Asset' } },
    Amount: { source: { kind: 'column', column: 'Amount' } },
    Description: { source: { kind: 'column', column: 'Note' } },
    Timestamp: { source: { kind: 'column', column: 'Time' } },
  },
  numbers: { decimalSeparator: ',' },
  dates: { format: 'unix-s', timeZone: 'UTC' },
};

const FILE = [
  'Exported ledger',
  'Time;Kind;Asset;Amount;Note',
  '1709641815;reward;ETH;0,01;"weekly; staking"',
  '1709641816;transfer;ETH;1;',
  '1709641817;airdrop;XYZ;5;"multi',
  'line"',
  '1709641818;reward;DOT;1.234,5;',
].join('\r\n');

function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller): void {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

function collector(): TextSink & { text: () => string } {
  const parts: string[] = [];
  return { write: text => parts.push(text), text: () => parts.join('') };
}

async function run(input: string, chunkSize: number, options: Partial<Recipe> = {}): Promise<{ stats: ConversionStats; output: string; rejected: string; progress: number[] }> {
  const bytes = new TextEncoder().encode(input);
  const output = collector();
  const rejected = collector();
  const progress: number[] = [];
  const stats = await convertStream({
    stream: chunked(bytes, chunkSize),
    totalBytes: bytes.length,
    recipe: { ...recipe, ...options },
    output,
    rejected,
    onProgress: update => progress.push(update.bytesRead),
  });
  return { stats, output: output.text(), rejected: rejected.text(), progress };
}

describe('convertStream', () => {
  it('converts, skips and rejects records across chunk boundaries', async () => {
    for (const chunkSize of [1, 7, 64, 4096]) {
      const { stats, output, rejected } = await run(FILE, chunkSize);

      expect(stats).toMatchObject({ converted: 2, skipped: 1, rejected: 1 });
      expect(parseCsv(output, ',')).toEqual([
        ['Type', 'Location', 'Currency', 'Amount', 'Fee', 'Fee Currency', 'Description', 'Timestamp'],
        ['Staking', 'kraken', 'ETH', '0.01', '', '', 'weekly; staking', '1709641815000'],
        ['Staking', 'kraken', 'DOT', '1234.5', '', '', '', '1709641818000'],
      ]);
      expect(parseCsv(rejected, ',')).toEqual([
        ['Time', 'Kind', 'Asset', 'Amount', 'Note', 'Row', 'Reason'],
        ['1709641817', 'airdrop', 'XYZ', '5', 'multi\r\nline', '5', 'Type "airdrop" is not a rotki event type; map it to one or skip it.'],
      ]);
    }
  });

  it('reports progress up to the full size', async () => {
    const { progress, stats } = await run(FILE, 16);
    expect(progress.at(-1)).toBe(stats.totalBytes);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it('stops on a header the recipe does not fit', async () => {
    await expect(run(FILE.replace('Asset', 'Coin'), 64)).rejects.toThrowError(RecipeError);
  });

  it('stops when the file ends before its header', async () => {
    await expect(run('Exported ledger', 64)).rejects.toThrowError('The file ended before its header row.');
  });
});
