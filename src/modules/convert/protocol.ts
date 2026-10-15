import type { ConversionStats } from './convert-stream';
import { pipe } from 'plainfp';
import { err, map, type Result } from 'plainfp/result';
import { isObject, readRecipe, type Recipe } from './recipe';

/** The folder in the origin private file system that holds conversion output. */
export const OUTPUT_DIRECTORY = 'conversions';

/** The messages between the page and the conversion worker. */
export const MessageType = {
  start: 'start',
  progress: 'progress',
  done: 'done',
  failed: 'failed',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export interface StartConversion {
  type: typeof MessageType.start;
  file: Blob;
  recipe: Recipe;
  outputName: string;
  rejectedName: string;
}

/** Output files are plain names inside {@link OUTPUT_DIRECTORY}, never paths. */
const OUTPUT_NAME = /^[\w.-]+\.csv$/;

/**
 * Reads a start request posted to the worker. A dedicated worker only hears from the page that
 * created it, so the origin is not what protects it; the data is treated as untrusted.
 */
export function readStartConversion(data: unknown): Result<StartConversion, string> {
  if (!isObject(data))
    return err('The conversion request is not an object.');
  const { type, file, recipe, outputName, rejectedName } = data;
  if (type !== MessageType.start)
    return err('The conversion request has an unknown type.');
  if (!(file instanceof Blob))
    return err('The conversion request carries no file.');
  if (typeof outputName !== 'string' || typeof rejectedName !== 'string' || !OUTPUT_NAME.test(outputName) || !OUTPUT_NAME.test(rejectedName) || outputName === rejectedName)
    return err('The conversion request names invalid output files.');
  return pipe(
    readRecipe(recipe),
    map((read): StartConversion => ({ type, file, recipe: read, outputName, rejectedName })),
  );
}

export type ConversionMessage =
  | { type: typeof MessageType.progress; stats: ConversionStats }
  | { type: typeof MessageType.done; stats: ConversionStats }
  | { type: typeof MessageType.failed; message: string; problems: string[] };
