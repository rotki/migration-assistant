/// <reference lib="webworker" />
import { type ConversionStats, convertStream, type TextSink } from '@/modules/convert/convert-stream';
import { message, MessageCode, MessageError } from '@/modules/convert/messages';
import { type ConversionMessage, MessageType, OUTPUT_DIRECTORY, problemsOf, readStartConversion, type StartConversion } from '@/modules/convert/protocol';

declare const self: DedicatedWorkerGlobalScope;

/** Output is encoded and written in blocks of about this many characters. */
const BLOCK = 1 << 20;
const PROGRESS_INTERVAL = 100;

interface FileSink extends TextSink {
  close: () => void;
}

/** Writes to a file in the origin private file system, never holding more than a block. */
async function openSink(directory: FileSystemDirectoryHandle, name: string): Promise<FileSink> {
  const file = await directory.getFileHandle(name, { create: true });
  const handle = await file.createSyncAccessHandle();
  handle.truncate(0);
  const encoder = new TextEncoder();
  let parts: string[] = [];
  let length = 0;
  let offset = 0;

  function flush(): void {
    if (parts.length === 0)
      return;
    const bytes = encoder.encode(parts.join(''));
    offset += handle.write(bytes, { at: offset });
    parts = [];
    length = 0;
  }

  return {
    write(text: string): void {
      parts.push(text);
      length += text.length;
      if (length >= BLOCK)
        flush();
    },
    close(): void {
      flush();
      handle.flush();
      handle.close();
    },
  };
}

function post(message: ConversionMessage): void {
  self.postMessage(message);
}

function postFailure(error: unknown): void {
  post({ type: MessageType.failed, problems: problemsOf(error) });
}

/** Opens both output files, turning a refused storage request into an explanation. */
async function openSinks(outputName: string, rejectedName: string): Promise<[FileSink, FileSink]> {
  let output: FileSink | undefined;
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(OUTPUT_DIRECTORY, { create: true });
    output = await openSink(directory, outputName);
    return [output, await openSink(directory, rejectedName)];
  }
  catch (error) {
    // The first file's handle holds a lock until it is closed; the storage error is the one to report.
    try {
      output?.close();
    }
    catch {}
    throw new MessageError(message(MessageCode.noStorage), { cause: error });
  }
}

/** Closes every sink, even when one fails to, and rethrows the first failure. */
function closeAll(sinks: FileSink[]): void {
  const failures: unknown[] = [];
  for (const sink of sinks) {
    try {
      sink.close();
    }
    catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0)
    throw failures[0];
}

async function start({ file, recipe, outputName, rejectedName, texts }: StartConversion): Promise<void> {
  const [output, rejected] = await openSinks(outputName, rejectedName);
  let lastProgress = 0;

  let stats: ConversionStats;
  try {
    stats = await convertStream({
      stream: file.stream(),
      totalBytes: file.size,
      recipe,
      output,
      rejected,
      texts,
      onProgress(update: ConversionStats): void {
        const now = performance.now();
        if (now - lastProgress >= PROGRESS_INTERVAL) {
          lastProgress = now;
          post({ type: MessageType.progress, stats: update });
        }
      },
    });
  }
  catch (error) {
    // The conversion error is the one to report; a close failing after it would hide it.
    try {
      closeAll([output, rejected]);
    }
    catch {}
    throw error;
  }
  // Closing writes the last block, so a full disk can still fail the run here.
  closeAll([output, rejected]);
  post({ type: MessageType.done, stats });
}

/**
 * Starts a conversion from a validated request. The origin check is only there for CodeQL's
 * `js/missing-origin-check`: a dedicated worker hears only from the page that created it and its
 * message events carry an empty origin, so it never rejects anything. `readStartConversion` is
 * what protects the worker.
 */
function onMessage(event: MessageEvent<unknown>): void {
  const trustedOrigin = self.location.origin;
  if (event.origin && event.origin !== trustedOrigin) {
    return;
  }

  const request = readStartConversion(event.data);
  if (request.ok)
    start(request.value).catch(postFailure);
  else
    postFailure(new MessageError(request.error));
}

self.addEventListener('message', onMessage);
