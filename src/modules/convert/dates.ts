interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i;

/** The date formats read by name instead of a pattern. */
export const DateFormat = {
  iso: 'iso',
  unixSeconds: 'unix-s',
  unixMilliseconds: 'unix-ms',
} as const;

export type DateFormat = (typeof DateFormat)[keyof typeof DateFormat];

/** Candidates tried by detection, most specific first. */
export const DATE_FORMAT_CANDIDATES: readonly string[] = [
  DateFormat.iso,
  DateFormat.unixSeconds,
  DateFormat.unixMilliseconds,
  'DD/MM/YYYY HH:mm:ss',
  'MM/DD/YYYY HH:mm:ss',
  'DD/MM/YYYY HH:mm',
  'MM/DD/YYYY HH:mm',
  'D/M/YYYY H:mm:ss',
  'M/D/YYYY H:mm:ss',
  'D/M/YYYY H:mm',
  'M/D/YYYY H:mm',
  'M/D/YYYY h:mm:ss A',
  'M/D/YYYY h:mm A',
  'DD.MM.YYYY HH:mm:ss',
  'DD.MM.YYYY HH:mm',
  'DD-MM-YYYY HH:mm:ss',
  'YYYY/MM/DD HH:mm:ss',
  'MMM D, YYYY, h:mm A',
  'MMM D, YYYY h:mm A',
  'D MMM YYYY HH:mm',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD.MM.YYYY',
];

const TOKENS: Record<string, string> = {
  YYYY: '(\\d{4})',
  YY: '(\\d{2})',
  MMMM: '([A-Za-z]+)',
  MMM: '([A-Za-z]{3})',
  MM: '(\\d{2})',
  M: '(\\d{1,2})',
  DD: '(\\d{2})',
  D: '(\\d{1,2})',
  HH: '(\\d{2})',
  H: '(\\d{1,2})',
  hh: '(\\d{2})',
  h: '(\\d{1,2})',
  mm: '(\\d{2})',
  m: '(\\d{1,2})',
  ss: '(\\d{2})',
  s: '(\\d{1,2})',
  SSS: '(\\d{1,9})',
  A: '([AaPp][Mm])',
  a: '([AaPp][Mm])',
};

/** A token, or text in square brackets that is matched as written, as `[at]` in `D MMM [at] HH:mm`. */
const TOKEN_PATTERN = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|SSS|A|a/g;

interface CompiledPattern {
  regex: RegExp;
  tokens: string[];
}

const compiled = new Map<string, CompiledPattern>();

function escapeRegex(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePattern(pattern: string): CompiledPattern {
  const cached = compiled.get(pattern);
  if (cached)
    return cached;
  const tokens: string[] = [];
  let source = '';
  let last = 0;
  for (const match of pattern.matchAll(TOKEN_PATTERN)) {
    source += escapeRegex(pattern.slice(last, match.index));
    const [token, literal] = match;
    if (literal === undefined) {
      source += TOKENS[token];
      tokens.push(token);
    }
    else {
      source += escapeRegex(literal);
    }
    last = match.index + token.length;
  }
  source += escapeRegex(pattern.slice(last));
  const result = { regex: new RegExp(`^${source}$`), tokens };
  compiled.set(pattern, result);
  return result;
}

function monthFromName(name: string): number | undefined {
  const lower = name.toLowerCase();
  const index = MONTHS.findIndex(month => month === lower || month.slice(0, 3) === lower);
  return index === -1 ? undefined : index + 1;
}

/** Stores one token's text in the wall time; returns `false` when the text is not valid for it. */
type TokenReader = (wall: WallTime, text: string) => boolean;

function numberInto(field: keyof WallTime, offset = 0): TokenReader {
  return (wall, text) => {
    wall[field] = Number.parseInt(text, 10) + offset;
    return true;
  };
}

function monthNameInto(wall: WallTime, text: string): boolean {
  const month = monthFromName(text);
  if (month === undefined)
    return false;
  wall.month = month;
  return true;
}

function fractionInto(wall: WallTime, text: string): boolean {
  wall.millisecond = Number.parseInt(text.padEnd(3, '0').slice(0, 3), 10);
  return true;
}

const TOKEN_READERS: Record<string, TokenReader> = {
  YYYY: numberInto('year'),
  YY: numberInto('year', 2000),
  MMMM: monthNameInto,
  MMM: monthNameInto,
  MM: numberInto('month'),
  M: numberInto('month'),
  DD: numberInto('day'),
  D: numberInto('day'),
  HH: numberInto('hour'),
  H: numberInto('hour'),
  hh: numberInto('hour'),
  h: numberInto('hour'),
  mm: numberInto('minute'),
  m: numberInto('minute'),
  ss: numberInto('second'),
  s: numberInto('second'),
  SSS: fractionInto,
};

function readPattern(value: string, pattern: string): WallTime | undefined {
  const { regex, tokens } = compilePattern(pattern);
  const match = regex.exec(value);
  if (!match)
    return undefined;

  const wall: WallTime = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
  let meridiem: 'am' | 'pm' | undefined;
  for (const [index, token] of tokens.entries()) {
    const text = match[index + 1] ?? '';
    const read = TOKEN_READERS[token];
    if (!read)
      meridiem = text.toLowerCase() === 'pm' ? 'pm' : 'am';
    else if (!read(wall, text))
      return undefined;
  }

  return meridiem ? applyMeridiem(wall, meridiem) : wall;
}

/** Turns a 12-hour clock reading into 24-hour time; `undefined` for an hour outside 1 to 12. */
function applyMeridiem(wall: WallTime, meridiem: 'am' | 'pm'): WallTime | undefined {
  if (wall.hour < 1 || wall.hour > 12)
    return undefined;
  return { ...wall, hour: (wall.hour % 12) + (meridiem === 'pm' ? 12 : 0) };
}

function isValidWallTime(wall: WallTime): boolean {
  const daysInMonth = new Date(Date.UTC(wall.year, wall.month, 0)).getUTCDate();
  return wall.month >= 1 && wall.month <= 12
    && wall.day >= 1 && wall.day <= daysInMonth
    && wall.hour <= 23 && wall.minute <= 59 && wall.second <= 59;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function zoneOffset(epoch: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const part of zoneFormatter(timeZone).formatToParts(new Date(epoch)))
    parts[part.type] = Number.parseInt(part.value, 10);
  const asUtc = Date.UTC(parts.year ?? 1970, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  return asUtc - (epoch - (((epoch % 1000) + 1000) % 1000));
}

function wallTimeToEpoch(wall: WallTime, timeZone: string): number {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second, wall.millisecond);
  if (timeZone === 'UTC')
    return guess;
  const first = zoneOffset(guess, timeZone);
  const second = zoneOffset(guess - first, timeZone);
  return guess - second;
}

function parseOffset(text: string): number {
  if (/^(?:Z|UTC)$/i.test(text))
    return 0;
  const sign = text.startsWith('-') ? -1 : 1;
  const digits = text.slice(1).replace(':', '');
  return sign * ((Number.parseInt(digits.slice(0, 2), 10) * 60) + Number.parseInt(digits.slice(2), 10)) * 60_000;
}

function parseIso(value: string, timeZone: string): number | undefined {
  const match = ISO.exec(value);
  if (!match)
    return undefined;
  const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '', offset] = match;
  const wall: WallTime = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number.parseInt(fraction.padEnd(3, '0').slice(0, 3), 10),
  };
  if (!isValidWallTime(wall))
    return undefined;
  if (offset === undefined)
    return wallTimeToEpoch(wall, timeZone);
  return wallTimeToEpoch(wall, 'UTC') - parseOffset(offset);
}

