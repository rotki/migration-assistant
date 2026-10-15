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

/** How a {@link Condition} tests a source column's value; values are compared trimmed. */
export const ConditionKind = {
  filled: 'filled',
  empty: 'empty',
  oneOf: 'one_of',
} as const;

export type ConditionKind = (typeof ConditionKind)[keyof typeof ConditionKind];

/** A test on one source column of a row. Where a recipe takes a list, every condition must hold. */
export type Condition =
  | { kind: typeof ConditionKind.filled; column: string }
  | { kind: typeof ConditionKind.empty; column: string }
  | { kind: typeof ConditionKind.oneOf; column: string; values: string[] };

/** A source to try when the field's own source gives an empty value, if its conditions hold. */
export interface Fallback {
  when?: Condition[];
  source: ValueSource;
}

export interface FieldMapping {
  source: ValueSource;
  /**
   * Tried in order when `source` gives an empty value, as `Sent Currency` for a row with no
   * `Received Currency`. The first whose conditions hold and whose value is not empty is used,
   * with the same split, value table and sign handling as `source`.
   */
  fallbacks?: Fallback[];
  /** Keeps one part of the value, as `BTC` from `BTC/EUR`. Negative parts count from the end. */
  split?: { separator: string; part: number };
  /** Replaces exact values, as `Buy` with `Deposit`, or with {@link SKIP_ROW}. */
  values?: Record<string, string>;
  /** Drops the sign of an amount. */
  absolute?: boolean;
}

/**
 * What a recipe writes: one of rotki's generic formats, or both from one file, as for the exports
 * of other tax tools where each row sends, receives or swaps.
 */
export const RecipeFormat = {
  ...RotkiFormat,
  both: 'both',
} as const;

export type RecipeFormat = (typeof RecipeFormat)[keyof typeof RecipeFormat];

/** The rotki files a recipe of this format writes. */
export function outputFormats(format: RecipeFormat): readonly RotkiFormat[] {
  return format === RecipeFormat.both ? [RotkiFormat.trades, RotkiFormat.events] : [format];
}

/**
 * The one rotki file a column ends up in for a recipe of this format, or `undefined` when every
 * file it writes has the column, as Fee and Timestamp in `both`.
 */
export function columnOutput(format: RecipeFormat, column: RotkiColumn): RotkiFormat | undefined {
  const outputs = outputFormats(format).filter(output => getRotkiColumns(output).includes(column));
  return outputs.length === 1 ? outputs[0] : undefined;
}

/** The columns a recipe of this format maps: those of every file it writes, each once. */
export function recipeColumns(format: RecipeFormat): readonly RotkiColumn[] {
  return [...new Set(outputFormats(format).flatMap(output => getRotkiColumns(output)))];
}

/**
 * Everything needed to convert one exchange's export. Columns are referenced by header name,
 * so a recipe keeps working when the exchange reorders them.
 */
export interface Recipe {
  version: 2;
  name: string;
  input: { encoding: Encoding; delimiter: Delimiter; headerIndex: number };
  format: RecipeFormat;
  fields: Partial<Record<RotkiColumn, FieldMapping>>;
  /** Both only: a row that meets every condition becomes a trade, any other row an event. */
  route?: Condition[];
  /** Trades only: rows whose `column` holds one of `values` have spend and receive swapped. */
  swap?: { column: string; values: string[] };
  numbers: { decimalSeparator: DecimalSeparator };
  /** `format` is one of {@link parseDate}'s formats. */
  dates: { format: string; timeZone: string };
}

/** Whether a row's value in `column` meets `condition`; `value` reads a source column of the row. */
export function meetsCondition(condition: Condition, value: (column: string) => string): boolean {
  const text = value(condition.column).trim();
  if (condition.kind === ConditionKind.filled)
    return text !== '';
  if (condition.kind === ConditionKind.empty)
    return text === '';
  return condition.values.some(option => option.trim() === text);
}

