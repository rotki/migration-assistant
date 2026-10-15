import type { ConversionStats } from './convert-stream';
import { onScopeDispose, readonly, type Ref, shallowRef } from 'vue';
import { type ConversionMessage, MessageType, OUTPUT_DIRECTORY, type StartConversion } from './protocol';
import { parseRecipe, type Recipe, serializeRecipe } from './recipe';

export interface ConversionOutput {
  name: string;
  url: string;
  size: number;
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
  problems: Readonly<Ref<readonly string[]>>;
  output: Readonly<Ref<ConversionOutput | undefined>>;
  rejected: Readonly<Ref<ConversionOutput | undefined>>;
  start: (file: File, recipe: Recipe) => Promise<void>;
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
  output: string;
  rejected: string;
}

/** The names the converted and rejected files download as, from the recipe name or the file's. */
export function downloadNames(recipe: Pick<Recipe, 'name' | 'format'>, fileName: string): DownloadNames {
  const base = recipe.name.trim() || fileName.replace(/\.[^.]+$/, '');
  return { output: `${base}-rotki-${recipe.format}.csv`, rejected: `${base}-rejected.csv` };
}

async function readOutput(fileName: string, downloadName: string): Promise<ConversionOutput> {
  const file = await (await (await outputDirectory()).getFileHandle(fileName)).getFile();
  return { name: downloadName, url: URL.createObjectURL(file), size: file.size };
}

/** Runs a conversion in a worker and exposes its progress and the files it wrote. */
export function useConversion(): Conversion {
  const state = shallowRef<ConversionState>(ConversionState.idle);
  const stats = shallowRef<ConversionStats>();
  const problems = shallowRef<string[]>([]);
  const output = shallowRef<ConversionOutput>();
  const rejected = shallowRef<ConversionOutput>();
  let worker: Worker | undefined;
  /** Bumped by every cancel, so a run that was waiting when it was cancelled stops on its own. */
  let run = 0;

  function releaseUrls(): void {
    for (const item of [output.value, rejected.value]) {
      if (item)
        URL.revokeObjectURL(item.url);
    }
    output.value = undefined;
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
    problems.value = [reason instanceof Error ? reason.message : 'The conversion stopped unexpectedly.'];
    state.value = ConversionState.failed;
  }

  async function collect(request: StartConversion, names: DownloadNames, hasRejected: boolean, ownRun: number): Promise<void> {
    const [converted, rejectedRows] = await Promise.all([
      readOutput(request.outputName, names.output),
      hasRejected ? readOutput(request.rejectedName, names.rejected) : undefined,
    ]);
    if (ownRun !== run) {
      URL.revokeObjectURL(converted.url);
      if (rejectedRows)
        URL.revokeObjectURL(rejectedRows.url);
      return;
    }
    output.value = converted;
    rejected.value = rejectedRows;
    state.value = ConversionState.done;
  }

  async function launch(file: File, recipe: Recipe): Promise<void> {
    const ownRun = run;
    await clearOutput();
    if (ownRun !== run)
      return;

    // A reactive recipe cannot be posted to a worker; the serialized round trip is plain data.
    const parsed = parseRecipe(serializeRecipe(recipe));
    if (!parsed.ok)
      throw new Error(parsed.error);
    const plain = parsed.value;
    const names = downloadNames(plain, file.name);
    const request: StartConversion = {
      type: MessageType.start,
      file,
      recipe: plain,
      outputName: 'converted.csv',
      rejectedName: 'rejected.csv',
    };

    const current = new Worker(new URL('../../workers/convert.worker.ts', import.meta.url), { type: 'module' });
    worker = current;
    current.addEventListener('message', (event: MessageEvent<ConversionMessage>) => {
      const message = event.data;
      if (ownRun !== run)
        return;
      if (message.type === MessageType.progress) {
        stats.value = message.stats;
        return;
      }
      current.terminate();
      worker = undefined;
      if (message.type === MessageType.failed) {
        problems.value = message.problems.length > 0 ? message.problems : [message.message];
        state.value = ConversionState.failed;
        return;
      }
      stats.value = message.stats;
      collect(request, names, message.stats.rejected > 0, ownRun).catch((error: unknown) => {
        if (ownRun === run)
          fail(error);
      });
    });
    current.addEventListener('error', (event) => {
      fail(new Error(event.message || 'The conversion stopped unexpectedly.'));
      cancel();
    });
    current.postMessage(request);
  }

  async function start(file: File, recipe: Recipe): Promise<void> {
    cancel();
    releaseUrls();
    problems.value = [];
    stats.value = undefined;
    state.value = ConversionState.running;
    try {
      await launch(file, recipe);
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
    output: readonly(output),
    rejected: readonly(rejected),
    start,
    cancel,
    reset,
  };
}
