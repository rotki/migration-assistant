import { describe, expect, it } from 'vitest';
import { RotkiFormat } from '@/modules/rotki-format';
import { RecipeFormat } from './recipe';
import { guessEventType, guessSeparator, guessSwap, sidedColumns, sideTypeFallbacks, suggestFormat, suggestMapping } from './suggest';
import { downloadNames } from './use-conversion';

describe('downloadNames', () => {
  it('names the files after the recipe, or the file when the recipe has no name', () => {
    expect(downloadNames({ name: 'kraken 2024' }, 'export.csv')).toEqual({
      outputs: { trades: 'kraken 2024-rotki-trades.csv', events: 'kraken 2024-rotki-events.csv' },
      rejected: 'kraken 2024-rejected.csv',
    });
    expect(downloadNames({ name: ' ' }, 'ledger.csv').outputs.events).toBe('ledger-rotki-events.csv');
  });
});

describe('guessSeparator', () => {
  it('picks the separator most values contain', () => {
    expect(guessSeparator(['BTC-EUR', 'ETH-EUR', 'DOT/EUR'])).toBe('-');
    expect(guessSeparator(['BTC/EUR'])).toBe('/');
  });

  it('finds none in values without parts', () => {
    expect(guessSeparator(['BTC', 'ETH'])).toBeUndefined();
  });

  it('ignores spaces when only real separators count', () => {
    expect(guessSeparator(['Staking Rewards', 'to wallet'], ['/', '-', '_', ':'])).toBeUndefined();
    expect(guessSeparator(['0.5 BTC', '1 ETH'])).toBe(' ');
  });
});

describe('suggestFormat', () => {
  const ledger: Record<string, string[]> = {
    UTC_Time: ['05/03/2024 12:30'],
    Operation: ['Deposit', 'Withdraw', 'Staking Rewards'],
    Coin: ['ETH'],
    Change: ['1,5'],
  };
  const trades: Record<string, string[]> = {
    pair: ['XBT/EUR'],
    time: ['2024-03-05 12:30:15'],
    type: ['buy', 'sell'],
    cost: ['30000'],
    vol: ['0.5'],
  };

  it('picks events for a ledger of deposits and rewards', () => {
    expect(suggestFormat(Object.keys(ledger), column => ledger[column] ?? [])).toBe(RotkiFormat.events);
  });

  it('picks trades for an export with a pair and sells', () => {
    expect(suggestFormat(Object.keys(trades), column => trades[column] ?? [])).toBe(RotkiFormat.trades);
  });
});

describe('guessSwap', () => {
  const samples: Record<string, string[]> = {
    pair: ['BTC/EUR', 'ETH/EUR'],
    side: ['Buy', 'Sell', 'buy'],
  };

  it('finds the column holding both buys and sells', () => {
    expect(guessSwap(['pair', 'side'], column => samples[column] ?? [])).toEqual({ column: 'side', values: ['Sell'] });
  });

  it('finds nothing when no column holds both', () => {
    expect(guessSwap(['pair'], column => samples[column] ?? [])).toBeUndefined();
  });
});

describe('guessEventType', () => {
  it.each([
    ['Withdraw', 'Withdrawal'],
    ['Crypto Deposit', 'Deposit'],
    ['Staking Rewards', 'Staking'],
    ['Airdrop Assets', 'Income'],
    ['Savings Interest', 'Income'],
    ['Liquidation', 'Loss'],
    ['Card payment', 'Spend'],
    ['Receive', 'Deposit'],
    ['Send', 'Withdrawal'],
    ['staking reward', 'Staking'],
    ['Transfer Between Main and Funding Wallet', undefined],
  ])('reads %s as %s', (label, type) => {
    expect(guessEventType(label)).toBe(type);
  });
});

describe('sidedColumns', () => {
  it.each([
    ['Koinly', ['Date', 'Sent Amount', 'Sent Currency', 'Received Amount', 'Received Currency', 'Fee Amount', 'Fee Currency', 'Net Worth Amount', 'Net Worth Currency', 'Label', 'Description', 'TxHash'], ['Sent Amount', 'Sent Currency', 'Received Amount', 'Received Currency']],
    ['CoinTracker', ['Date', 'Received Quantity', 'Received Currency', 'Sent Quantity', 'Sent Currency', 'Fee Amount', 'Fee Currency', 'Tag'], ['Sent Quantity', 'Sent Currency', 'Received Quantity', 'Received Currency']],
    ['ZenLedger', ['Timestamp', 'Type', 'IN Amount', 'IN Currency', 'Out Amount', 'Out Currency', 'Fee Amount', 'Fee Currency', 'Exchange(optional)', 'US Based'], ['Out Amount', 'Out Currency', 'IN Amount', 'IN Currency']],
  ])('finds the sides of a %s file', (_, header, [sentAmount, sentCurrency, receivedAmount, receivedCurrency]) => {
    expect(sidedColumns(header)).toEqual({ sentAmount, sentCurrency, receivedAmount, receivedCurrency });
  });

  it('finds none in an exchange export', () => {
    expect(sidedColumns(['txid', 'pair', 'time', 'type', 'price', 'cost', 'fee', 'vol'])).toBeUndefined();
    expect(sidedColumns(['Date', 'Sent Amount', 'Sent Currency', 'Received Amount'])).toBeUndefined();
  });
});

describe('suggestMapping for both', () => {
  const header = ['Date', 'Sent Amount', 'Sent Currency', 'Received Amount', 'Received Currency', 'Fee Amount', 'Fee Currency', 'Label', 'Description', 'TxHash'];

  it('picks both for a sided export', () => {
    expect(suggestFormat(header, () => [])).toBe(RecipeFormat.both);
  });

  it('routes rows with both amounts to trades and gives events their side', () => {
    const { fields, route } = suggestMapping(header, RecipeFormat.both);
    expect(route).toEqual([{ kind: 'filled', column: 'Sent Amount' }, { kind: 'filled', column: 'Received Amount' }]);
    expect(fields['Spend Amount']?.source).toEqual({ kind: 'column', column: 'Sent Amount' });
    expect(fields['Receive Currency']?.source).toEqual({ kind: 'column', column: 'Received Currency' });
    expect(fields.Currency).toEqual({ source: { kind: 'column', column: 'Received Currency' }, fallbacks: [{ source: { kind: 'column', column: 'Sent Currency' } }] });
    expect(fields.Type).toEqual({ source: { kind: 'column', column: 'Label' }, fallbacks: sideTypeFallbacks('Received Amount') });
    expect(fields.Fee?.source).toEqual({ kind: 'column', column: 'Fee Amount' });
    expect(fields.Timestamp?.source).toEqual({ kind: 'column', column: 'Date' });
    expect(fields.Description?.source).toEqual({ kind: 'column', column: 'Description' });
  });

  it('leaves the rule to the user when the header has no sides', () => {
    const { fields, route } = suggestMapping(['Date', 'Pair', 'Amount'], RecipeFormat.both);
    expect(route).toEqual([]);
    expect(fields.Timestamp?.source).toEqual({ kind: 'column', column: 'Date' });
  });
});
