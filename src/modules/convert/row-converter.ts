import { pipe } from 'plainfp';
import { all, err, flatMap, map, match, ok, type Result } from 'plainfp/result';
import { getRotkiColumns, isRotkiEventType, ROTKI_LOCATIONS, RotkiColumn, RotkiFormat } from '@/modules/rotki-format';
import { parseDate } from './dates';
import { type Message, rejection, RejectionCode } from './messages';
import { absoluteDecimal, isNegativeDecimal, isZeroDecimal, normalizeDecimal } from './numbers';
import { AMOUNT_COLUMNS, type FieldMapping, isRequiredColumn, mappedValue, meetsAll, type Recipe, RecipeFormat, SKIP_ROW, SourceKind, splitValue, validateRecipe, type ValueSource } from './recipe';

/**
 * Where a rejection is fixed: in the column mapping, or in the date and number settings, as
 * for a date the chosen format does not read.
 */
export const RejectionCause = {
  mapping: 'mapping',
  format: 'format',
} as const;

export type RejectionCause = (typeof RejectionCause)[keyof typeof RejectionCause];

/** What became of a source record. */
export const RowKind = {
  converted: 'converted',
  skipped: 'skipped',
  rejected: 'rejected',
} as const;

export type RowKind = (typeof RowKind)[keyof typeof RowKind];

export interface Rejection {
  kind: typeof RowKind.rejected;
  reason: Message<RejectionCode>;
  column: RotkiColumn;
  cause: RejectionCause;
}

interface Skipped {
  kind: typeof RowKind.skipped;
}

export interface Converted {
  kind: typeof RowKind.converted;
  /** The rotki file the row belongs in; a recipe of format `both` writes some rows to each. */
  format: RotkiFormat;
  values: string[];
}

export type RowResult = Converted | Skipped | Rejection;

export type RowConverter = (record: readonly string[]) => RowResult;

/** Why a record does not become a rotki row: mapped to be skipped, or not convertible. */
type RowProblem = Skipped | Rejection;

const SKIPPED: Skipped = { kind: RowKind.skipped };

type Row = Map<RotkiColumn, string>;

const LOCATIONS: ReadonlySet<string> = new Set(ROTKI_LOCATIONS);

export class RecipeError extends Error {
  override name = 'RecipeError';

  constructor(readonly problems: Message[], options?: ErrorOptions) {
    super(problems.map(problem => problem.code).join(' '), options);
  }
}

function reject<T>(column: RotkiColumn, reason: Message<RejectionCode>, cause: RejectionCause = RejectionCause.mapping): Result<T, RowProblem> {
  return err({ kind: RowKind.rejected, reason, column, cause });
}

/** Reads a source column of a record by its header name. */
type Cell = (column: string) => string;

function sourceText(source: ValueSource, cell: Cell): string {
  if (source.kind === SourceKind.column)
    return cell(source.column);
  return source.kind === SourceKind.constant ? source.value : '';
}

/**
 * A mapping's value for a record: its source, or else the first fallback whose conditions hold
 * that gives a value, split and trimmed. Empty when none does.
 */
function mappingValue(mapping: FieldMapping, cell: Cell): string {
  const sources = [mapping.source, ...(mapping.fallbacks ?? []).filter(fallback => meetsAll(fallback.when, cell)).map(fallback => fallback.source)];
  for (const source of sources) {
    const value = splitValue(sourceText(source, cell), mapping.split).trim();
    if (value !== '')
      return value;
  }
  return '';
}

function convertAmount(column: RotkiColumn, raw: string, recipe: Recipe): Result<string, RowProblem> {
  const amount = normalizeDecimal(raw, recipe.numbers.decimalSeparator);
  if (amount === undefined)
    return reject(column, rejection(RejectionCode.amountNotNumber, { column, value: raw, separator: recipe.numbers.decimalSeparator }), RejectionCause.format);
  if (recipe.fields[column]?.absolute)
    return ok(absoluteDecimal(amount));
  if (isNegativeDecimal(amount))
    return reject(column, rejection(RejectionCode.amountNegative, { column, value: raw }));
  return ok(amount);
}

function convertTimestamp(raw: string, recipe: Recipe): Result<string, RowProblem> {
  const epoch = parseDate(raw, recipe.dates.format, recipe.dates.timeZone);
  if (epoch === undefined)
    return reject(RotkiColumn.timestamp, rejection(RejectionCode.timestampFormat, { value: raw, format: recipe.dates.format }), RejectionCause.format);
  return ok(String(epoch));
}

function convertLocation(raw: string): Result<string, RowProblem> {
  const location = raw.toLowerCase().replaceAll('_', ' ');
  return LOCATIONS.has(location) ? ok(location) : reject(RotkiColumn.location, rejection(RejectionCode.unknownLocation, { value: raw }));
}

