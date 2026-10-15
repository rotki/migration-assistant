import type { ConversionStats } from './convert-stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EffectScope, effectScope, isProxy, reactive } from 'vue';
import { RotkiFormat } from '@/modules/rotki-format';
import { englishTexts } from '@/test-utils/messages';
import { type FakeStorage, installFakeStorage } from '@/test-utils/storage';
import { message, MessageCode } from './messages';
import { type ConversionMessage, readStartConversion } from './protocol';
import { type Recipe, serializeRecipe } from './recipe';
import { type Conversion, useConversion } from './use-conversion';

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly posted: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(message: ConversionMessage): void {
    for (const listener of this.listeners.get('message') ?? [])
      listener({ data: message });
  }

  /** An error thrown inside the worker, which arrives as an `ErrorEvent`. */
  crash(message: string): void {
    for (const listener of this.listeners.get('error') ?? [])
      listener(new ErrorEvent('error', { message }));
  }

  /** The worker script did not load, as when a release replaced it; that arrives as a plain `Event`. */
  failToLoad(): void {
    for (const listener of this.listeners.get('error') ?? [])
      listener(new Event('error'));
  }
}

function lastWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  if (!worker)
    throw new Error('No worker was started.');
  return worker;
}

const recipe: Recipe = {
  version: 2,
  name: '',
  input: { encoding: 'utf-8', delimiter: ',', headerIndex: 0 },
  format: RotkiFormat.trades,
  fields: { Location: { source: { kind: 'constant', value: 'kraken' } } },
  numbers: { decimalSeparator: '.' },
  dates: { format: 'iso', timeZone: 'UTC' },
};

const file = new File(['a,b\n1,2\n'], 'kraken.csv');
const texts = englishTexts();

function stats(overrides: Partial<ConversionStats> = {}): ConversionStats {
  return { bytesRead: 8, totalBytes: 8, converted: 1, convertedByFormat: { trades: 1, events: 0 }, skipped: 0, rejected: 0, ...overrides };
}

let storage: FakeStorage;
let scope: EffectScope;
let conversion: Conversion;
let revoked: string[];

/** Finishes the running conversion with these files written. */
async function finish(converted: string, rejected?: string): Promise<void> {
  storage.files.set('trades.csv', converted);
  if (rejected !== undefined)
    storage.files.set('rejected.csv', rejected);
  lastWorker().reply({ type: 'done', stats: stats({ rejected: rejected === undefined ? 0 : 1 }) });
  await vi.waitFor(() => expect(conversion.state.value).not.toBe('running'));
}

