import { describe, expect, it } from 'vitest';
import { RotkiFormat } from '@/modules/rotki-format';
import { SIDED_HEADER, sidedRecipe } from '@/test-utils/recipes';
import { message, MessageCode } from './messages';
import { parseRecipe, type Recipe, serializeRecipe, SKIP_ROW, validateRecipe } from './recipe';
import { createRowConverter, RecipeError } from './row-converter';
import { guessLocation, suggestFields } from './suggest';

const TRADE_HEADER = ['Date', 'Market', 'Side', 'Price', 'Size', 'Total', 'Fee', 'Fee Asset'];

function tradeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    version: 2,
    name: 'Example exchange trades',
    input: { encoding: 'utf-8', delimiter: ',', headerIndex: 0 },
    format: RotkiFormat.trades,
    fields: {
      'Location': { source: { kind: 'constant', value: 'Kraken' } },
      'Spend Currency': { source: { kind: 'column', column: 'Market' }, split: { separator: '/', part: 1 } },
      'Spend Amount': { source: { kind: 'column', column: 'Total' } },
      'Receive Currency': { source: { kind: 'column', column: 'Market' }, split: { separator: '/', part: 0 } },
      'Receive Amount': { source: { kind: 'column', column: 'Size' } },
      'Fee': { source: { kind: 'column', column: 'Fee' } },
      'Fee Currency': { source: { kind: 'column', column: 'Fee Asset' }, values: { XBT: 'BTC' } },
      'Description': { source: { kind: 'empty' } },
      'Timestamp': { source: { kind: 'column', column: 'Date' } },
    },
    swap: { column: 'Side', values: ['sell'] },
    numbers: { decimalSeparator: '.' },
    dates: { format: 'iso', timeZone: 'UTC' },
    ...overrides,
  };
}

describe('createRowConverter for trades', () => {
  const convert = createRowConverter(tradeRecipe(), TRADE_HEADER);

  it('converts a buy', () => {
    expect(convert(['2024-03-05 12:00:00', 'BTC/EUR', 'buy', '60000', '0.5', '30,000.00', '15', 'EUR'])).toEqual({
      kind: 'converted',
      format: 'trades',
      values: ['kraken', 'EUR', '30000', 'BTC', '0.5', '15', 'EUR', '', String(Date.UTC(2024, 2, 5, 12))],
    });
  });

  it('swaps spend and receive for a sell', () => {
    const result = convert(['2024-03-05 12:00:00', 'BTC/EUR', 'Sell', '60000', '0.5', '30000', '0.0001', 'XBT']);
    expect(result).toEqual({
      kind: 'converted',
      format: 'trades',
      values: ['kraken', 'BTC', '0.5', 'EUR', '30000', '0.0001', 'BTC', '', String(Date.UTC(2024, 2, 5, 12))],
    });
  });

  it('drops a zero fee together with its currency', () => {
    const result = convert(['2024-03-05 12:00:00', 'BTC/EUR', 'buy', '1', '1', '1', '0', 'EUR']);
    expect(result.kind === 'converted' && result.values.slice(5, 7)).toEqual(['', '']);
  });

  it.each([
    [['not a date', 'BTC/EUR', 'buy', '1', '1', '1', '0', 'EUR'], 'Timestamp', 'format', message(MessageCode.timestampFormat, { value: 'not a date', format: 'iso' })],
    [['2024-03-05', 'BTC/EUR', 'buy', '1', 'lots', '1', '0', 'EUR'], 'Receive Amount', 'format', message(MessageCode.amountNotNumber, { column: 'Receive Amount', value: 'lots', separator: '.' })],
    [['2024-03-05', 'BTC/EUR', 'buy', '1', '-1', '1', '0', 'EUR'], 'Receive Amount', 'mapping', message(MessageCode.amountNegative, { column: 'Receive Amount', value: '-1' })],
    [['2024-03-05', 'BTC', 'buy', '1', '1', '1', '0', 'EUR'], 'Spend Currency', 'mapping', message(MessageCode.columnEmpty, { column: 'Spend Currency' })],
    [['2024-03-05', 'BTC/EUR', 'buy', '1', '1', '1', '2', ''], 'Fee Currency', 'mapping', message(MessageCode.feeWithoutCurrency, { value: '2' })],
  ])('rejects %j, naming the column and where to fix it', (record, column, cause, reason) => {
    expect(convert(record)).toEqual({ kind: 'rejected', reason, column, cause });
  });

  it('rejects a location rotki does not know', () => {
    const recipe = tradeRecipe();
    recipe.fields.Location = { source: { kind: 'constant', value: 'Nowhere' } };
    const result = createRowConverter(recipe, TRADE_HEADER)(['2024-03-05', 'BTC/EUR', 'buy', '1', '1', '1', '0', 'EUR']);
    expect(result).toEqual({ kind: 'rejected', reason: message(MessageCode.unknownLocation, { value: 'Nowhere' }), column: 'Location', cause: 'mapping' });
  });

  it('refuses a recipe that reads a column the file lacks', () => {
    expect(() => createRowConverter(tradeRecipe(), TRADE_HEADER.filter(name => name !== 'Total')))
      .toThrowError(RecipeError);
  });
});

