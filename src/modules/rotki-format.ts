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

export const ROTKI_TRADE_COLUMNS = [
  'Location',
  'Spend Currency',
  'Spend Amount',
  'Receive Currency',
  'Receive Amount',
  'Fee',
  'Fee Currency',
  'Description',
  'Timestamp',
] as const;

export const ROTKI_EVENT_COLUMNS = [
  'Type',
  'Location',
  'Currency',
  'Amount',
  'Fee',
  'Fee Currency',
  'Description',
  'Timestamp',
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

export function getRotkiColumns(format: RotkiFormat): readonly string[] {
  return format === RotkiFormat.trades ? ROTKI_TRADE_COLUMNS : ROTKI_EVENT_COLUMNS;
}

const EVENT_TYPE_LOOKUP: ReadonlySet<string> = new Set(ROTKI_EVENT_TYPES);

export function isRotkiEventType(value: string): value is RotkiEventType {
  return EVENT_TYPE_LOOKUP.has(value);
}
