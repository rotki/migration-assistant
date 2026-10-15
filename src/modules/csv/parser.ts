export interface CsvParser {
  /** Parses as much of `chunk` as forms complete records and returns them. */
  push: (chunk: string) => string[][];
  /** Returns the last record when the input does not end with a line break. */
  flush: () => string[][];
}

const QUOTE = '"';

/**
 * An RFC 4180 parser fed in chunks, so a file never has to be in memory at once.
 * Quoted fields may contain the delimiter, doubled quotes and line breaks; `\r\n`, `\n`
 * and `\r` all end a record. Records that are entirely empty lines are dropped.
 */
export function createCsvParser(delimiter: string): CsvParser {
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  /** A quote seen inside a quoted field: either an escaped quote or the closing one. */
  let pendingQuote = false;
  /** A `\r` ended the last record; a `\n` right after it belongs to the same break. */
  let afterCarriageReturn = false;
  /** The field had a quoted part; a later quote in it is plain text. */
  let wasQuoted = false;

  function endField(): void {
    record.push(field);
    field = '';
    wasQuoted = false;
  }

  function endRecord(records: string[][]): void {
    endField();
    const isBlankLine = record.length === 1 && record[0] === '';
    if (!isBlankLine)
      records.push(record);
    record = [];
  }

  /** Resolves what the previous character left open; `true` when that used up `char`. */
  function settlePending(char: string): boolean {
    if (afterCarriageReturn) {
      afterCarriageReturn = false;
      if (char === '\n')
        return true;
    }
    if (pendingQuote) {
      pendingQuote = false;
      if (char === QUOTE) {
        field += QUOTE;
        return true;
      }
      inQuotes = false;
    }
    return false;
  }

  function readQuoted(char: string): void {
    if (char === QUOTE)
      pendingQuote = true;
    else
      field += char;
  }

  /** Spaces before an opening quote are padding, not text: exports often write `a, "1,234.50"`. */
  function readUnquoted(char: string, records: string[][]): void {
    if (char === QUOTE && !wasQuoted && field.trim() === '') {
      field = '';
      inQuotes = true;
      wasQuoted = true;
    }
    else if (char === delimiter) {
      endField();
    }
    else if (char === '\n' || char === '\r') {
      endRecord(records);
      afterCarriageReturn = char === '\r';
    }
    else {
      field += char;
    }
  }

  function push(chunk: string): string[][] {
    const records: string[][] = [];
    for (const char of chunk) {
      if (settlePending(char))
        continue;
      if (inQuotes)
        readQuoted(char);
      else
        readUnquoted(char, records);
    }
    return records;
  }

  function flush(): string[][] {
    const records: string[][] = [];
    if (pendingQuote) {
      pendingQuote = false;
      inQuotes = false;
    }
    if (field !== '' || record.length > 0 || inQuotes)
      endRecord(records);
    inQuotes = false;
    return records;
  }

  return { push, flush };
}

/** Parses a whole string, for samples and tests. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const parser = createCsvParser(delimiter);
  return [...parser.push(text), ...parser.flush()];
}