describe('createRowConverter for events', () => {
  const header = ['Time', 'Operation', 'Coin', 'Change'];
  const recipe: Recipe = {
    ...tradeRecipe({ swap: undefined }),
    format: RotkiFormat.events,
    fields: {
      Type: { source: { kind: 'column', column: 'Operation' }, values: { 'Staking Rewards': 'Staking', 'Withdraw': 'Withdrawal', 'Transfer': SKIP_ROW } },
      Location: { source: { kind: 'constant', value: 'binance' } },
      Currency: { source: { kind: 'column', column: 'Coin' } },
      Amount: { source: { kind: 'column', column: 'Change' }, absolute: true },
      Timestamp: { source: { kind: 'column', column: 'Time' } },
    },
    dates: { format: 'DD/MM/YYYY HH:mm', timeZone: 'Europe/Berlin' },
  };
  const convert = createRowConverter(recipe, header);

  it('maps exchange operations to rotki types', () => {
    expect(convert(['01/07/2024 14:00', 'Withdraw', 'ETH', '-1.5'])).toEqual({
      kind: 'converted',
      format: 'events',
      values: ['Withdrawal', 'binance', 'ETH', '1.5', '', '', '', String(Date.UTC(2024, 6, 1, 12))],
    });
  });

  it('skips rows mapped to skip', () => {
    expect(convert(['01/07/2024 14:00', 'Transfer', 'ETH', '1'])).toEqual({ kind: 'skipped' });
  });

  it('skips a row mapped to skip even when another column would reject it', () => {
    expect(convert(['not a date', 'Transfer', 'ETH', 'lots'])).toEqual({ kind: 'skipped' });
  });

  it('rejects a value that names an object member instead of reading the member', () => {
    expect(convert(['01/07/2024 14:00', 'constructor', 'ETH', '1'])).toEqual({
      kind: 'rejected',
      reason: message(MessageCode.unknownType, { value: 'constructor' }),
      column: 'Type',
      cause: 'mapping',
    });
  });

  it('rejects types left unmapped', () => {
    expect(convert(['01/07/2024 14:00', 'Airdrop', 'ETH', '1'])).toEqual({
      kind: 'rejected',
      reason: message(MessageCode.unknownType, { value: 'Airdrop' }),
      column: 'Type',
      cause: 'mapping',
    });
  });
});

