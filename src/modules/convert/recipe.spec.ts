import { describe, expect, it } from 'vitest';
import { RotkiFormat } from '@/modules/rotki-format';
import { message, MessageCode } from './messages';
import { parseRecipe, readRecipe, type Recipe, serializeRecipe, validateRecipe } from './recipe';

function eventsRecipe(): Recipe {
  return {
    version: 1,
    name: 'Ledger',
    input: { encoding: 'utf-8', delimiter: ';', headerIndex: 2 },
    format: RotkiFormat.events,
    fields: {
      Type: { source: { kind: 'column', column: 'Kind' }, values: { deposit: 'Deposit' } },
      Location: { source: { kind: 'constant', value: 'Bitstamp' } },
      Currency: { source: { kind: 'column', column: 'Pair' }, split: { separator: '-', part: 0 } },
      Amount: { source: { kind: 'column', column: 'Amount' }, absolute: true },
      Timestamp: { source: { kind: 'column', column: 'Time' } },
    },
    numbers: { decimalSeparator: ',' },
    dates: { format: 'DD.MM.YYYY HH:mm', timeZone: 'Europe/Berlin' },
  };
}

describe('validateRecipe', () => {
  it('names a time zone the browser does not know', () => {
    const recipe: Recipe = { ...eventsRecipe(), dates: { format: 'iso', timeZone: 'Europe/Atlantis' } };
    expect(validateRecipe(recipe, ['Kind', 'Pair', 'Amount', 'Time'])).toEqual([message(MessageCode.unknownTimeZone, { timeZone: 'Europe/Atlantis' })]);
  });
});

describe('parseRecipe', () => {
  it('reads back what serializeRecipe wrote', () => {
    const recipe = eventsRecipe();
    expect(parseRecipe(serializeRecipe(recipe))).toEqual({ ok: true, value: recipe });
  });

  it('rejects text that is not JSON', () => {
    expect(parseRecipe('{')).toEqual({ ok: false, error: message(MessageCode.notJson) });
  });
});

describe('readRecipe', () => {
  const valid: Record<string, unknown> = JSON.parse(serializeRecipe(eventsRecipe()));

  it.each([
    ['null', null, MessageCode.notRecipe],
    ['an array', [], MessageCode.notRecipe],
    ['another version', { ...valid, version: 2 }, MessageCode.notRecipe],
    ['an unknown format', { ...valid, format: 'ledger' }, MessageCode.noFormat],
    ['an unknown delimiter', { ...valid, input: { encoding: 'utf-8', delimiter: ':', headerIndex: 0 } }, MessageCode.noInput],
    ['a fractional header row', { ...valid, input: { encoding: 'utf-8', delimiter: ',', headerIndex: 1.5 } }, MessageCode.noInput],
    ['no time zone', { ...valid, dates: { format: 'iso' } }, MessageCode.noDates],
    ['an unknown time zone', { ...valid, dates: { format: 'iso', timeZone: 'Europe/Atlantis' } }, MessageCode.noDates],
    ['an unknown decimal separator', { ...valid, numbers: { decimalSeparator: ' ' } }, MessageCode.noDecimalSeparator],
  ])('rejects %s', (_, data, code) => {
    expect(readRecipe(data)).toEqual({ ok: false, error: message(code) });
  });

  it('drops mappings it does not recognise and keeps the rest', () => {
    const result = readRecipe({
      ...valid,
      name: 7,
      fields: {
        ...eventsRecipe().fields,
        'Fee': { source: { kind: 'formula', value: '1+1' } },
        'Spend Amount': { source: { kind: 'column', column: 'Total' } },
        'Notes': { source: { kind: 'constant', value: 'x' } },
      },
      swap: { column: 'Side', values: ['sell'] },
    });
    expect(result.ok && result.value.name).toBe('');
    expect(result.ok && Object.keys(result.value.fields)).toEqual(['Type', 'Location', 'Currency', 'Amount', 'Timestamp']);
  });

  it('keeps only string values in a value map and ignores a malformed split', () => {
    const result = readRecipe({
      ...valid,
      fields: {
        Type: { source: { kind: 'column', column: 'Kind' }, values: { deposit: 'Deposit', bad: 3 }, split: { separator: '-', part: 'first' } },
      },
    });
    expect(result.ok && result.value.fields.Type).toEqual({ source: { kind: 'column', column: 'Kind' }, values: { deposit: 'Deposit' } });
  });

  it('keeps the string values of a trades swap', () => {
    const result = readRecipe({ ...valid, format: 'trades', fields: {}, swap: { column: 'Side', values: ['sell', 1, 'SELL'] } });
    expect(result.ok && result.value.swap).toEqual({ column: 'Side', values: ['sell', 'SELL'] });
  });
});
