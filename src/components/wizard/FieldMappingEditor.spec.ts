import type { VueWrapper } from '@vue/test-utils';
import { RuiCheckbox, RuiMenuSelect, RuiTextField } from '@rotki/ui-library';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { guessEventType } from '@/modules/convert/suggest';
import { type RotkiColumn, RotkiFormat } from '@/modules/rotki-format';
import { mountInWizard, prop, type WizardMount } from '@/test-utils/wizard';
import FieldMappingEditor from './FieldMappingEditor.vue';

const TRADES = [
  'Date,Pair,Side,Amount,Total,Fee,Fee Asset,Note',
  '2024-03-05T12:00:00Z,BTC/EUR,buy,0.5 BTC,30000,15,EUR,order one',
  '2024-03-06T08:00:00Z,ETH/EUR,sell,2 ETH,6400,10,EUR,order two',
  '',
].join('\n');

const EVENTS = [
  'Time,Kind,Coin,Change',
  '2024-03-05T12:00:00Z,Deposit,ETH,1.5',
  '2024-03-06T12:00:00Z,Staking Rewards,DOT,0.1',
  '2024-03-07T12:00:00Z,Mystery,DOT,0.1',
  '',
].join('\n');

async function editor(column: RotkiColumn, text = TRADES): Promise<WizardMount> {
  return mountInWizard(FieldMappingEditor, { column }, { name: 'export.csv', text });
}

function labelled(items: VueWrapper[], label: string): VueWrapper | undefined {
  return items.find(item => prop(item, 'label') === label);
}

function checkbox(wrapper: VueWrapper, label: string): VueWrapper | undefined {
  return labelled(wrapper.findAllComponents(RuiCheckbox), label);
}

function textField(wrapper: VueWrapper, label: string): VueWrapper | undefined {
  return labelled(wrapper.findAllComponents(RuiTextField), label);
}

function optionIds(wrapper: VueWrapper): unknown[] {
  const options = prop(wrapper.findComponent(RuiMenuSelect), 'options');
  return Array.isArray(options) ? options.map((option: { id: unknown }) => option.id) : [];
}

async function selectSource(wrapper: VueWrapper, id: string): Promise<void> {
  wrapper.findComponent(RuiMenuSelect).vm.$emit('update:modelValue', id);
  await nextTick();
}

describe('fieldMappingEditor sources', () => {
  it('offers every header column and a fixed value, and leaving empty only when optional', async () => {
    const required = await editor('Spend Currency');
    expect(optionIds(required.wrapper)).toContain('column:Pair');
    expect(optionIds(required.wrapper)).toContain('__constant__');
    expect(optionIds(required.wrapper)).not.toContain('__empty__');

    const optional = await editor('Description');
    expect(optionIds(optional.wrapper)).toContain('__empty__');
  });

  it('starts a fixed location as external and says what that means', async () => {
    const { wrapper, wizard } = await editor('Location');
    await selectSource(wrapper, '__constant__');
    expect(wizard.recipe.value.fields.Location?.source).toEqual({ kind: 'constant', value: 'external' });
    expect(wrapper.find('[data-testid=location-external]').exists()).toBe(true);

    wizard.recipe.value.fields.Location = { source: { kind: 'constant', value: 'kraken' } };
    await nextTick();
    expect(wrapper.find('[data-testid=location-external]').exists()).toBe(false);
  });

  it('keeps ignoring the sign when the source changes', async () => {
    const { wrapper, wizard } = await editor('Fee');
    wizard.recipe.value.fields.Fee = { source: { kind: 'column', column: 'Fee' }, absolute: true };
    await selectSource(wrapper, 'column:Total');
    expect(wizard.recipe.value.fields.Fee).toEqual({ source: { kind: 'column', column: 'Total' }, absolute: true });
  });

  it('shows what the mapping makes of the sample values', async () => {
    const { wrapper, wizard } = await editor('Fee Currency');
    wizard.recipe.value.fields['Fee Currency'] = { source: { kind: 'column', column: 'Pair' }, split: { separator: '/', part: 0 }, values: { BTC: 'XBT' } };
    await nextTick();
    expect(wrapper.text()).toContain('BTC/EUR → XBT, ETH/EUR → ETH');
  });
});

