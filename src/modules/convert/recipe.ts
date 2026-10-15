import { pipe } from 'plainfp';
import { build, err, field, flatMap, fromNullable, fromThrowable, map, ok, type Result } from 'plainfp/result';
import { type Delimiter, DELIMITERS, type Encoding, ENCODINGS } from '@/modules/csv/sniff';
import { getRotkiColumns, RotkiColumn, RotkiFormat } from '@/modules/rotki-format';
import { isValidTimeZone } from './dates';
import { type Message, message, MessageCode } from './messages';
import { DecimalSeparator } from './numbers';

/** Where a field takes its value from: a source column, a fixed value, or nowhere. */
export const SourceKind = {
  column: 'column',
  constant: 'constant',
  empty: 'empty',
} as const;

export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

export type ValueSource =
  | { kind: typeof SourceKind.column; column: string }
  | { kind: typeof SourceKind.constant; value: string }
  | { kind: typeof SourceKind.empty };

/** Mapping a value to this skips the whole row instead of converting it. */
export const SKIP_ROW = '__skip__';

export interface FieldMapping {
  source: ValueSource;
  /** Keeps one part of the value, as `BTC` from `BTC/EUR`. Negative parts count from the end. */
  split?: { separator: string; part: number };
  /** Replaces exact values, as `Buy` with `Deposit`, or with {@link SKIP_ROW}. */
  values?: Record<string, string>;
  /** Drops the sign of an amount. */
  absolute?: boolean;
}

/**
 * Everything needed to convert one exchange's export. Columns are referenced by header name,
 * so a recipe keeps working when the exchange reorders them.
 */
export interface Recipe {
  version: 1;
  name: string;
  input: { encoding: Encoding; delimiter: Delimiter; headerIndex: number };
  format: RotkiFormat;
  fields: Partial<Record<RotkiColumn, FieldMapping>>;
  /** Trades only: rows whose `column` holds one of `values` have spend and receive swapped. */
  swap?: { column: string; values: string[] };
  numbers: { decimalSeparator: DecimalSeparator };
  /** `format` is one of {@link parseDate}'s formats. */
  dates: { format: string; timeZone: string };
}

/** The columns that hold an amount moved, as opposed to the fee. */
export const MOVED_AMOUNT_COLUMNS = [RotkiColumn.amount, RotkiColumn.spendAmount, RotkiColumn.receiveAmount] as const;

export const AMOUNT_COLUMNS: ReadonlySet<RotkiColumn> = new Set([...MOVED_AMOUNT_COLUMNS, RotkiColumn.fee]);

const REQUIRED_COLUMNS: Record<RotkiFormat, readonly RotkiColumn[]> = {
  [RotkiFormat.trades]: [
    RotkiColumn.location,
    RotkiColumn.spendCurrency,
    RotkiColumn.spendAmount,
    RotkiColumn.receiveCurrency,
    RotkiColumn.receiveAmount,
    RotkiColumn.timestamp,
  ],
  [RotkiFormat.events]: [RotkiColumn.type, RotkiColumn.location, RotkiColumn.currency, RotkiColumn.amount, RotkiColumn.timestamp],
};

export function isRequiredColumn(format: RotkiFormat, column: RotkiColumn): boolean {
  return REQUIRED_COLUMNS[format].includes(column);
}

/** Keeps the part of a value a split asks for, as `BTC` from `BTC/EUR`; the value itself without a split. */
export function splitValue(value: string, split: FieldMapping['split']): string {
  if (!split || split.separator === '')
    return value;
  return value.split(split.separator).at(split.part) ?? '';
}

/**
 * What a value map replaces `value` with, if anything. Only the map's own entries count, so a
 * cell such as `constructor` is not read as an inherited object member.
 */
export function mappedValue(values: FieldMapping['values'], value: string): string | undefined {
  return values && Object.hasOwn(values, value) ? values[value] : undefined;
}

/** The source columns a recipe reads, for checking them against a file's header. */
export function referencedColumns(recipe: Recipe): string[] {
  const columns = new Set<string>();
  for (const column of getRotkiColumns(recipe.format)) {
    const source = recipe.fields[column]?.source;
    if (source?.kind === SourceKind.column)
      columns.add(source.column);
  }
  if (recipe.format === RotkiFormat.trades && recipe.swap)
    columns.add(recipe.swap.column);
  return [...columns];
}

