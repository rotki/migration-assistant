import type { ConversionStats } from './convert-stream';
import { onScopeDispose, readonly, type Ref, shallowRef } from 'vue';
import { RotkiFormat } from '@/modules/rotki-format';
import { type Message, message, MessageCode, MessageError, type RejectedFileTexts } from './messages';
import { type ConversionMessage, MessageType, OUTPUT_DIRECTORY, problemsOf, type StartConversion } from './protocol';
import { outputFormats, parseRecipe, type Recipe, serializeRecipe } from './recipe';

export interface ConversionOutput {
  name: string;
  url: string;
  size: number;
}

/** A converted file, with the rotki format it is in, for the Custom Import tab it goes to. */
export interface ConvertedOutput extends ConversionOutput {
  format: RotkiFormat;
}

export const ConversionState = {
  idle: 'idle',
  running: 'running',
  done: 'done',
  failed: 'failed',
} as const;

export type ConversionState = (typeof ConversionState)[keyof typeof ConversionState];

export interface Conversion {
  state: Readonly<Ref<ConversionState>>;
  stats: Readonly<Ref<ConversionStats | undefined>>;
  /** Why the last run failed, as messages for the page to translate. */
  problems: Readonly<Ref<readonly Message[]>>;
  /** The converted files, one per rotki format the run wrote rows in. */
  outputs: Readonly<Ref<readonly ConvertedOutput[]>>;
  rejected: Readonly<Ref<ConversionOutput | undefined>>;
  /** `texts` are the rejected file's headers and reasons in the page's language. */
  start: (file: File, recipe: Recipe, texts: RejectedFileTexts) => Promise<void>;
  cancel: () => void;
  /** Stops any run and forgets its results, for converting another file. */
  reset: () => void;
}

async function outputDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OUTPUT_DIRECTORY, { create: true });
}

/**
 * Removes the output of earlier conversions, which would otherwise stay in the browser. A
 * browser that refuses storage is left for the worker to explain.
 */
async function clearOutput(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OUTPUT_DIRECTORY, { recursive: true });
  }
  catch {}
}

export interface DownloadNames {
  outputs: Record<RotkiFormat, string>;
  rejected: string;
}

/** The names the converted and rejected files download as, from the recipe name or the file's. */
export function downloadNames(recipe: Pick<Recipe, 'name'>, fileName: string): DownloadNames {
  const base = recipe.name.trim() || fileName.replace(/\.[^.]+$/, '');
  return {
    outputs: { [RotkiFormat.trades]: `${base}-rotki-trades.csv`, [RotkiFormat.events]: `${base}-rotki-events.csv` },
    rejected: `${base}-rejected.csv`,
  };
}

/** The names the worker writes in the output folder; the user never sees them. */
const WORKER_NAMES: StartConversion['outputNames'] = { [RotkiFormat.trades]: 'trades.csv', [RotkiFormat.events]: 'events.csv' };

async function readOutput(fileName: string, downloadName: string): Promise<ConversionOutput> {
  const file = await (await (await outputDirectory()).getFileHandle(fileName)).getFile();
  return { name: downloadName, url: URL.createObjectURL(file), size: file.size };
}

/**
 * The files a finished run offers: every file of a single-format recipe, even empty, and for
 * `both` only the files that got rows, so nobody imports an empty file.
 */
function offeredFormats(recipe: Recipe, stats: ConversionStats): RotkiFormat[] {
  const formats = outputFormats(recipe.format);
  return formats.length === 1 ? [...formats] : formats.filter(format => stats.convertedByFormat[format] > 0);
}

/**
 * What a worker's `error` event means. An error thrown inside the worker arrives as an
 * `ErrorEvent` with its message. A plain `Event` means the worker script itself did not load,
 * which after a deployment is a tab still running the previous release.
 */
function workerError(event: Event): Error {
  if (event instanceof ErrorEvent)
    return new Error(event.message);
  return new MessageError(message(MessageCode.newVersion));
}