export function meetsAll(conditions: readonly Condition[] | undefined, value: (column: string) => string): boolean {
  return (conditions ?? []).every(condition => meetsCondition(condition, value));
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

/** Whether a column needs a value, in a file of this format or in any file a recipe of this format writes. */
export function isRequiredColumn(format: RecipeFormat, column: RotkiColumn): boolean {
  return outputFormats(format).some(output => REQUIRED_COLUMNS[output].includes(column));
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

function conditionColumns(conditions: readonly Condition[] | undefined): string[] {
  return (conditions ?? []).map(condition => condition.column);
}

/** The source columns a mapping reads: its source, its fallbacks and what their conditions test. */
function mappingColumns(mapping: FieldMapping): string[] {
  return [mapping.source, ...(mapping.fallbacks ?? []).map(fallback => fallback.source)]
    .flatMap(source => (source.kind === SourceKind.column ? [source.column] : []))
    .concat((mapping.fallbacks ?? []).flatMap(fallback => conditionColumns(fallback.when)));
}

/** The source columns a recipe reads, for checking them against a file's header. */
export function referencedColumns(recipe: Recipe): string[] {
  const columns = new Set<string>();
  for (const column of recipeColumns(recipe.format)) {
    const mapping = recipe.fields[column];
    for (const name of mapping ? mappingColumns(mapping) : [])
      columns.add(name);
  }
  if (outputFormats(recipe.format).includes(RotkiFormat.trades) && recipe.swap)
    columns.add(recipe.swap.column);
  if (recipe.format === RecipeFormat.both) {
    for (const column of conditionColumns(recipe.route))
      columns.add(column);
  }
  return [...columns];
}

function givesValue(source: ValueSource): boolean {
  return source.kind === SourceKind.column || (source.kind === SourceKind.constant && source.value.trim() !== '');
}

/** Whether a mapping can give a value at all, from its source or a fallback. */
function hasSource(mapping: FieldMapping | undefined): boolean {
  return !!mapping && [mapping.source, ...(mapping.fallbacks ?? []).map(fallback => fallback.source)].some(givesValue);
}

/** What keeps a recipe from converting a file with this header; empty when nothing does. */
export function validateRecipe(recipe: Recipe, header: readonly string[]): Message[] {
  const problems: Message[] = [];
  for (const column of recipeColumns(recipe.format)) {
    if (isRequiredColumn(recipe.format, column) && !hasSource(recipe.fields[column]))
      problems.push(message(MessageCode.needsSource, { column }));
  }
  if (recipe.format === RecipeFormat.both && (recipe.route ?? []).length === 0)
    problems.push(message(MessageCode.needsRoute));
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

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function readCondition(value: unknown): Condition | undefined {
  if (!isObject(value) || typeof value.column !== 'string')
    return undefined;
  const { column } = value;
  if (value.kind === ConditionKind.filled || value.kind === ConditionKind.empty)
    return { kind: value.kind, column };
  return value.kind === ConditionKind.oneOf ? { kind: ConditionKind.oneOf, column, values: readStrings(value.values) } : undefined;
}

/** Conditions that all have to hold; a list with one unreadable entry is dropped whole, not loosened. */
function readConditions(value: unknown): Condition[] | undefined {
  if (!Array.isArray(value))
    return undefined;
  const conditions = value.map(readCondition);
  return conditions.every(condition => condition !== undefined) ? conditions : undefined;
}

function readFallbacks(value: unknown): Fallback[] {
  if (!Array.isArray(value))
    return [];
  return value.flatMap((item) => {
    if (!isObject(item))
      return [];
    const source = readSource(item.source);
    if (!source)
      return [];
    if (item.when === undefined)
      return [{ source }];
    const when = readConditions(item.when);
    return when ? [{ when, source }] : [];
  });
}

function readMapping(value: unknown): FieldMapping | undefined {
  if (!isObject(value))
    return undefined;
  const source = readSource(value.source);
  if (!source)
    return undefined;
  const mapping: FieldMapping = { source };
  const fallbacks = readFallbacks(value.fallbacks);
  if (fallbacks.length > 0)
    mapping.fallbacks = fallbacks;
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

function readFields(value: unknown, format: RecipeFormat): Recipe['fields'] {
  const fields: Recipe['fields'] = {};
  if (!isObject(value))
    return fields;
  for (const column of recipeColumns(format)) {
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

/** Recipe file versions this app reads. Version 1 is version 2 without conditions, fallbacks or `both`. */
const READABLE_VERSIONS: readonly unknown[] = [1, 2];

function readRecipeObject(json: unknown): Result<Record<string, unknown>, Message> {
  return isObject(json) && READABLE_VERSIONS.includes(json.version) ? ok(json) : err(message(MessageCode.notRecipe));
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
      field('format', () => fromNullable(pick(Object.values(RecipeFormat), value.format), message(MessageCode.noFormat))),
      field('input', () => fromNullable(readInput(value.input), message(MessageCode.noInput))),
      field('dates', () => fromNullable(readDates(value.dates), message(MessageCode.noDates))),
      field('decimalSeparator', () => fromNullable(
        isObject(value.numbers) ? pick(Object.values(DecimalSeparator), value.numbers.decimalSeparator) : undefined,
        message(MessageCode.noDecimalSeparator),
      )),
      map(({ format, input, dates, decimalSeparator }): Recipe => {
        const recipe: Recipe = {
          version: 2,
          name: readString(value.name) ?? '',
          input,
          format,
          fields: readFields(value.fields, format),
          numbers: { decimalSeparator },
          dates,
        };
        const route = format === RecipeFormat.both ? readConditions(value.route) : undefined;
        if (route)
          recipe.route = route;
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
