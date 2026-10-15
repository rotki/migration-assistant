import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/modules/csv/parser';
import { RotkiFormat } from '@/modules/rotki-format';
import { englishTexts } from '@/test-utils/messages';
import { SIDED_HEADER, sidedRecipe } from '@/test-utils/recipes';
import { type ConversionStats, convertStream, type TextSink } from './convert-stream';
import { message, MessageCode, MessageError, type RejectedFileTexts } from './messages';
import { type Recipe, SKIP_ROW } from './recipe';
import { RecipeError } from './row-converter';

const recipe: Recipe = {
  version: 2,
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

interface Run {
  stats: ConversionStats;
  /** The events file, which is what the ledger recipe writes. */
  output: string;
  trades: string;
  rejected: string;
  progress: number[];
}

async function run(input: string, chunkSize: number, options: Partial<Recipe> = {}, texts: RejectedFileTexts = englishTexts()): Promise<Run> {
  const bytes = new TextEncoder().encode(input);
  const events = collector();
  const trades = collector();
  const rejected = collector();
  const progress: number[] = [];
  const stats = await convertStream({
    stream: chunked(bytes, chunkSize),
    totalBytes: bytes.length,
    recipe: { ...recipe, ...options },
    outputs: { [RotkiFormat.events]: events, [RotkiFormat.trades]: trades },
    rejected,
    texts,
    onProgress: update => progress.push(update.bytesRead),
  });
  return { stats, output: events.text(), trades: trades.text(), rejected: rejected.text(), progress };
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
    await expect(run('Exported ledger', 64)).rejects.toThrowError(new MessageError(message(MessageCode.noHeader)));
  });

  it('writes the trades and the events of a both recipe to their own files', async () => {
    const file = [
      SIDED_HEADER.join(','),
      '2024-03-05 12:00,30000,EUR,0.5,BTC,15,EUR,,Buy BTC',
      '2024-03-06 08:00,,,1.5,ETH,,,,',
      '2024-03-07 09:00,0.25,ETH,,,,,,To cold storage',
      '',
    ].join('\n');
    const { stats, output, trades } = await run(file, 16, sidedRecipe());
    expect(stats).toMatchObject({ converted: 3, convertedByFormat: { trades: 1, events: 2 }, rejected: 0 });
    expect(parseCsv(trades, ',')).toEqual([
      ['Location', 'Spend Currency', 'Spend Amount', 'Receive Currency', 'Receive Amount', 'Fee', 'Fee Currency', 'Description', 'Timestamp'],
      ['external', 'EUR', '30000', 'BTC', '0.5', '15', 'EUR', 'Buy BTC', String(Date.UTC(2024, 2, 5, 12))],
    ]);
    expect(parseCsv(output, ',').map(row => row.slice(0, 4))).toEqual([
      ['Type', 'Location', 'Currency', 'Amount'],
      ['Deposit', 'external', 'ETH', '1.5'],
      ['Withdrawal', 'external', 'ETH', '0.25'],
    ]);
  });

  it('refuses to write a format it got no output for', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.close();
      },
    });
    const running = convertStream({ stream, totalBytes: 0, recipe: sidedRecipe(), outputs: { trades: collector() }, rejected: collector(), texts: englishTexts() });
    await expect(running).rejects.toThrowError('convertStream got no output for the events file.');
  });

  it('writes the rejected file in the texts it is given', async () => {
    const texts = englishTexts();
    texts.row = 'Fila';
    texts.reason = 'Motivo';
    texts.reasons[MessageCode.unknownType] = 'Tipo "{value}" desconocido.';
    const { rejected } = await run(FILE, 64, {}, texts);
    expect(parseCsv(rejected, ',')).toEqual([
      ['Time', 'Kind', 'Asset', 'Amount', 'Note', 'Fila', 'Motivo'],
      ['1709641817', 'airdrop', 'XYZ', '5', 'multi\r\nline', '5', 'Tipo "airdrop" desconocido.'],
    ]);
  });
});
