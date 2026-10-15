import { ROTKI_EVENT_TYPES, ROTKI_LOCATIONS } from './rotki-release';

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

/** Generated from rotki's source by `pnpm sync:rotki`; see `rotki-release.ts`. */
export { ROTKI_EVENT_TYPES, ROTKI_LOCATIONS };

export type RotkiEventType = (typeof ROTKI_EVENT_TYPES)[number];

export type RotkiLocation = (typeof ROTKI_LOCATIONS)[number];

/** The location rotki files rows under when nothing more specific fits. */
export const DEFAULT_LOCATION = 'external' satisfies RotkiLocation;

export function getRotkiColumns(format: RotkiFormat): readonly RotkiColumn[] {
  return format === RotkiFormat.trades ? ROTKI_TRADE_COLUMNS : ROTKI_EVENT_COLUMNS;
}

const EVENT_TYPE_LOOKUP: ReadonlySet<string> = new Set(ROTKI_EVENT_TYPES);

export function isRotkiEventType(value: string): value is RotkiEventType {
  return EVENT_TYPE_LOOKUP.has(value);
}
