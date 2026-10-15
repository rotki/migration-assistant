import type { ROTKI_IMPORTER_COLUMNS } from '@/modules/rotki-release';
import { ROTKI_EVENT_COLUMNS, ROTKI_TRADE_COLUMNS } from '@/modules/rotki-format';

/** One of rotki's CSV importers, by its module name in `rotkehlchen/data_import/importers`. */
export type RotkiImporter = keyof typeof ROTKI_IMPORTER_COLUMNS;

/** The import an importer page offers, when it offers more than one; the page names it in its language. */
export const ImporterSection = {
  events: 'events',
  trades: 'trades',
  transactions: 'transactions',
} as const;

export type ImporterSection = (typeof ImporterSection)[keyof typeof ImporterSection];

/** A CSV format one of rotki's own importers reads, under **Import Data** in rotki. */
export interface NativeImporter {
  id: RotkiImporter;
  /** The name rotki's Import Data page lists it under. */
  name: string;
  /** Where to go once on that page, when the name alone is not enough. */
  section?: ImporterSection;
  /**
   * Header variants, each the columns rotki's importer reads, matched exactly: the importers
   * look columns up by name, so a renamed column is a file they cannot read.
   */
  variants: readonly (readonly string[])[];
}

/**
 * rotki's importers this app does not point to, with why. Every importer in
 * {@link ROTKI_IMPORTER_COLUMNS} is either here or in {@link NATIVE_IMPORTERS}, and a test keeps it so.
 */
export const SKIPPED_IMPORTERS: Partial<Record<RotkiImporter, string>> = {
  bittrex: 'Its importer accepts several inconsistent layouts that no set of columns describes reliably.',
};

/**
 * Header variants per importer, curated from `rotkehlchen/data_import/importers/*.py` in rotki. A
 * test checks every column against {@link ROTKI_IMPORTER_COLUMNS}, generated from the same source.
 */
export const NATIVE_IMPORTERS: readonly NativeImporter[] = [
  { id: 'rotki_events', name: 'Custom Import', section: ImporterSection.events, variants: [ROTKI_EVENT_COLUMNS] },
  { id: 'rotki_trades', name: 'Custom Import', section: ImporterSection.trades, variants: [ROTKI_TRADE_COLUMNS] },
  { id: 'binance', name: 'Binance', variants: [['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark']] },
  { id: 'bisq_trades', name: 'Bisq', variants: [['Trade ID', 'Date/Time', 'Market', 'Price', 'Amount in BTC', 'Amount', 'Offer type', 'Status']] },
  { id: 'bitcoin_tax', name: 'bitcoin.tax', variants: [['Date', 'Action', 'Account', 'Symbol', 'Volume', 'Currency']] },
  { id: 'bitmex', name: 'BitMEX', variants: [['transactTime', 'transactType', 'transactStatus', 'amount', 'fee', 'address']] },
  { id: 'bitstamp', name: 'Bitstamp', variants: [['Type', 'Datetime', 'Amount', 'Value', 'Fee', 'Sub Type']] },
  { id: 'blockfi_trades', name: 'BlockFi', section: ImporterSection.trades, variants: [['Trade ID', 'Date', 'Buy Quantity', 'Buy Currency', 'Sold Quantity', 'Sold Currency', 'Type']] },
  { id: 'blockfi_transactions', name: 'BlockFi', section: ImporterSection.transactions, variants: [['Cryptocurrency', 'Amount', 'Transaction Type', 'Confirmed At']] },
  { id: 'blockpit', name: 'Blockpit', variants: [['Timestamp', 'Source Name', 'Transaction Type', 'Outgoing Asset', 'Outgoing Amount', 'Incoming Asset', 'Incoming Amount', 'Fee Asset', 'Fee Amount', 'Note']] },
  { id: 'coinbasepro', name: 'Coinbase Pro', variants: [['Type', 'Timestamp', 'Amount', 'Amount/balance unit', 'Trade id']] },
  { id: 'coinledger', name: 'CoinLedger', variants: [['Timestamp (UTC)', 'Platform', 'Asset', 'Amount', 'Type', 'Record Type']] },
  { id: 'cointracking', name: 'CoinTracking', variants: [['Type', 'Buy', 'Cur.Buy', 'Sell', 'Cur.Sell', 'Fee', 'Cur.Fee', 'Exchange', 'Comment', 'Date']] },
  { id: 'cryptocom', name: 'Crypto.com', variants: [['Timestamp (UTC)', 'Transaction Description', 'Currency', 'Amount', 'To Currency', 'To Amount', 'Native Currency', 'Native Amount', 'Transaction Kind']] },
  {
    id: 'kucoin',
    name: 'Kucoin',
    variants: [
      ['tradeCreatedAt', 'symbol', 'side', 'price', 'size', 'funds', 'fee', 'feeCurrency'],
      ['Time', 'Pair', 'Side', 'FilledPrice', 'FilledPriceCoin', 'Amount', 'AmountCoin', 'Volume', 'VolumeCoin', 'Fee', 'FeeCoin'],
    ],
  },
  { id: 'nexo', name: 'Nexo', variants: [['Transaction', 'Type', 'Input Currency', 'Input Amount', 'Output Currency', 'Output Amount', 'Details', 'Date / Time (UTC)']] },
  { id: 'shapeshift_trades', name: 'ShapeShift', variants: [['timestamp', 'inputTxid', 'inputAddress', 'inputCurrency', 'inputAmount', 'outputTxid', 'outputAddress', 'outputCurrency', 'outputAmount']] },
  { id: 'uphold_transactions', name: 'Uphold', variants: [['Date', 'Id', 'Type', 'Origin', 'Origin Currency', 'Origin Amount', 'Destination', 'Destination Currency', 'Destination Amount', 'Status']] },
];

/**
 * The rotki importer that reads a file with this header as it is, if any. Only a header on
 * the file's first line counts, since the importers read the first line as the header.
 */
export function findNativeImporter(header: readonly string[], headerIndex: number): NativeImporter | undefined {
  if (headerIndex !== 0)
    return undefined;
  const names = new Set(header.map(name => name.trim()));
  return NATIVE_IMPORTERS.find(importer => importer.variants.some(variant => variant.every(column => names.has(column))));
}