/**
 * Milliseconds since the epoch, or `undefined` when `value` does not match `format`.
 *
 * `unix-s` and `unix-ms` read epoch numbers and `iso` reads ISO 8601 with or without an
 * offset. Any other format is a pattern of the tokens YYYY, YY, MMMM, MMM, MM, M, DD, D, HH,
 * H, hh, h, mm, m, ss, s, SSS and A, with literal text in square brackets, as `[at]`. Text
 * without an offset is read as wall-clock time in
 * `timeZone`.
 */
export function parseDate(value: string, format: string, timeZone: string): number | undefined {
  const text = value.trim();
  if (format === DateFormat.unixSeconds) {
    if (!/^\d+(?:\.\d+)?$/.test(text))
      return undefined;
    const [seconds = '0', fraction = ''] = text.split('.');
    return (Number.parseInt(seconds, 10) * 1000) + Number.parseInt(fraction.padEnd(3, '0').slice(0, 3), 10);
  }
  if (format === DateFormat.unixMilliseconds)
    return /^\d+$/.test(text) ? Number.parseInt(text, 10) : undefined;
  if (format === DateFormat.iso)
    return parseIso(text, timeZone);

  const wall = readPattern(text, format);
  return wall && isValidWallTime(wall) ? wallTimeToEpoch(wall, timeZone) : undefined;
}

const EARLIEST = Date.UTC(2009, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);

/** How many samples may fail to read before a format is ruled out: a stray bad row should not hide it. */
function tolerance(count: number): number {
  return count < 3 ? 0 : Math.max(1, Math.floor(count * 0.05));
}

/**
 * The samples read with `format`, failures as `-1`, or `undefined` when more fail than the
 * tolerance allows. Only dates from 2009 to 2100 count as read.
 */
function readAll(values: readonly string[], format: string, timeZone: string): number[] | undefined {
  const allowed = tolerance(values.length);
  let failures = 0;
  const epochs: number[] = [];
  for (const value of values) {
    const epoch = parseDate(value, format, timeZone);
    const plausible = epoch !== undefined && epoch >= EARLIEST && epoch < LATEST;
    if (!plausible && ++failures > allowed)
      return undefined;
    epochs.push(plausible ? epoch : -1);
  }
  return epochs;
}

/**
 * The candidate formats that read every sample as a plausible date, keeping only the first
 * of formats that read them identically (`DD/MM/YYYY` and `D/M/YYYY` on zero-padded values).
 * More than one means the samples cannot tell them apart, typically day-first against
 * month-first.
 */
export function detectDateFormats(samples: readonly string[], timeZone: string): string[] {
  const values = samples.map(sample => sample.trim()).filter(Boolean);
  if (values.length === 0)
    return [];
  const readings = new Set<string>();
  return DATE_FORMAT_CANDIDATES.filter((format) => {
    const epochs = readAll(values, format, timeZone);
    if (!epochs)
      return false;
    const key = epochs.join(',');
    if (readings.has(key))
      return false;
    readings.add(key);
    return true;
  });
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    zoneFormatter(timeZone);
    return true;
  }
  catch {
    return false;
  }
}