/** Runs a conversion in a worker and exposes its progress and the files it wrote. */
export function useConversion(): Conversion {
  const state = shallowRef<ConversionState>(ConversionState.idle);
  const stats = shallowRef<ConversionStats>();
  const problems = shallowRef<Message[]>([]);
  const outputs = shallowRef<ConvertedOutput[]>([]);
  const rejected = shallowRef<ConversionOutput>();
  let worker: Worker | undefined;
  /** Bumped by every cancel, so a run that was waiting when it was cancelled stops on its own. */
  let run = 0;

  function revoke(items: readonly (ConversionOutput | undefined)[]): void {
    for (const item of items) {
      if (item)
        URL.revokeObjectURL(item.url);
    }
  }

  function releaseUrls(): void {
    revoke([...outputs.value, rejected.value]);
    outputs.value = [];
    rejected.value = undefined;
  }

  function cancel(): void {
    run++;
    worker?.terminate();
    worker = undefined;
    if (state.value === ConversionState.running)
      state.value = ConversionState.idle;
  }

  function reset(): void {
    cancel();
    releaseUrls();
    stats.value = undefined;
    problems.value = [];
    state.value = ConversionState.idle;
  }

  function fail(reason: unknown): void {
    problems.value = problemsOf(reason);
    state.value = ConversionState.failed;
  }

  async function collect(request: StartConversion, names: DownloadNames, finished: ConversionStats, ownRun: number): Promise<void> {
    const [converted, rejectedRows] = await Promise.all([
      Promise.all(offeredFormats(request.recipe, finished).map(async (format): Promise<ConvertedOutput> => ({
        ...await readOutput(request.outputNames[format], names.outputs[format]),
        format,
      }))),
      finished.rejected > 0 ? readOutput(request.rejectedName, names.rejected) : undefined,
    ]);
    if (ownRun !== run) {
      revoke([...converted, rejectedRows]);
      return;
    }
    outputs.value = converted;
    rejected.value = rejectedRows;
    state.value = ConversionState.done;
  }

  async function launch(file: File, recipe: Recipe, texts: RejectedFileTexts): Promise<void> {
    const ownRun = run;
    await clearOutput();
    if (ownRun !== run)
      return;

    // A reactive recipe cannot be posted to a worker; the serialized round trip is plain data.
    const parsed = parseRecipe(serializeRecipe(recipe));
    if (!parsed.ok)
      throw new MessageError(parsed.error);
    const plain = parsed.value;
    const names = downloadNames(plain, file.name);
    const request: StartConversion = {
      type: MessageType.start,
      file,
      recipe: plain,
      outputNames: WORKER_NAMES,
      rejectedName: 'rejected.csv',
      texts,
    };

    const current = new Worker(new URL('../../workers/convert.worker.ts', import.meta.url), { type: 'module' });
    worker = current;
    current.addEventListener('message', (event: MessageEvent<ConversionMessage>) => {
      const reply = event.data;
      if (ownRun !== run)
        return;
      if (reply.type === MessageType.progress) {
        stats.value = reply.stats;
        return;
      }
      current.terminate();
      worker = undefined;
      if (reply.type === MessageType.failed) {
        problems.value = reply.problems;
        state.value = ConversionState.failed;
        return;
      }
      stats.value = reply.stats;
      collect(request, names, reply.stats, ownRun).catch((error: unknown) => {
        if (ownRun === run)
          fail(error);
      });
    });
    current.addEventListener('error', (event: Event) => {
      fail(workerError(event));
      cancel();
    });
    current.postMessage(request);
  }

  async function start(file: File, recipe: Recipe, texts: RejectedFileTexts): Promise<void> {
    cancel();
    releaseUrls();
    problems.value = [];
    stats.value = undefined;
    state.value = ConversionState.running;
    try {
      await launch(file, recipe, texts);
    }
    catch (error) {
      cancel();
      fail(error);
    }
  }

  onScopeDispose(() => {
    cancel();
    releaseUrls();
  });

  return {
    state: readonly(state),
    stats: readonly(stats),
    problems: readonly(problems),
    outputs: readonly(outputs),
    rejected: readonly(rejected),
    start,
    cancel,
    reset,
  };
}