describe('fieldMappingEditor splitting', () => {
  it('offers to split a pair but not a date, a plain number or a note with spaces', async () => {
    const cases: [RotkiColumn, string, boolean][] = [
      ['Spend Currency', 'Pair', true],
      ['Timestamp', 'Date', false],
      ['Spend Amount', 'Total', false],
      ['Description', 'Note', false],
    ];
    for (const [column, source, offered] of cases) {
      const { wrapper, wizard } = await editor(column);
      wizard.recipe.value.fields[column] = { source: { kind: 'column', column: source } };
      await nextTick();
      expect(checkbox(wrapper, 'Take one part of the value')?.exists() ?? false, column).toBe(offered);
    }
  });

  it('splits an amount on the space before its currency', async () => {
    const { wrapper, wizard } = await editor('Receive Amount');
    wizard.recipe.value.fields['Receive Amount'] = { source: { kind: 'column', column: 'Amount' } };
    await nextTick();
    checkbox(wrapper, 'Take one part of the value')?.vm.$emit('update:modelValue', true);
    await nextTick();
    expect(wizard.recipe.value.fields['Receive Amount']?.split).toEqual({ separator: ' ', part: 0 });
  });

  it('changes the separator of every field that splits the same column, and only that', async () => {
    const { wrapper, wizard } = await editor('Spend Currency');
    wizard.recipe.value.fields = {
      'Spend Currency': { source: { kind: 'column', column: 'Pair' }, split: { separator: '/', part: 1 } },
      'Receive Currency': { source: { kind: 'column', column: 'Pair' }, split: { separator: '/', part: 0 } },
      'Receive Amount': { source: { kind: 'column', column: 'Amount' }, split: { separator: ' ', part: 0 } },
    };
    await nextTick();
    textField(wrapper, 'Separator')?.vm.$emit('update:modelValue', '-');
    await nextTick();
    const { fields } = wizard.recipe.value;
    expect(fields['Spend Currency']?.split).toEqual({ separator: '-', part: 1 });
    expect(fields['Receive Currency']?.split).toEqual({ separator: '-', part: 0 });
    expect(fields['Receive Amount']?.split).toEqual({ separator: ' ', part: 0 });
  });

  it('changes the part of this field only', async () => {
    const { wrapper, wizard } = await editor('Spend Currency');
    wizard.recipe.value.fields = {
      'Spend Currency': { source: { kind: 'column', column: 'Pair' }, split: { separator: '/', part: 1 } },
      'Receive Currency': { source: { kind: 'column', column: 'Pair' }, split: { separator: '/', part: 0 } },
    };
    await nextTick();
    const part = labelled(wrapper.findAllComponents(RuiMenuSelect), 'Part to keep');
    expect(part && prop(part, 'options')).toEqual([
      { id: 0, label: 'Part 1: BTC' },
      { id: 1, label: 'Part 2: EUR' },
      { id: -1, label: 'Last part: EUR' },
    ]);
    part?.vm.$emit('update:modelValue', -1);
    await nextTick();
    expect(wizard.recipe.value.fields['Spend Currency']?.split?.part).toBe(-1);
    expect(wizard.recipe.value.fields['Receive Currency']?.split?.part).toBe(0);
  });

  it('drops the split when unticked', async () => {
    const { wrapper, wizard } = await editor('Spend Currency');
    wizard.recipe.value.fields['Spend Currency'] = { source: { kind: 'column', column: 'Pair' }, split: { separator: '/', part: 1 } };
    await nextTick();
    checkbox(wrapper, 'Take one part of the value')?.vm.$emit('update:modelValue', false);
    await nextTick();
    expect(wizard.recipe.value.fields['Spend Currency']).toEqual({ source: { kind: 'column', column: 'Pair' } });
  });
});

