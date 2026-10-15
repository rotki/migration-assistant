import { parseCsv } from './parser';

export const ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252'] as const;

export type Encoding = (typeof ENCODINGS)[number];

export const DELIMITERS = [',', ';', '\t', '|'] as const;

export type Delimiter = (typeof DELIMITERS)[number];

/** How much of the file the wizard reads up front, for detection and the preview. */
export const SAMPLE_BYTES = 256 * 1024;

const BYTE_ORDER_MARKS: readonly [number[], Encoding][] = [
  [[0xEF, 0xBB, 0xBF], 'utf-8'],
  [[0xFF, 0xFE], 'utf-16le'],
  [[0xFE, 0xFF], 'utf-16be'],
];

/** ASCII text in UTF-16 without a byte order mark has every other byte zero. */
function detectUnmarkedUtf16(bytes: Uint8Array): Encoding | undefined {
  const length = Math.min(bytes.length, 4096);
  let even = 0;
  let odd = 0;
  for (let index = 0; index < length; index++) {
    if (bytes[index] !== 0)
      continue;
    if (index % 2 === 0)
      even++;
    else
      odd++;
  }
  if (odd > length / 4)
    return 'utf-16le';
  return even > length / 4 ? 'utf-16be' : undefined;
}

export function detectEncoding(bytes: Uint8Array): Encoding {
  const marked = BYTE_ORDER_MARKS.find(([mark]) => mark.every((byte, index) => bytes[index] === byte));
  if (marked)
    return marked[1];
  const utf16 = detectUnmarkedUtf16(bytes);
  if (utf16)
    return utf16;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    return 'utf-8';
  }
  catch {
    return 'windows-1252';
  }
}

/**
 * Decodes a sample read from the start of a file. Unless the sample is the whole file, its
 * last line is cut off and gets dropped.
 */
export function decodeSample(bytes: Uint8Array, encoding: Encoding, isWholeFile: boolean): string {
  const text = new TextDecoder(encoding).decode(bytes);
  if (isWholeFile)
    return text;
  const lastBreak = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
  return lastBreak === -1 ? text : text.slice(0, lastBreak + 1);
}

function mostCommon(values: readonly number[]): { value: number; count: number } {
  const counts = new Map<number, number>();
  for (const value of values)
    counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = { value: 0, count: 0 };
  for (const [value, count] of counts) {
    if (count > best.count || (count === best.count && value > best.value))
      best = { value, count };
  }
  return best;
}

/** The delimiter that splits the most lines into the same number of fields, above one. */
export function detectDelimiter(text: string): Delimiter {
  let best: { delimiter: Delimiter; score: number } = { delimiter: ',', score: 0 };
  for (const delimiter of DELIMITERS) {
    const widths = parseCsv(text, delimiter).slice(0, 200).map(record => record.length);
    const { value, count } = mostCommon(widths);
    const score = value > 1 ? count * Math.log2(value) : 0;
    if (score > best.score)
      best = { delimiter, score };
  }
  return best.delimiter;
}

const NUMBER_LIKE = /^[\s\d.,+\-:/TZ]*$/;

/**
 * The index of the header record: the first with as many fields as most records, filled
 * mostly with text rather than numbers or dates. Lines above it are preamble some
 * exchanges write before the header.
 */
export function detectHeaderIndex(records: readonly string[][]): number {
  const width = mostCommon(records.slice(0, 200).map(record => record.length)).value;
  const index = records.findIndex((record) => {
    if (record.length !== width)
      return false;
    const textual = record.filter(cell => cell.trim() !== '' && !NUMBER_LIKE.test(cell));
    return textual.length >= Math.ceil(record.length / 2);
  });
  return Math.max(index, 0);
}

/**
 * Header names as the recipe refers to them: trimmed (which also drops a byte order mark on
 * the first name), with a missing name replaced by its position and a repeated one
 * numbered, so every column has a unique name.
 */
export function normalizeHeader(record: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return record.map((cell, index) => {
    const name = cell.trim() || `Column ${index + 1}`;
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });
}
