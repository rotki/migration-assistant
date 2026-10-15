/**
 * The two generic CSV formats rotki imports, as read by
 * `rotkehlchen/data_import/importers/rotki_trades.py` and `rotki_events.py`.
 * rotki looks columns up by header name, so the order here is only the order the
 * converter writes them in.
 */
export const RotkiFormat = {
  trades: 'trades',
  events: 'events',
} as const;

export type RotkiFormat = (typeof RotkiFormat)[keyof typeof RotkiFormat];

/** The header names rotki reads from the generic formats. */
export const RotkiColumn = {
  type: 'Type',
  location: 'Location',
  spendCurrency: 'Spend Currency',
  spendAmount: 'Spend Amount',
  receiveCurrency: 'Receive Currency',
  receiveAmount: 'Receive Amount',
  currency: 'Currency',
  amount: 'Amount',
  fee: 'Fee',
  feeCurrency: 'Fee Currency',
  description: 'Description',
  timestamp: 'Timestamp',
} as const;

export type RotkiColumn = (typeof RotkiColumn)[keyof typeof RotkiColumn];

export const ROTKI_TRADE_COLUMNS = [
  RotkiColumn.location,
  RotkiColumn.spendCurrency,
  RotkiColumn.spendAmount,
  RotkiColumn.receiveCurrency,
  RotkiColumn.receiveAmount,
  RotkiColumn.fee,
  RotkiColumn.feeCurrency,
  RotkiColumn.description,
  RotkiColumn.timestamp,
] as const;

export const ROTKI_EVENT_COLUMNS = [
  RotkiColumn.type,
  RotkiColumn.location,
  RotkiColumn.currency,
  RotkiColumn.amount,
  RotkiColumn.fee,
  RotkiColumn.feeCurrency,
  RotkiColumn.description,
  RotkiColumn.timestamp,
] as const;

/** Values rotki accepts in the `Type` column of a generic events file. */
export const ROTKI_EVENT_TYPES = [
  'Deposit',
  'Withdrawal',
  'Income',
  'Loss',
  'Spend',
  'Staking',
] as const;

export type RotkiEventType = (typeof ROTKI_EVENT_TYPES)[number];

/**
 * Locations rotki deserializes, as `Location.serialize()` writes them: the enum name in
 * lower case with spaces for underscores. rotki files any other value under `external`
 * without a word, so the converter rejects those rows instead.
 */
export const ROTKI_LOCATIONS = [
  'external',
  'kraken',
  'poloniex',
  'bittrex',
  'binance',
  'bitmex',
  'coinbase',
  'banks',
  'blockchain',
  'coinbasepro',
  'gemini',
  'equities',
  'realestate',
  'commodities',
  'cryptocom',
  'uniswap',
  'bitstamp',
  'binanceus',
  'bitfinex',
  'bitcoinde',
  'iconomi',
  'kucoin',
  'balancer',
  'loopring',
  'ftx',
  'nexo',
  'blockfi',
  'independentreserve',
  'gitcoin',
  'sushiswap',
  'shapeshift',
  'uphold',
  'bitpanda',
  'bisq',
  'ftxus',
  'okx',
  'ethereum',
  'optimism',
  'polygon pos',
  'arbitrum one',
  'base',
  'gnosis',
  'woo',
  'bybit',
  'scroll',
  'zksync lite',
  'htx',
  'bitcoin',
  'bitcoin cash',
  'polkadot',
  'kusama',
  'coinbaseprime',
  'binance sc',
  'solana',
  'avalanche',
  'hyperliquid',
  'monad',
  'gate',
  'bit2me',
  'coinex',
  'sonic',
  'robinhood',
  'ink',
  'qonto',
  'fints',
] as const;

/** The location rotki files rows under when nothing more specific fits. */
export const DEFAULT_LOCATION = 'external';

export function getRotkiColumns(format: RotkiFormat): readonly RotkiColumn[] {
  return format === RotkiFormat.trades ? ROTKI_TRADE_COLUMNS : ROTKI_EVENT_COLUMNS;
}

const EVENT_TYPE_LOOKUP: ReadonlySet<string> = new Set(ROTKI_EVENT_TYPES);

export function isRotkiEventType(value: string): value is RotkiEventType {
  return EVENT_TYPE_LOOKUP.has(value);
}
