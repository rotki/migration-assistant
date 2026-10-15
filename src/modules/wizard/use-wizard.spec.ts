import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { RotkiFormat } from '@/modules/rotki-format';
import { provideWizard, type Wizard } from './use-wizard';

function setup(): Wizard {
  let wizard: Wizard | undefined;
  mount(defineComponent({
    setup() {
      wizard = provideWizard();
      return (): null => null;
    },
  }));
  if (!wizard)
    throw new Error('The wizard was not provided.');
  return wizard;
}

const LEDGER = [
  'Exchange transaction history',
  'User ID;12345',
  'UTC_Time;Account;Operation;Coin;Change;Remark',
  '05/03/2024 12:30;Spot;Deposit;ETH;1,5;',
  '06/03/2024 08:00;Spot;Withdraw;ETH;-0,25;to wallet',
  '07/03/2024 09:15;Earn;Staking Rewards;DOT;0,0123;',
  '',
].join('\n');

const TRADES = [
  'txid,pair,time,type,cost,fee,vol',
  'TX1,XBT-EUR,2024-03-05 12:30:15,buy,30000,48,0.5',
  'TX2,ETH-EUR,2024-03-06 08:01:02,sell,6401,10.24,2',
  '',
].join('\n');

describe('the wizard', () => {
  it('detects the delimiter, the header below a preamble and the decimal separator', async () => {
    const wizard = setup();
    await wizard.loadFile(new File([LEDGER], 'ledger.csv'));

    expect(wizard.recipe.value.input).toEqual({ encoding: 'utf-8', delimiter: ';', headerIndex: 2 });
    expect(wizard.header.value).toEqual(['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark']);
    expect(wizard.rows.value).toHaveLength(3);
  });

  it('suggests an events mapping, guessing types and the date format', async () => {
    const wizard = setup();
    await wizard.loadFile(new File([LEDGER], 'ledger.csv'));
    wizard.setFormat(RotkiFormat.events);

    const { fields, dates, numbers } = wizard.recipe.value;
    expect(fields.Type?.values).toEqual({ 'Deposit': 'Deposit', 'Withdraw': 'Withdrawal', 'Staking Rewards': 'Staking' });
    expect(fields.Description?.source).toEqual({ kind: 'column', column: 'Remark' });
    expect(dates).toEqual({ format: 'DD/MM/YYYY HH:mm', timeZone: 'UTC' });
    expect(numbers.decimalSeparator).toBe(',');
    expect(wizard.preview.value.rows.map(row => row.result.kind)).toEqual(['converted', 'converted', 'converted']);
  });

  it('suggests a trades mapping from a pair column, the location and the sells', async () => {
    const wizard = setup();
    await wizard.loadFile(new File([TRADES], 'kraken-2024.csv'));

    const { fields, swap } = wizard.recipe.value;
    expect(fields.Location?.source).toEqual({ kind: 'constant', value: 'kraken' });
    expect(fields['Receive Currency']).toEqual({ source: { kind: 'column', column: 'pair' }, split: { separator: '-', part: 0 } });
    expect(fields['Spend Currency']).toEqual({ source: { kind: 'column', column: 'pair' }, split: { separator: '-', part: 1 } });
    expect(swap).toEqual({ column: 'type', values: ['sell'] });

    const second = wizard.preview.value.rows[1]?.result;
    expect(second).toEqual({ kind: 'converted', values: ['kraken', 'ETH', '2', 'EUR', '6401', '10.24', 'EUR', 'TX2', String(Date.UTC(2024, 2, 6, 8, 1, 2))] });
  });

  it('reports what the recipe misses instead of a preview', async () => {
    const wizard = setup();
    await wizard.loadFile(new File([LEDGER], 'ledger.csv'));
    wizard.setFormat(RotkiFormat.events);
    wizard.recipe.value.fields.Currency = { source: { kind: 'column', column: 'Asset' } };
    await nextTick();

    expect(wizard.preview.value).toEqual({ problems: ['The file has no column named "Asset".'], rows: [] });
  });

  it('starts over on restart', async () => {
    const wizard = setup();
    await wizard.loadFile(new File([LEDGER], 'ledger.csv'));
    wizard.step.value = 4;
    wizard.restart();

    expect(wizard.file.value).toBeUndefined();
    expect(wizard.step.value).toBe(0);
    expect(wizard.records.value).toEqual([]);
  });
});
