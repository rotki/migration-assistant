import type { ConversionStats } from './convert-stream';
import { pipe } from 'plainfp';
import { err, map, type Result } from 'plainfp/result';
import { RotkiFormat } from '@/modules/rotki-format';
import { byRejectionCode, type Message, message, MessageCode, MessageError, type RejectedFileTexts } from './messages';
import { isObject, readRecipe, type Recipe } from './recipe';
import { RecipeError } from './row-converter';

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
  /** A file name per rotki format; the worker writes the ones the recipe's format needs. */
  outputNames: Record<RotkiFormat, string>;
  rejectedName: string;
  /** The rejected file's texts in the page's language; the worker builds no text of its own. */
  texts: RejectedFileTexts;
}

/** Output files are plain names inside {@link OUTPUT_DIRECTORY}, never paths. */
const OUTPUT_NAME = /^[\w.-]+\.csv$/;

function allText<K extends string>(record: Record<K, unknown>): record is Record<K, string> {
  return Object.values(record).every(text => typeof text === 'string');
}

function readTexts(value: unknown): RejectedFileTexts | undefined {
  if (!isObject(value) || !isObject(value.reasons) || !isObject(value.shown) || typeof value.row !== 'string' || typeof value.reason !== 'string')
    return undefined;
  const { reasons, shown } = value;
  const read = byRejectionCode(code => reasons[code]);
  return allText(read) && allText(shown) ? { reasons: read, shown, row: value.row, reason: value.reason } : undefined;
}

/**
 * Reads a start request posted to the worker. A dedicated worker only hears from the page that
 * created it, so the origin is not what protects it; the data is treated as untrusted.
 */
export function readStartConversion(data: unknown): Result<StartConversion, Message> {
  if (!isObject(data))
    return err(message(MessageCode.requestNotObject));
  const { type, file, recipe, rejectedName } = data;
  if (type !== MessageType.start)
    return err(message(MessageCode.requestUnknownType));
  if (!(file instanceof Blob))
    return err(message(MessageCode.requestNoFile));
  const outputNames = readOutputNames(data.outputNames);
  if (!outputNames || typeof rejectedName !== 'string' || !distinctFileNames([...Object.values(outputNames), rejectedName]))
    return err(message(MessageCode.requestInvalidOutput));
  const texts = readTexts(data.texts);
  if (!texts)
    return err(message(MessageCode.requestInvalidTexts));
  return pipe(
    readRecipe(recipe),
    map((read): StartConversion => ({ type, file, recipe: read, outputNames, rejectedName, texts })),
  );
}

function readOutputNames(value: unknown): Record<RotkiFormat, string> | undefined {
  if (!isObject(value))
    return undefined;
  const { trades, events } = value;
  return typeof trades === 'string' && typeof events === 'string' ? { [RotkiFormat.trades]: trades, [RotkiFormat.events]: events } : undefined;
}

/** Plain `.csv` names, none used twice, so no output overwrites another. */
function distinctFileNames(names: readonly string[]): boolean {
  return names.every(name => OUTPUT_NAME.test(name)) && new Set(names).size === names.length;
}

/**
 * Why a conversion stopped, as messages to translate. A browser error that is not one of ours
 * keeps its own text as the detail.
 */
export function problemsOf(error: unknown): Message[] {
  if (error instanceof RecipeError)
    return error.problems;
  if (error instanceof MessageError)
    return [error.problem];
  if (error instanceof Error && error.message !== '')
    return [message(MessageCode.stoppedWithDetail, { detail: error.message })];
  return [message(MessageCode.stopped)];
}

export type ConversionMessage =
  | { type: typeof MessageType.progress; stats: ConversionStats }
  | { type: typeof MessageType.done; stats: ConversionStats }
  | { type: typeof MessageType.failed; problems: Message[] };
