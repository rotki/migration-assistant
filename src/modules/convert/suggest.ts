import { DEFAULT_LOCATION, getRotkiColumns, ROTKI_LOCATIONS, RotkiColumn, type RotkiEventType, RotkiFormat } from '@/modules/rotki-format';
import { type FieldMapping, isRequiredColumn, mappedValue, type Recipe, SourceKind } from './recipe';

/** Header names exchanges commonly use for each rotki column, tried in order. */
const PATTERNS: Partial<Record<RotkiColumn, readonly RegExp[]>> = {
  [RotkiColumn.timestamp]: [/^(?:timestamp|date|time|datetime|date\s*\(utc\)|time\s*\(utc\)|created(?:\s*at)?|date\s*time)$/i, /date|time/i],
  [RotkiColumn.type]: [/^(?:type|transaction\s*type|kind|operation|category)$/i, /type/i],
  [RotkiColumn.currency]: [/^(?:currency|asset|coin|symbol|ticker)$/i, /asset|currency|coin/i],
  [RotkiColumn.amount]: [/^(?:amount|quantity|qty|change|value)$/i, /amount|quantity/i],
  [RotkiColumn.spendCurrency]: [/^(?:spend\s*currency|sold\s*currency|from\s*currency|sell\s*currency|quote\s*(?:currency|asset))$/i],
  [RotkiColumn.spendAmount]: [/^(?:spend\s*amount|sold\s*amount|from\s*amount|sell\s*amount|total|cost|quote\s*amount)$/i],
  [RotkiColumn.receiveCurrency]: [/^(?:receive\s*currency|bought\s*currency|to\s*currency|buy\s*currency|base\s*(?:currency|asset))$/i],
  [RotkiColumn.receiveAmount]: [/^(?:receive\s*amount|bought\s*amount|to\s*amount|buy\s*amount|amount|quantity|qty|size|filled|vol|volume)$/i],
  [RotkiColumn.fee]: [/^(?:fee|fees|fee\s*amount|commission|trading\s*fee)$/i, /fee|commission/i],
  [RotkiColumn.feeCurrency]: [/^(?:fee\s*(?:currency|asset|coin)|commission\s*(?:currency|asset))$/i],
  [RotkiColumn.description]: [/^(?:description|notes?|comments?|remarks?|memo|details|reference|ref|txid|tx\s*id|id|order\s*id)$/i],
};

function findColumn(header: readonly string[], patterns: readonly RegExp[], taken: ReadonlySet<string>): string | undefined {
  for (const pattern of patterns) {
    const match = header.find(name => !taken.has(name) && pattern.test(name));
    if (match)
      return match;
  }
  return undefined;
}

/**
 * A first guess at the mapping from the header names alone. Location starts as `external`;
 * the user picks the exchange.
 */
export function suggestFields(header: readonly string[], format: RotkiFormat): Recipe['fields'] {
  const fields: Recipe['fields'] = {};
  const taken = new Set<string>();
  for (const column of getRotkiColumns(format)) {
    if (column === RotkiColumn.location) {
      fields[RotkiColumn.location] = { source: { kind: SourceKind.constant, value: DEFAULT_LOCATION } };
      continue;
    }
    const patterns = PATTERNS[column];
    const match = patterns ? findColumn(header, patterns, taken) : undefined;
    let mapping: FieldMapping = { source: { kind: SourceKind.empty } };
    if (match) {
      taken.add(match);
      mapping = { source: { kind: SourceKind.column, column: match } };
    }
    fields[column] = mapping;
  }
  const amount = fields[RotkiColumn.amount];
  if (format === RotkiFormat.events && amount?.source.kind === SourceKind.column)
    amount.absolute = true;
  if (format === RotkiFormat.trades)
    applyPairColumn(fields, header);
  return fields;
}

/** Share of the format's required columns, other than Location, that the header suggestions fill. */
function coverage(header: readonly string[], format: RotkiFormat): number {
  const fields = suggestFields(header, format);
  const required = getRotkiColumns(format).filter(column => column !== RotkiColumn.location && isRequiredColumn(format, column));
  const filled = required.filter(column => fields[column]?.source.kind === SourceKind.column);
  return filled.length / required.length;
}

/**
 * The format that likely fits the file: the one whose required columns the suggestions fill
 * best, helped by a type column of deposits and rewards for events, or a buy/sell column for
 * trades. Ties go to trades.
 */