describe('useConversion', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    storage = installFakeStorage();
    let urls = 0;
    revoked = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++urls}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url);
    });
    scope = effectScope();
    const created = scope.run(() => useConversion());
    if (!created)
      throw new Error('useConversion returned nothing.');
    conversion = created;
  });

  afterEach(() => {
    scope.stop();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears earlier output and posts a plain request the worker accepts', async () => {
    await conversion.start(file, reactive(structuredClone(recipe)), texts);
    expect(storage.removed).toEqual(['conversions']);
    expect(conversion.state.value).toBe('running');

    const [request] = lastWorker().posted;
    const read = readStartConversion(request);
    expect(read.ok && read.value.recipe).toEqual(recipe);
    expect(read.ok && read.value.texts).toEqual(texts);
    expect(read.ok && isProxy(read.value.recipe)).toBe(false);
    expect(read.ok && serializeRecipe(read.value.recipe)).toBe(serializeRecipe(recipe));
  });

  it('follows progress and offers the converted file under its download name', async () => {
    await conversion.start(file, recipe, texts);
    lastWorker().reply({ type: 'progress', stats: stats({ bytesRead: 4, converted: 0 }) });
    expect(conversion.stats.value?.bytesRead).toBe(4);

    await finish('Location\nkraken\n');
    expect(conversion.state.value).toBe('done');
    expect(conversion.outputs.value).toEqual([{ name: 'kraken-rotki-trades.csv', url: 'blob:1', size: 16, format: 'trades' }]);
    expect(conversion.rejected.value).toBeUndefined();
    expect(lastWorker().terminated).toBe(true);
  });

  it('offers both files of a both recipe, and only the ones that got rows', async () => {
    const both: Recipe = { ...recipe, format: 'both', route: [{ kind: 'filled', column: 'a' }] };
    await conversion.start(file, both, texts);
    storage.files.set('trades.csv', 'Location\nkraken\n');
    storage.files.set('events.csv', 'Type\n');
    lastWorker().reply({ type: 'done', stats: stats({ converted: 1, convertedByFormat: { trades: 1, events: 0 } }) });
    await vi.waitFor(() => expect(conversion.state.value).toBe('done'));
    expect(conversion.outputs.value.map(output => output.name)).toEqual(['kraken-rotki-trades.csv']);

    await conversion.start(file, both, texts);
    storage.files.set('trades.csv', 'Location\nkraken\n');
    storage.files.set('events.csv', 'Type\nDeposit\n');
    lastWorker().reply({ type: 'done', stats: stats({ converted: 2, convertedByFormat: { trades: 1, events: 1 } }) });
    await vi.waitFor(() => expect(conversion.state.value).toBe('done'));
    expect(conversion.outputs.value.map(output => [output.format, output.name])).toEqual([
      ['trades', 'kraken-rotki-trades.csv'],
      ['events', 'kraken-rotki-events.csv'],
    ]);
  });

  it('offers the rejected rows when there are some', async () => {
    await conversion.start(file, { ...recipe, name: 'my kraken' }, texts);
    await finish('Location\n', 'a,b,Row,Reason\n');
    expect(conversion.rejected.value).toEqual({ name: 'my kraken-rejected.csv', url: 'blob:2', size: 15 });
  });

  it('lists the problems the worker reports', async () => {
    const missing = message(MessageCode.missingColumn, { column: 'Pair' });
    await conversion.start(file, recipe, texts);
    lastWorker().reply({ type: 'failed', problems: [missing] });
    expect(conversion.state.value).toBe('failed');
    expect(conversion.problems.value).toEqual([missing]);

    await conversion.start(file, recipe, texts);
    expect(conversion.problems.value).toEqual([]);
  });

  it('fails with the message of a crashed worker as the detail and stops it', async () => {
    await conversion.start(file, recipe, texts);
    lastWorker().crash('Out of memory');
    expect(conversion.state.value).toBe('failed');
    expect(conversion.problems.value).toEqual([message(MessageCode.stoppedWithDetail, { detail: 'Out of memory' })]);
    expect(lastWorker().terminated).toBe(true);
  });

  it('says a new version is out when the worker script does not load, and stops it', async () => {
    await conversion.start(file, recipe, texts);
    lastWorker().failToLoad();
    expect(conversion.state.value).toBe('failed');
    expect(conversion.problems.value).toEqual([message(MessageCode.newVersion)]);
    expect(lastWorker().terminated).toBe(true);
  });

  it('fails without a detail when a crashed worker gives no message', async () => {
    await conversion.start(file, recipe, texts);
    lastWorker().crash('');
    expect(conversion.problems.value).toEqual([message(MessageCode.stopped)]);
  });

  it('fails when the converted file cannot be read back', async () => {
    await conversion.start(file, recipe, texts);
    lastWorker().reply({ type: 'done', stats: stats() });
    await vi.waitFor(() => expect(conversion.state.value).toBe('failed'));
    expect(conversion.problems.value).toEqual([message(MessageCode.stoppedWithDetail, { detail: 'trades.csv was not found.' })]);
  });

  it('still starts when old output cannot be cleared, leaving the worker to explain', async () => {
    storage.refuse = true;
    await conversion.start(file, recipe, texts);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(conversion.state.value).toBe('running');
  });

  it('cancels a running conversion', async () => {
    await conversion.start(file, recipe, texts);
    conversion.cancel();
    expect(lastWorker().terminated).toBe(true);
    expect(conversion.state.value).toBe('idle');
  });

  it('starts no worker when cancelled while old output is still being cleared', async () => {
    const starting = conversion.start(file, recipe, texts);
    conversion.cancel();
    await starting;
    expect(FakeWorker.instances).toHaveLength(0);
    expect(conversion.state.value).toBe('idle');
  });

  it('stays reset when reset while the finished files are read back', async () => {
    await conversion.start(file, recipe, texts);
    storage.files.set('trades.csv', 'Location\n');
    lastWorker().reply({ type: 'done', stats: stats() });
    conversion.reset();
    await vi.waitFor(() => expect(revoked).toEqual(['blob:1']));
    expect(conversion.state.value).toBe('idle');
    expect(conversion.outputs.value).toEqual([]);
  });

  it('stops the previous worker when started again', async () => {
    await conversion.start(file, recipe, texts);
    const first = lastWorker();
    await conversion.start(file, recipe, texts);
    expect(first.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('forgets the results and releases their links on reset', async () => {
    await conversion.start(file, recipe, texts);
    await finish('Location\n', 'a,b,Row,Reason\n');
    conversion.reset();
    expect(revoked).toEqual(['blob:1', 'blob:2']);
    expect(conversion.state.value).toBe('idle');
    expect(conversion.outputs.value).toEqual([]);
    expect(conversion.stats.value).toBeUndefined();
  });

  it('releases the links of the previous result when started again', async () => {
    await conversion.start(file, recipe, texts);
    await finish('Location\n');
    await conversion.start(file, recipe, texts);
    expect(revoked).toEqual(['blob:1']);
    expect(conversion.outputs.value).toEqual([]);
  });

  it('stops a running worker when its scope ends', async () => {
    await conversion.start(file, recipe, texts);
    scope.stop();
    expect(lastWorker().terminated).toBe(true);
  });

  it('releases the links of a finished conversion when its scope ends', async () => {
    await conversion.start(file, recipe, texts);
    await finish('Location\n');
    scope.stop();
    expect(revoked).toEqual(['blob:1']);
  });
});
