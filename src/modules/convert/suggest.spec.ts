import { describe, expect, it } from 'vitest';
import { RotkiFormat } from '@/modules/rotki-format';
import { guessEventType, guessSeparator, guessSwap, suggestFormat } from './suggest';
import { downloadNames } from './use-conversion';

describe('downloadNames', () => {
  it('names the files after the recipe, or the file when the recipe has no name', () => {
    expect(downloadNames({ name: 'kraken 2024', format: RotkiFormat.trades }, 'export.csv'))
      .toEqual({ output: 'kraken 2024-rotki-trades.csv', rejected: 'kraken 2024-rejected.csv' });
    expect(downloadNames({ name: ' ', format: RotkiFormat.events }, 'ledger.csv'))
      .toEqual({ output: 'ledger-rotki-events.csv', rejected: 'ledger-rejected.csv' });
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
    ['Transfer Between Main and Funding Wallet', undefined],
  ])('reads %s as %s', (label, type) => {
    expect(guessEventType(label)).toBe(type);
  });
});
