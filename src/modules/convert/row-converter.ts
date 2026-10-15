import { pipe } from 'plainfp';
import { all, err, flatMap, map, match, ok, type Result } from 'plainfp/result';
import { getRotkiColumns, isRotkiEventType, ROTKI_LOCATIONS, RotkiColumn, RotkiFormat } from '@/modules/rotki-format';
import { describeDateFormat, parseDate } from './dates';
import { absoluteDecimal, DecimalSeparator, isNegativeDecimal, isZeroDecimal, normalizeDecimal } from './numbers';
import { AMOUNT_COLUMNS, type FieldMapping, isRequiredColumn, mappedValue, type Recipe, SKIP_ROW, SourceKind, splitValue, validateRecipe } from './recipe';

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
  reason: string;
  column: RotkiColumn;
  cause: RejectionCause;
}

interface Skipped {
  kind: typeof RowKind.skipped;
}

export type RowResult =
  | { kind: typeof RowKind.converted; values: string[] }
  | Skipped
  | Rejection;

export type RowConverter = (record: readonly string[]) => RowResult;

/** Why a record does not become a rotki row: mapped to be skipped, or not convertible. */
type RowProblem = Skipped | Rejection;

const SKIPPED: Skipped = { kind: RowKind.skipped };

type Row = Map<RotkiColumn, string>;

const LOCATIONS: ReadonlySet<string> = new Set(ROTKI_LOCATIONS);

export class RecipeError extends Error {
  override name = 'RecipeError';

  constructor(readonly problems: string[], options?: ErrorOptions) {
    super(problems.join(' '), options);
  }
}

function reject<T>(column: RotkiColumn, reason: string, cause: RejectionCause = RejectionCause.mapping): Result<T, RowProblem> {
  return err({ kind: RowKind.rejected, reason, column, cause });
}

/** Reads a mapping's source from a record; `index` is its source column's place in the header. */
function sourceValue(mapping: FieldMapping, record: readonly string[], index: number): string {
  const { source } = mapping;
  if (source.kind === SourceKind.column)
    return record[index] ?? '';
  return source.kind === SourceKind.constant ? source.value : '';
}

function convertAmount(column: RotkiColumn, raw: string, recipe: Recipe): Result<string, RowProblem> {
  const amount = normalizeDecimal(raw, recipe.numbers.decimalSeparator);
  if (amount === undefined)
    return reject(column, `${column} "${raw}" is not a number with the ${recipe.numbers.decimalSeparator === DecimalSeparator.comma ? 'comma' : 'dot'} decimal separator.`, RejectionCause.format);
  if (recipe.fields[column]?.absolute)
    return ok(absoluteDecimal(amount));
  if (isNegativeDecimal(amount))
    return reject(column, `${column} "${raw}" is negative; turn on "Ignore the sign" for it.`);
  return ok(amount);
}

function convertTimestamp(raw: string, recipe: Recipe): Result<string, RowProblem> {
  const epoch = parseDate(raw, recipe.dates.format, recipe.dates.timeZone);
  if (epoch === undefined)
    return reject(RotkiColumn.timestamp, `Timestamp "${raw}" does not match the date format ${describeDateFormat(recipe.dates.format)}.`, RejectionCause.format);
  return ok(String(epoch));
}

function convertLocation(raw: string): Result<string, RowProblem> {
  const location = raw.toLowerCase().replaceAll('_', ' ');
  return LOCATIONS.has(location) ? ok(location) : reject(RotkiColumn.location, `Location "${raw}" is not a rotki location.`);
}

function convertType(raw: string): Result<string, RowProblem> {
  return isRotkiEventType(raw) ? ok(raw) : reject(RotkiColumn.type, `Type "${raw}" is not a rotki event type; map it to one or skip it.`);
}

/** Leaves out a zero fee, which rotki would otherwise record as a fee event. */
function settleFee(row: Row): Result<Row, RowProblem> {
  const fee = row.get(RotkiColumn.fee) ?? '';
  if (fee === '' || isZeroDecimal(fee)) {
    row.set(RotkiColumn.fee, '');
    row.set(RotkiColumn.feeCurrency, '');
    return ok(row);
  }
  return row.get(RotkiColumn.feeCurrency) === '' ? reject(RotkiColumn.feeCurrency, `Fee "${fee}" has no Fee Currency.`) : ok(row);
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

const toRowResult = match<string[], RowProblem, RowResult>({
  ok: values => ({ kind: RowKind.converted, values }),
  err: problem => problem,
});

/**
 * Builds the function that turns one source record into a rotki row. Throws a
 * {@link RecipeError} when the recipe cannot convert files with this header.
 */
export function createRowConverter(recipe: Recipe, header: readonly string[]): RowConverter {
  const problems = validateRecipe(recipe, header);
  if (problems.length > 0)
    throw new RecipeError(problems);

  const columns = getRotkiColumns(recipe.format);
  const swapIndex = recipe.format === RotkiFormat.trades && recipe.swap ? header.indexOf(recipe.swap.column) : -1;
  const swapValues = new Set(recipe.swap?.values.map(value => value.trim().toLowerCase()) ?? []);
  // Looked up once here, not per record: the header does not change while a file converts.
  const sourceIndexes = new Map(columns.map((column) => {
    const source = recipe.fields[column]?.source;
    return [column, source?.kind === SourceKind.column ? header.indexOf(source.column) : -1];
  }));

  function rawValue(column: RotkiColumn, record: readonly string[]): Result<string, RowProblem> {
    const mapping = recipe.fields[column];
    if (!mapping)
      return ok('');
    const value = splitValue(sourceValue(mapping, record, sourceIndexes.get(column) ?? -1), mapping.split).trim();
    const mapped = mappedValue(mapping.values, value);
    if (mapped === SKIP_ROW)
      return err(SKIPPED);
    return ok((mapped ?? value).trim());
  }

  function convertRaw(column: RotkiColumn, raw: string): Result<string, RowProblem> {
    if (raw === '')
      return isRequiredColumn(recipe.format, column) ? reject(column, `${column} is empty.`) : ok('');
    if (AMOUNT_COLUMNS.has(column))
      return convertAmount(column, raw, recipe);
    if (column === RotkiColumn.timestamp)
      return convertTimestamp(raw, recipe);
    if (column === RotkiColumn.location)
      return convertLocation(raw);
    return column === RotkiColumn.type ? convertType(raw) : ok(raw);
  }

  function isSell(record: readonly string[]): boolean {
    return swapIndex !== -1 && swapValues.has((record[swapIndex] ?? '').trim().toLowerCase());
  }

  /** A value mapped to skip skips the row, whatever else is wrong with it. */
  function collect(results: Result<string, RowProblem>[]): Result<string[], RowProblem> {
    const skipped = results.some(result => !result.ok && result.error.kind === RowKind.skipped);
    return skipped ? err(SKIPPED) : all(results);
  }

  return record => pipe(
    collect(columns.map(column => pipe(rawValue(column, record), flatMap(raw => convertRaw(column, raw))))),
    flatMap(values => settleFee(new Map(columns.map((column, index) => [column, values[index] ?? ''])))),
    map(row => (isSell(record) ? swapSides(row) : row)),
    map(row => columns.map(column => row.get(column) ?? '')),
    toRowResult,
  );
}
