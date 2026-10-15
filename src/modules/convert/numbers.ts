export const DecimalSeparator = {
  dot: '.',
  comma: ',',
} as const;

export type DecimalSeparator = (typeof DecimalSeparator)[keyof typeof DecimalSeparator];

/** `\s` covers no-break and thin spaces too, which some locales group thousands with. */
const SPACES = /\s/g;
const CURRENCY_SYMBOLS = /[$€£¥₿]/g;
const PLAIN_DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const EXPONENT = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i;

function expandExponent(value: string): string | undefined {
  const match = EXPONENT.exec(value);
  if (!match)
    return undefined;
  const [, sign = '', integer = '', fraction = '', exponentText = '0'] = match;
  const exponent = Number.parseInt(exponentText, 10);
  const digits = integer + fraction;
  const point = integer.length + exponent;
  if (point <= 0)
    return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length)
    return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function trimZeros(value: string): string {
  const negative = value.startsWith('-');
  let [integer = '', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  integer = integer.replace(/^0+(?=\d)/, '') || '0';
  fraction = fraction.replace(/0+$/, '');
  const result = fraction ? `${integer}.${fraction}` : integer;
  return negative && result !== '0' ? `-${result}` : result;
}

/**
 * Removes thousands separators, accepting them only between groups of three digits in the
 * integer part. Anything else, such as `0.5,1` read with a comma decimal, is a sign of the
 * wrong decimal separator and gives `undefined` rather than a number off by magnitudes.
 */
function ungroup(value: string, decimalSeparator: DecimalSeparator): string | undefined {
  const group = decimalSeparator === DecimalSeparator.comma ? DecimalSeparator.dot : DecimalSeparator.comma;
  const parts = value.split(decimalSeparator);
  if (parts.length > 2)
    return undefined;
  const [integer = '', fraction] = parts;
  if (fraction?.includes(group))
    return undefined;
  const grouped = new RegExp(`^-?\\d{1,3}(?:\\${group}\\d{3})+$`);
  if (integer.includes(group) && !grouped.test(integer))
    return undefined;
  const plain = integer.replaceAll(group, '');
  return fraction === undefined ? plain : `${plain}.${fraction}`;
}

/**
 * Turns an exported amount into the plain decimal string rotki reads, without passing it
 * through a float. Drops spaces, currency symbols, a leading `+` and thousands separators,
 * and expands exponent notation. Returns `undefined` for anything that is not a number.
 */
export function normalizeDecimal(raw: string, decimalSeparator: DecimalSeparator): string | undefined {
  const cleaned = raw.replace(SPACES, '').replace(CURRENCY_SYMBOLS, '').replace(/^\+/, '').replaceAll('\'', '');
  const value = ungroup(cleaned, decimalSeparator);
  if (value === undefined || value === '' || value === '-')
    return undefined;

  const plain = PLAIN_DECIMAL.test(value) ? value : expandExponent(value);
  return plain === undefined ? undefined : trimZeros(plain);
}

export function isNegativeDecimal(value: string): boolean {
  return value.startsWith('-');
}

export function absoluteDecimal(value: string): string {
  return isNegativeDecimal(value) ? value.slice(1) : value;
}

export function isZeroDecimal(value: string): boolean {
  return /^-?0(?:\.0*)?$/.test(value);
}

/** A single separator followed by groups of three digits reads as either. */
const GROUPED_THOUSANDS = /^-?\d{1,3}(?:[.,]\d{3})+$/;
const NOT_NUMERIC = /[^\d.,-]/g;

/**
 * Guesses the decimal separator from sample amounts. With both separators in a value the
 * last one is the decimal; values like `1,000` could be either and do not vote.
 */
export function detectDecimalSeparator(samples: readonly string[]): DecimalSeparator {
  let comma = 0;
  let dot = 0;
  for (const sample of samples) {
    // Only digits, signs and separators vote, so `$1,000` or `1,000 USD` reads as grouped thousands.
    const value = sample.replace(NOT_NUMERIC, '');
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    const hasBoth = lastComma !== -1 && lastDot !== -1;
    if (!hasBoth && GROUPED_THOUSANDS.test(value))
      continue;
    if (lastComma > lastDot)
      comma++;
    else if (lastDot > lastComma)
      dot++;
  }
  return comma > dot ? DecimalSeparator.comma : DecimalSeparator.dot;
}