/** What keeps a recipe from converting a file with this header; empty when nothing does. */
export function validateRecipe(recipe: Recipe, header: readonly string[]): Message[] {
  const problems: Message[] = [];
  for (const column of REQUIRED_COLUMNS[recipe.format]) {
    const source = recipe.fields[column]?.source;
    if (!source || source.kind === SourceKind.empty || (source.kind === SourceKind.constant && source.value.trim() === ''))
      problems.push(message(MessageCode.needsSource, { column }));
  }
  for (const column of referencedColumns(recipe)) {
    if (!header.includes(column))
      problems.push(message(MessageCode.missingColumn, { column }));
  }
  if (!isValidTimeZone(recipe.dates.timeZone))
    problems.push(message(MessageCode.unknownTimeZone, { timeZone: recipe.dates.timeZone }));
  return problems;
}

export function serializeRecipe(recipe: Recipe): string {
  return `${JSON.stringify(recipe, null, 2)}\n`;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function pick<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return options.find(option => option === value);
}

function readSource(value: unknown): ValueSource | undefined {
  if (!isObject(value))
    return undefined;
  if (value.kind === SourceKind.empty)
    return { kind: SourceKind.empty };
  const text = readString(value.kind === SourceKind.column ? value.column : value.value);
  if (text === undefined)
    return undefined;
  if (value.kind === SourceKind.column)
    return { kind: SourceKind.column, column: text };
  return value.kind === SourceKind.constant ? { kind: SourceKind.constant, value: text } : undefined;
}

function readMapping(value: unknown): FieldMapping | undefined {
  if (!isObject(value))
    return undefined;
  const source = readSource(value.source);
  if (!source)
    return undefined;
  const mapping: FieldMapping = { source };
  if (isObject(value.split) && typeof value.split.separator === 'string' && Number.isInteger(value.split.part))
    mapping.split = { separator: value.split.separator, part: Number(value.split.part) };
  if (isObject(value.values)) {
    mapping.values = Object.fromEntries(
      Object.entries(value.values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }
  if (value.absolute === true)
    mapping.absolute = true;
  return mapping;
}

function readInput(value: unknown): Recipe['input'] | undefined {
  if (!isObject(value) || !Number.isInteger(value.headerIndex))
    return undefined;
  const encoding = pick(ENCODINGS, value.encoding);
  const delimiter = pick(DELIMITERS, value.delimiter);
  return encoding && delimiter ? { encoding, delimiter, headerIndex: Number(value.headerIndex) } : undefined;
}

function readDates(value: unknown): Recipe['dates'] | undefined {
  if (!isObject(value))
    return undefined;
  const format = readString(value.format);
  const timeZone = readString(value.timeZone);
  return format !== undefined && timeZone !== undefined && isValidTimeZone(timeZone) ? { format, timeZone } : undefined;
}

function readFields(value: unknown, format: RotkiFormat): Recipe['fields'] {
  const fields: Recipe['fields'] = {};
  if (!isObject(value))
    return fields;
  for (const column of getRotkiColumns(format)) {
    const mapping = readMapping(value[column]);
    if (mapping)
      fields[column] = mapping;
  }
  return fields;
}

function readSwap(value: unknown): Recipe['swap'] {
  if (!isObject(value) || typeof value.column !== 'string' || !Array.isArray(value.values))
    return undefined;
  return { column: value.column, values: value.values.filter(item => typeof item === 'string') };
}

function readRecipeObject(json: unknown): Result<Record<string, unknown>, Message> {
  return isObject(json) && json.version === 1 ? ok(json) : err(message(MessageCode.notRecipe));
}

/**
 * Reads a recipe from untrusted data, keeping only the field mappings it recognises. Fails with
 * the reason when the data is not a recipe or misses a setting the converter cannot do without.
 */
export function readRecipe(data: unknown): Result<Recipe, Message> {
  return pipe(
    readRecipeObject(data),
    flatMap(value => pipe(
      build(),
      field('format', () => fromNullable(pick(Object.values(RotkiFormat), value.format), message(MessageCode.noFormat))),
      field('input', () => fromNullable(readInput(value.input), message(MessageCode.noInput))),
      field('dates', () => fromNullable(readDates(value.dates), message(MessageCode.noDates))),
      field('decimalSeparator', () => fromNullable(
        isObject(value.numbers) ? pick(Object.values(DecimalSeparator), value.numbers.decimalSeparator) : undefined,
        message(MessageCode.noDecimalSeparator),
      )),
      map(({ format, input, dates, decimalSeparator }): Recipe => {
        const recipe: Recipe = {
          version: 1,
          name: readString(value.name) ?? '',
          input,
          format,
          fields: readFields(value.fields, format),
          numbers: { decimalSeparator },
          dates,
        };
        const swap = readSwap(value.swap);
        if (swap)
          recipe.swap = swap;
        return recipe;
      }),
    )),
  );
}

/** Reads a saved recipe file. */
export function parseRecipe(text: string): Result<Recipe, Message> {
  return pipe(
    fromThrowable((): unknown => JSON.parse(text), () => message(MessageCode.notJson)),
    flatMap(readRecipe),
  );
}
