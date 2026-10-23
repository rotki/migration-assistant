import { describe, expect, it } from 'vitest';
import { parseCsv } from './parser';
import { decodeSample, detectDelimiter, detectEncoding, detectHeaderIndex, normalizeHeader } from './sniff';

function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (const [index, char] of [...text].entries())
    bytes[index * 2] = char.charCodeAt(0);
  return bytes;
}

describe('detectEncoding', () => {
  it('reads byte order marks', () => {
    expect(detectEncoding(new Uint8Array([0xEF, 0xBB, 0xBF, 0x61]))).toBe('utf-8');
    expect(detectEncoding(new Uint8Array([0xFF, 0xFE, 0x61, 0x00]))).toBe('utf-16le');
    expect(detectEncoding(new Uint8Array([0xFE, 0xFF, 0x00, 0x61]))).toBe('utf-16be');
  });

  it('recognises UTF-16 without a byte order mark', () => {
    expect(detectEncoding(utf16le('Date,Amount\n2024-01-01,1\n'))).toBe('utf-16le');
  });

  it('falls back to Windows-1252 for bytes that are not UTF-8', () => {
    expect(detectEncoding(new Uint8Array([0x47, 0x65, 0x62, 0xFC, 0x68, 0x72]))).toBe('windows-1252');
    expect(detectEncoding(new TextEncoder().encode('Gebühr'))).toBe('utf-8');
  });
});

describe('decodeSample', () => {
  it('drops the cut-off last line of a partial sample', () => {
    const bytes = new TextEncoder().encode('a,b\n1,2\n3,');
    expect(decodeSample(bytes, 'utf-8', false)).toBe('a,b\n1,2\n');
    expect(decodeSample(bytes, 'utf-8', true)).toBe('a,b\n1,2\n3,');
  });
});

describe('detectDelimiter', () => {
  it.each([',', ';', '\t', '|'])('finds %j', (delimiter) => {
    const text = `${['Date', 'Pair', 'Amount'].join(delimiter)
    }\n${['2024-01-01', 'BTC/EUR', '1,5'].join(delimiter)}\n`;
    expect(detectDelimiter(text)).toBe(delimiter);
  });
});

describe('detectHeaderIndex', () => {
  it('skips a preamble above the header', () => {
    const records = parseCsv('Account statement\nGenerated 2024-01-01\nDate,Pair,Amount\n2024-01-01,BTC/EUR,1\n2024-01-02,ETH/EUR,2\n', ',');
    expect(detectHeaderIndex(records)).toBe(2);
  });

  it('takes the first record when it is the header', () => {
    expect(detectHeaderIndex(parseCsv('a,b\n1,2\n3,4\n', ','))).toBe(0);
  });
});

describe('normalizeHeader', () => {
  it('names empty and repeated columns', () => {
    expect(normalizeHeader(['\u{FEFF}Date ', '', 'Amount', 'Amount'])).toEqual(['Date', 'Column 2', 'Amount', 'Amount (2)']);
  });
});