function convertType(raw: string): Result<string, RowProblem> {
  return isRotkiEventType(raw) ? ok(raw) : reject(RotkiColumn.type, rejection(RejectionCode.unknownType, { value: raw }));
}

/** Leaves out a zero fee, which rotki would otherwise record as a fee event. */
function settleFee(row: Row): Result<Row, RowProblem> {
  const fee = row.get(RotkiColumn.fee) ?? '';
  if (fee === '' || isZeroDecimal(fee)) {
    row.set(RotkiColumn.fee, '');
    row.set(RotkiColumn.feeCurrency, '');
    return ok(row);
  }
  return row.get(RotkiColumn.feeCurrency) === '' ? reject(RotkiColumn.feeCurrency, rejection(RejectionCode.feeWithoutCurrency, { value: fee })) : ok(row);
}

function swapSides(row: Row): Row {
  const spendCurrency = row.get(RotkiColumn.spendCurrency) ?? '';
  const spendAmount = row.get(RotkiColumn.spendAmount) ?? '';
  row.set(RotkiColumn.spendCurrency, row.get(RotkiColumn.receiveCurrency) ?? '');
  row.set(RotkiColumn.spendAmount, row.get(RotkiColumn.receiveAmount) ?? '');
  row.set(RotkiColumn.receiveCurrency, spendCurrency);
  row.set(RotkiColumn.receiveAmount, spendAmount);
  return row;
}

/** The first place of each header name, so a source column is found without scanning the header per value. */
function headerIndexes(header: readonly string[]): ReadonlyMap<string, number> {
  const indexes = new Map<string, number>();
  for (const [index, name] of header.entries()) {
    if (!indexes.has(name))
      indexes.set(name, index);
  }
  return indexes;
}

/**
 * Builds the function that turns one source record into a rotki row. Throws a
 * {@link RecipeError} when the recipe cannot convert files with this header.
 */
export function createRowConverter(recipe: Recipe, header: readonly string[]): RowConverter {
  const problems = validateRecipe(recipe, header);
  if (problems.length > 0)
    throw new RecipeError(problems);

  const indexes = headerIndexes(header);
  const swapValues = new Set(recipe.swap?.values.map(value => value.trim().toLowerCase()) ?? []);

  /** The rotki file a record goes to: the recipe's own, or for `both`, trades when it meets the route. */
  function outputFor(cell: Cell): RotkiFormat {
    if (recipe.format !== RecipeFormat.both)
      return recipe.format;
    return meetsAll(recipe.route, cell) ? RotkiFormat.trades : RotkiFormat.events;
  }

  function rawValue(column: RotkiColumn, cell: Cell): Result<string, RowProblem> {
    const mapping = recipe.fields[column];
    if (!mapping)
      return ok('');
    const value = mappingValue(mapping, cell);
    const mapped = mappedValue(mapping.values, value);
    if (mapped === SKIP_ROW)
      return err(SKIPPED);
    return ok((mapped ?? value).trim());
  }

  function convertRaw(output: RotkiFormat, column: RotkiColumn, raw: string): Result<string, RowProblem> {
    if (raw === '')
      return isRequiredColumn(output, column) ? reject(column, rejection(RejectionCode.columnEmpty, { column })) : ok('');
    if (AMOUNT_COLUMNS.has(column))
      return convertAmount(column, raw, recipe);
    if (column === RotkiColumn.timestamp)
      return convertTimestamp(raw, recipe);
    if (column === RotkiColumn.location)
      return convertLocation(raw);
    return column === RotkiColumn.type ? convertType(raw) : ok(raw);
  }

  function isSell(output: RotkiFormat, cell: Cell): boolean {
    return output === RotkiFormat.trades && !!recipe.swap && swapValues.has(cell(recipe.swap.column).trim().toLowerCase());
  }

  /** A value mapped to skip skips the row, whatever else is wrong with it. */
  function collect(results: Result<string, RowProblem>[]): Result<string[], RowProblem> {
    const skipped = results.some(result => !result.ok && result.error.kind === RowKind.skipped);
    return skipped ? err(SKIPPED) : all(results);
  }

  return (record) => {
    const cell: Cell = column => record[indexes.get(column) ?? -1] ?? '';
    const output = outputFor(cell);
    const columns = getRotkiColumns(output);
    return pipe(
      collect(columns.map(column => pipe(rawValue(column, cell), flatMap(raw => convertRaw(output, column, raw))))),
      flatMap(values => settleFee(new Map(columns.map((column, index) => [column, values[index] ?? ''])))),
      map(row => (isSell(output, cell) ? swapSides(row) : row)),
      map(row => columns.map(column => row.get(column) ?? '')),
      match<string[], RowProblem, RowResult>({
        ok: values => ({ kind: RowKind.converted, format: output, values }),
        err: problem => problem,
      }),
    );
  };
}
