import type { ConversionMessage } from '@/modules/convert/protocol';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Recipe, serializeRecipe } from '@/modules/convert/recipe';
import { RotkiFormat } from '@/modules/rotki-format';
import { type FakeStorage, installFakeStorage } from '@/test-utils/storage';

const CSV = [
  'Date,Base,Quote,Amount,Total',
  '2024-03-05T12:00:00Z,BTC,EUR,0.5,30000',
  '2024-03-06T08:00:00Z,ETH,EUR,2,abc',
  '',
].join('\n');

const recipe: Recipe = {
  version: 1,
  name: '',
  input: { encoding: 'utf-8', delimiter: ',', headerIndex: 0 },
  format: RotkiFormat.trades,
  fields: {
    'Location': { source: { kind: 'constant', value: 'kraken' } },
    'Spend Currency': { source: { kind: 'column', column: 'Quote' } },
    'Spend Amount': { source: { kind: 'column', column: 'Total' } },
    'Receive Currency': { source: { kind: 'column', column: 'Base' } },
    'Receive Amount': { source: { kind: 'column', column: 'Amount' } },
    'Timestamp': { source: { kind: 'column', column: 'Date' } },
  },
  numbers: { decimalSeparator: '.' },
  dates: { format: 'iso', timeZone: 'UTC' },
};

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'start',
    file: new File([CSV], 'kraken.csv'),
    recipe: JSON.parse(serializeRecipe(recipe)),
    outputName: 'converted.csv',
    rejectedName: 'rejected.csv',
    ...overrides,
  };
}

let storage: FakeStorage;
let posted: ConversionMessage[];

/** Sends a message to the worker and waits for its final reply. */
async function send(data: unknown): Promise<ConversionMessage> {
  dispatchEvent(new MessageEvent('message', { data }));
  await vi.waitFor(() => expect(posted.some(message => message.type !== 'progress')).toBe(true));
  const reply = posted.find(message => message.type !== 'progress');
  if (!reply)
    throw new Error('The worker did not reply.');
  return reply;
}

describe('the conversion worker', () => {
  beforeAll(async () => {
    await import('./convert.worker');
  });

  beforeEach(() => {
    posted = [];
    vi.stubGlobal('postMessage', (message: ConversionMessage) => posted.push(message));
    storage = installFakeStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts the file into the output folder and reports the counts', async () => {
    const reply = await send(request());
    expect(reply).toEqual({ type: 'done', stats: { bytesRead: CSV.length, totalBytes: CSV.length, converted: 1, skipped: 0, rejected: 1 } });
    expect(storage.files.get('converted.csv')).toContain('kraken,EUR,30000,BTC,0.5,');
    expect(storage.files.get('rejected.csv')).toMatch(/^Date,Base,Quote,Amount,Total,Row,Reason\n.*,3,"Spend Amount ""abc""/);
  });

  it('refuses a malformed request without touching storage', async () => {
    const reply = await send(request({ outputName: '../escape.csv' }));
    expect(reply).toEqual({ type: 'failed', message: 'The conversion request names invalid output files.', problems: [] });
    expect(storage.files.size).toBe(0);
  });

  it('lists what keeps the recipe from reading the file', async () => {
    const missing: Recipe = { ...recipe, fields: { ...recipe.fields, 'Spend Currency': { source: { kind: 'column', column: 'Pair' } } } };
    const reply = await send(request({ recipe: JSON.parse(serializeRecipe(missing)) }));
    expect(reply.type === 'failed' && reply.problems).toEqual(['The file has no column named "Pair".']);
  });

  it('explains a browser that refuses storage', async () => {
    storage.refuse = true;
    const reply = await send(request());
    expect(reply.type === 'failed' && reply.message).toMatch(/^This browser does not let the page store the converted file\./);
  });

  it('closes the output file when the rejected file cannot be opened', async () => {
    storage.locked.add('rejected.csv');
    const reply = await send(request());
    expect(reply.type).toBe('failed');
    expect(storage.open.size).toBe(0);
  });

  it('closes both files and reports the failure when closing the output fails', async () => {
    storage.failClose.add('converted.csv');
    const reply = await send(request());
    expect(reply).toEqual({ type: 'failed', message: 'converted.csv is over the quota.', problems: [] });
    expect(storage.open.size).toBe(0);
  });

  it('reports the conversion error, not a close failing after it', async () => {
    storage.failClose.add('converted.csv');
    const missing: Recipe = { ...recipe, fields: { ...recipe.fields, 'Spend Currency': { source: { kind: 'column', column: 'Pair' } } } };
    const reply = await send(request({ recipe: JSON.parse(serializeRecipe(missing)) }));
    expect(reply.type === 'failed' && reply.problems).toEqual(['The file has no column named "Pair".']);
    expect(storage.open.size).toBe(0);
  });
});
