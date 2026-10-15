import { describe, expect, it } from 'vitest';
import { createCsvParser, parseCsv } from './parser';
import { formatCsvRow } from './writer';

describe('parseCsv', () => {
  it('splits records and fields', () => {
    expect(parseCsv('a,b\n1,2\n', ',')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps delimiters, quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('"a,1","say ""hi""","two\nlines"\n', ',')).toEqual([
      ['a,1', 'say "hi"', 'two\nlines'],
    ]);
  });

  it('accepts CRLF, LF and CR line breaks', () => {
    expect(parseCsv('a\r\nb\nc\rd', ',')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('keeps empty fields and drops blank lines', () => {
    expect(parseCsv('a,,c\n\n,b,\n', ',')).toEqual([['a', '', 'c'], ['', 'b', '']]);
  });

  it('opens a quoted field after spaces, keeping later quotes as text', () => {
    expect(parseCsv('2024-01-01, "1,234.50", BTC\n', ',')).toEqual([['2024-01-01', '1,234.50', ' BTC']]);
    expect(parseCsv('a "b" c,"d" "e"\n', ',')).toEqual([['a "b" c', 'd "e"']]);
  });

  it('parses other delimiters', () => {
    expect(parseCsv('a;b\t\n1;2\n', ';')).toEqual([['a', 'b\t'], ['1', '2']]);
  });

  it('returns a last record without a trailing line break on flush', () => {
    expect(parseCsv('a,b\n1,2', ',')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('createCsvParser', () => {
  it('gives the same records whatever the chunk boundaries', () => {
    const text = 'id,note\r\n1,"quoted, ""value""\r\nnext line"\r\n2,plain\r\n';
    const expected = parseCsv(text, ',');

    for (let size = 1; size < text.length; size++) {
      const parser = createCsvParser(',');
      const records: string[][] = [];
      for (let start = 0; start < text.length; start += size)
        records.push(...parser.push(text.slice(start, start + size)));
      records.push(...parser.flush());
      expect(records, `chunk size ${size}`).toEqual(expected);
    }
  });
});

describe('formatCsvRow', () => {
  it('quotes only the fields that need it', () => {
    expect(formatCsvRow(['plain', 'a,b', 'say "hi"', 'two\nlines'])).toBe(
      'plain,"a,b","say ""hi""","two\nlines"\n',
    );
  });

  it('round-trips through the parser', () => {
    const values = ['1', 'a,b', '"', '', 'x\r\ny'];
    expect(parseCsv(formatCsvRow(values), ',')).toEqual([values]);
  });
});