export function suggestFormat(header: readonly string[], samples: (column: string) => string[]): RotkiFormat {
  let events = coverage(header, RotkiFormat.events);
  let trades = coverage(header, RotkiFormat.trades);
  const type = suggestFields(header, RotkiFormat.events)[RotkiColumn.type]?.source;
  if (type?.kind === SourceKind.column) {
    const values = [...new Set(samples(type.column).map(value => value.trim()))];
    if (values.length > 0 && values.filter(value => guessEventType(value)).length * 2 >= values.length)
      events += 1;
  }
  if (guessSwap(header, samples))
    trades += 1;
  return events > trades ? RotkiFormat.events : RotkiFormat.trades;
}

const PAIR_COLUMN = /^(?:pair|market|symbol|instrument|trading\s*pair|currency\s*pair)$/i;

/**
 * Exports that name the market in one column, as `BTC/EUR`, get both currencies from it,
 * read as a buy: the base is received and the quote spent. A fee without its own currency
 * column is assumed to be in the quote.
 */
function applyPairColumn(fields: Recipe['fields'], header: readonly string[]): void {
  const pair = header.find(name => PAIR_COLUMN.test(name));
  if (!pair)
    return;
  const part = (index: number): FieldMapping => ({ source: { kind: SourceKind.column, column: pair }, split: { separator: '/', part: index } });
  if (fields[RotkiColumn.receiveCurrency]?.source.kind === SourceKind.empty)
    fields[RotkiColumn.receiveCurrency] = part(0);
  if (fields[RotkiColumn.spendCurrency]?.source.kind === SourceKind.empty)
    fields[RotkiColumn.spendCurrency] = part(1);
  if (fields[RotkiColumn.fee]?.source.kind === SourceKind.column && fields[RotkiColumn.feeCurrency]?.source.kind === SourceKind.empty)
    fields[RotkiColumn.feeCurrency] = part(1);
}

const SEPARATORS = ['/', '-', '_', ':', ' '];

/** The separator most sample values contain, for splitting values such as `BTC-EUR`. */
export function guessSeparator(samples: readonly string[], separators: readonly string[] = SEPARATORS): string | undefined {
  let best: { separator: string; count: number } | undefined;
  for (const separator of separators) {
    const count = samples.filter(sample => sample.includes(separator)).length;
    if (count > 0 && (!best || count > best.count))
      best = { separator, count };
  }
  return best?.separator;
}

/**
 * The column that tells buys from sells, with the values that mean a sell, when one column's
 * values include both.
 */
export function guessSwap(header: readonly string[], samples: (column: string) => string[]): Recipe['swap'] {
  for (const column of header) {
    const values = new Set(samples(column).map(value => value.trim()));
    const lower = Array.from(values, value => value.toLowerCase());
    if (lower.some(value => /\bbuy\b/.test(value)) && lower.some(value => /\bsell\b/.test(value)))
      return { column, values: [...values].filter(value => /\bsell\b/i.test(value)) };
  }
  return undefined;
}

const EVENT_TYPE_GUESSES: readonly [RegExp, RotkiEventType][] = [
  [/withdraw/i, 'Withdrawal'],
  [/deposit/i, 'Deposit'],
  [/stak|validator|delegat/i, 'Staking'],
  [/reward|interest|earn|airdrop|bonus|income|cashback|referral|distribution|mining/i, 'Income'],
  [/loss|liquidat/i, 'Loss'],
  [/fee|spend|payment|purchase/i, 'Spend'],
];

/** The rotki event type an exchange's label most likely means, if any. */
export function guessEventType(label: string): RotkiEventType | undefined {
  return EVENT_TYPE_GUESSES.find(([pattern]) => pattern.test(label))?.[1];
}

/** A value map with a guessed event type for each distinct sample, keeping what `existing` already maps. */
export function guessEventTypes(samples: readonly string[], existing: Record<string, string> = {}): Record<string, string> {
  const values = { ...existing };
  for (const value of new Set(samples.map(sample => sample.trim()))) {
    const guess = guessEventType(value);
    if (guess && !mappedValue(values, value))
      values[value] = guess;
  }
  return values;
}

/** Locations with their spaces removed, as they appear in file names (`polygonpos`). */
const LOCATION_WORDS = new Map(ROTKI_LOCATIONS.map(location => [location.replaceAll(' ', ''), location]));

/**
 * The rotki location a file name names, such as `binance` for `Binance-2024-history.csv`.
 * Only whole words count, so `database.csv` does not become `base`.
 */
export function guessLocation(fileName: string): string | undefined {
  const words = fileName.toLowerCase().split(/[^a-z0-9]+/);
  for (const word of words) {
    const location = LOCATION_WORDS.get(word);
    if (location && location !== DEFAULT_LOCATION)
      return location;
  }
  return undefined;
}

/** Distinct values in the sample, most frequent first. */
export function distinctValues(values: readonly string[], limit = 50): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = raw.trim();
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts, ([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}