describe('createRowConverter for both', () => {
  const convert = createRowConverter(sidedRecipe(), SIDED_HEADER);
  const at = (hours: number): string => String(Date.UTC(2024, 2, 5, hours));

  it('makes a trade of a row that sends and receives', () => {
    expect(convert(['2024-03-05 12:00', '30000', 'EUR', '0.5', 'BTC', '15', 'EUR', '', 'Buy BTC'])).toEqual({
      kind: 'converted',
      format: 'trades',
      values: ['external', 'EUR', '30000', 'BTC', '0.5', '15', 'EUR', 'Buy BTC', at(12)],
    });
  });

  it('makes an event of a row with one side, taking the side it has', () => {
    expect(convert(['2024-03-05 13:00', '', '', '1.5', 'ETH', '', '', '', ''])).toEqual({
      kind: 'converted',
      format: 'events',
      values: ['Deposit', 'external', 'ETH', '1.5', '', '', '', at(13)],
    });
    expect(convert(['2024-03-05 14:00', '-0.25', 'ETH', '', '', '0.001', 'ETH', '', 'To cold storage'])).toEqual({
      kind: 'converted',
      format: 'events',
      values: ['Withdrawal', 'external', 'ETH', '0.25', '0.001', 'ETH', 'To cold storage', at(14)],
    });
  });

  it('types an event by its label first, and by its side only when the label is empty', () => {
    const result = convert(['2024-03-05 15:00', '', '', '0.01', 'ETH', '', '', 'staking', '']);
    expect(result.kind === 'converted' && result.values[0]).toBe('Staking');
  });

  it('rejects a label nobody mapped instead of typing it by its side', () => {
    expect(convert(['2024-03-05 16:00', '', '', '5', 'XYZ', '', '', 'mystery', ''])).toMatchObject({
      kind: 'rejected',
      column: 'Type',
      reason: message(MessageCode.unknownType, { value: 'mystery' }),
    });
  });

  it('rejects a row with no side at all', () => {
    expect(convert(['2024-03-05 17:00', '', '', '', '', '', '', '', ''])).toMatchObject({ kind: 'rejected', column: 'Currency' });
  });
});

describe('recipes', () => {
  it('survive a save and load', () => {
    const recipe = tradeRecipe();
    expect(parseRecipe(serializeRecipe(recipe))).toEqual({ ok: true, value: recipe });
  });

  it('refuse files that are not recipes, saying why', () => {
    expect(parseRecipe('not json')).toEqual({ ok: false, error: message(MessageCode.notJson) });
    expect(parseRecipe('{"version":3}')).toEqual({ ok: false, error: message(MessageCode.notRecipe) });
    const withoutDates = { ...tradeRecipe(), dates: undefined };
    expect(parseRecipe(JSON.stringify(withoutDates))).toEqual({ ok: false, error: message(MessageCode.noDates) });
  });

  it('name what is missing', () => {
    const recipe = tradeRecipe();
    recipe.fields.Timestamp = { source: { kind: 'empty' } };
    expect(validateRecipe(recipe, TRADE_HEADER)).toEqual([message(MessageCode.needsSource, { column: 'Timestamp' })]);
  });
});

describe('suggestFields', () => {
  it('guesses event columns from common header names', () => {
    const fields = suggestFields(['Date(UTC)', 'Operation', 'Coin', 'Change', 'Remark'], RotkiFormat.events);
    expect(fields.Timestamp?.source).toEqual({ kind: 'column', column: 'Date(UTC)' });
    expect(fields.Type?.source).toEqual({ kind: 'column', column: 'Operation' });
    expect(fields.Currency?.source).toEqual({ kind: 'column', column: 'Coin' });
    expect(fields.Amount?.source).toEqual({ kind: 'column', column: 'Change' });
    expect(fields.Location?.source).toEqual({ kind: 'constant', value: 'external' });
  });
});

describe('guessLocation', () => {
  it.each([
    ['Binance-2024-history.csv', 'binance'],
    ['kraken_ledgers.csv', 'kraken'],
    ['polygonpos-export.csv', 'polygon pos'],
    ['database.csv', undefined],
    ['export.csv', undefined],
  ])('reads %s as %s', (fileName, location) => {
    expect(guessLocation(fileName)).toBe(location);
  });
});
