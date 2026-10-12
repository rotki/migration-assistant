import { describe, expect, it } from 'vitest';
import { getRotkiColumns, isRotkiEventType, RotkiFormat } from './rotki-format';

describe('rotki formats', () => {
  it('writes the trade header rotki expects', () => {
    expect(getRotkiColumns(RotkiFormat.trades).join(',')).toBe(
      'Location,Spend Currency,Spend Amount,Receive Currency,Receive Amount,Fee,Fee Currency,Description,Timestamp',
    );
  });

  it('writes the event header rotki expects', () => {
    expect(getRotkiColumns(RotkiFormat.events).join(',')).toBe(
      'Type,Location,Currency,Amount,Fee,Fee Currency,Description,Timestamp',
    );
  });

  it('accepts only the event types rotki maps', () => {
    expect(isRotkiEventType('Staking')).toBe(true);
    expect(isRotkiEventType('staking')).toBe(false);
    expect(isRotkiEventType('Trade')).toBe(false);
  });
});