describe('fieldMappingEditor for the event type', () => {
  it('guesses the types it knows when a column is picked', async () => {
    const { wrapper, wizard } = await editor('Type', EVENTS);
    expect(wizard.recipe.value.format).toBe(RotkiFormat.events);
    wizard.recipe.value.fields.Type = { source: { kind: 'empty' } };
    await selectSource(wrapper, 'column:Kind');

    const expected = Object.fromEntries(['Deposit', 'Staking Rewards', 'Mystery']
      .flatMap(value => (guessEventType(value) ? [[value, guessEventType(value)]] : [])));
    expect(wizard.recipe.value.fields.Type?.values).toEqual(expected);
    expect(expected).not.toHaveProperty('Mystery');
    expect(wrapper.find('[data-testid=value-map-unmapped]').exists()).toBe(true);
  });
});

const SIDED = [
  'Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Label',
  '2024-03-05T12:00:00Z,30000,EUR,0.5,BTC,Buy',
  '2024-03-06T08:00:00Z,,,1.5,ETH,',
  '',
].join('\n');

describe('fieldMappingEditor fallbacks in a both recipe', () => {
  it('types an empty label by its side, and turns that off', async () => {
    const { wrapper, wizard } = await editor('Type', SIDED);
    expect(wizard.recipe.value.format).toBe('both');
    const bySide = wrapper.find('[data-testid=type-by-side]');
    expect(bySide.exists()).toBe(true);
    expect(prop(checkbox(wrapper, 'When empty, use Deposit for rows that receive and Withdrawal for rows that send')!, 'modelValue')).toBe(true);

    checkbox(wrapper, 'When empty, use Deposit for rows that receive and Withdrawal for rows that send')?.vm.$emit('update:modelValue', false);
    await nextTick();
    expect(wizard.recipe.value.fields.Type?.fallbacks).toBeUndefined();
  });

  it('offers the other side when the currency is empty', async () => {
    const { wrapper, wizard } = await editor('Currency', SIDED);
    const fallback = labelled(wrapper.findAllComponents(RuiMenuSelect), 'If empty, use');
    expect(prop(fallback!, 'modelValue')).toBe('Sent Currency');

    fallback?.vm.$emit('update:modelValue', '__none__');
    await nextTick();
    expect(wizard.recipe.value.fields.Currency?.fallbacks).toBeUndefined();
  });

  it('describes fallbacks it cannot edit instead of dropping them', async () => {
    const { wrapper, wizard } = await editor('Currency', SIDED);
    wizard.recipe.value.fields.Currency = {
      source: { kind: 'column', column: 'Received Currency' },
      fallbacks: [{ when: [{ kind: 'one_of', column: 'Label', values: ['Send'] }], source: { kind: 'column', column: 'Sent Currency' } }],
    };
    await nextTick();
    expect(wrapper.find('[data-testid=custom-fallbacks]').text()).toBe('The recipe gives this field 1 other source to try when it is empty.');
    expect(wrapper.find('[data-testid=fallback-column]').exists()).toBe(false);
  });

  it('keeps the fallbacks when the source changes', async () => {
    const { wrapper, wizard } = await editor('Type', SIDED);
    const before = wizard.recipe.value.fields.Type?.fallbacks;
    await selectSource(wrapper, 'column:Received Currency');
    expect(wizard.recipe.value.fields.Type?.fallbacks).toEqual(before);
  });

  it('keeps a required field marked required, but lets a fallback stand in for its source', async () => {
    const { wrapper } = await editor('Type', SIDED);
    expect(wrapper.text()).not.toContain('optional');
    expect(optionIds(wrapper)).toContain('__empty__');
  });

  it('shows no fallback controls outside a both recipe', async () => {
    const { wrapper } = await editor('Currency', EVENTS);
    expect(wrapper.find('[data-testid=fallback-column]').exists()).toBe(false);
  });
});
