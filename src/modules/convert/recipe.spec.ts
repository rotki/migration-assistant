import { describe, expect, it } from 'vitest';
import { RotkiFormat } from '@/modules/rotki-format';
import { SIDED_HEADER, sidedRecipe } from '@/test-utils/recipes';
import { message, MessageCode } from './messages';
import { meetsCondition, parseRecipe, readRecipe, type Recipe, referencedColumns, serializeRecipe, validateRecipe } from './recipe';

function eventsRecipe(): Recipe {
  return {
    version: 2,
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

  it('accepts a both recipe whose required fields come from fallbacks', () => {
    const recipe = sidedRecipe();
    recipe.fields.Type = { source: { kind: 'empty' }, fallbacks: recipe.fields.Type?.fallbacks };
    expect(validateRecipe(recipe, SIDED_HEADER)).toEqual([]);
  });

  it('asks a both recipe which rows are trades', () => {
    expect(validateRecipe({ ...sidedRecipe(), route: [] }, SIDED_HEADER)).toEqual([message(MessageCode.needsRoute)]);
  });

  it('checks the columns fallbacks, their conditions and the route read', () => {
    const header = SIDED_HEADER.filter(name => name !== 'Sent Currency' && name !== 'Received Amount');
    expect(validateRecipe(sidedRecipe(), header)).toEqual(expect.arrayContaining([
      message(MessageCode.missingColumn, { column: 'Sent Currency' }),
      message(MessageCode.missingColumn, { column: 'Received Amount' }),
    ]));
  });
});

describe('referencedColumns', () => {
  it('lists every source column a both recipe reads, once', () => {
    expect(referencedColumns(sidedRecipe()).sort()).toEqual([...SIDED_HEADER].sort());
  });
});

describe('meetsCondition', () => {
  const row: Record<string, string> = { Side: ' sell ', Note: '', Pair: 'BTC/EUR' };
  const cell = (column: string): string => row[column] ?? '';

  it('tests a value trimmed, as filled, empty or one of a list', () => {
    expect(meetsCondition({ kind: 'filled', column: 'Side' }, cell)).toBe(true);
    expect(meetsCondition({ kind: 'empty', column: 'Note' }, cell)).toBe(true);
    expect(meetsCondition({ kind: 'empty', column: 'Missing' }, cell)).toBe(true);
    expect(meetsCondition({ kind: 'one_of', column: 'Side', values: ['buy', 'sell'] }, cell)).toBe(true);
    expect(meetsCondition({ kind: 'one_of', column: 'Pair', values: ['BTC'] }, cell)).toBe(false);
  });
});

describe('version 2 recipes', () => {
  it('reads a version 1 recipe as the same recipe in version 2', () => {
    const saved = { ...JSON.parse(serializeRecipe(eventsRecipe())), version: 1 };
    expect(readRecipe(saved)).toEqual({ ok: true, value: eventsRecipe() });
  });

  it('round-trips conditions, fallbacks and the route of a both recipe', () => {
    const recipe = sidedRecipe();
    expect(parseRecipe(serializeRecipe(recipe))).toEqual({ ok: true, value: recipe });
  });

  it('drops a fallback whose conditions it cannot read, rather than loosen them', () => {
    const saved = JSON.parse(serializeRecipe(sidedRecipe()));
    saved.fields.Type.fallbacks = [
      { when: [{ kind: 'filled', column: 'Received Amount' }, { kind: 'bigger_than', column: 'Fee Amount' }], source: { kind: 'constant', value: 'Deposit' } },
      { source: { kind: 'constant', value: 'Withdrawal' } },
    ];
    const result = readRecipe(saved);
    expect(result.ok && result.value.fields.Type?.fallbacks).toEqual([{ source: { kind: 'constant', value: 'Withdrawal' } }]);
  });

  it('keeps a route only for a both recipe', () => {
    const saved = { ...JSON.parse(serializeRecipe(sidedRecipe())), format: 'trades' };
    const result = readRecipe(saved);
    expect(result.ok && result.value.route).toBeUndefined();
    expect(result.ok && Object.keys(result.value.fields)).not.toContain('Type');
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
    ['a newer version', { ...valid, version: 3 }, MessageCode.notRecipe],
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
