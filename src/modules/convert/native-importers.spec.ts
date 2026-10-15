import { describe, expect, it } from 'vitest';
import { ROTKI_EVENT_COLUMNS, ROTKI_TRADE_COLUMNS } from '@/modules/rotki-format';
import { findNativeImporter, ImporterSection } from './native-importers';

describe('findNativeImporter', () => {
  it('recognises a Binance transaction history', () => {
    const header = ['User_ID', 'UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'];
    expect(findNativeImporter(header, 0)?.name).toBe('Binance');
  });

  it('recognises CoinTracking and CoinLedger exports', () => {
    expect(findNativeImporter(['Type', 'Buy', 'Cur.Buy', 'Sell', 'Cur.Sell', 'Fee', 'Cur.Fee', 'Exchange', 'Group', 'Comment', 'Date'], 0)?.name)
      .toBe('CoinTracking');
    expect(findNativeImporter(['Timestamp (UTC)', 'Platform', 'Asset', 'Amount', 'Type', 'Record Type', 'Description'], 0)?.name)
      .toBe('CoinLedger');
  });

  it('recognises either Kucoin layout', () => {
    expect(findNativeImporter(['tradeCreatedAt', 'symbol', 'side', 'price', 'size', 'funds', 'fee', 'feeCurrency'], 0)?.id).toBe('kucoin');
    expect(findNativeImporter(['Time', 'Pair', 'Side', 'FilledPrice', 'FilledPriceCoin', 'Amount', 'AmountCoin', 'Volume', 'VolumeCoin', 'Fee', 'FeeCoin'], 0)?.id)
      .toBe('kucoin');
  });

  it('recognises files already in rotki\'s generic formats', () => {
    expect(findNativeImporter([...ROTKI_EVENT_COLUMNS], 0)).toMatchObject({ name: 'Custom Import', section: ImporterSection.events });
    expect(findNativeImporter([...ROTKI_TRADE_COLUMNS], 0)).toMatchObject({ name: 'Custom Import', section: ImporterSection.trades });
  });

  it('ignores a match below a preamble, which rotki would read as the header', () => {
    expect(findNativeImporter(['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'], 2)).toBeUndefined();
  });

  it('needs every column, spelled exactly', () => {
    expect(findNativeImporter(['UTC_Time', 'Account', 'Operation', 'Coin', 'Change'], 0)).toBeUndefined();
    expect(findNativeImporter(['utc_time', 'account', 'operation', 'coin', 'change', 'remark'], 0)).toBeUndefined();
  });
});
