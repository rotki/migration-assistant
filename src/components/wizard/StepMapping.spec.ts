import { RuiMenuSelect } from '@rotki/ui-library';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { RotkiFormat } from '@/modules/rotki-format';
import { mountInWizard, prop } from '@/test-utils/wizard';
import StepMapping from './StepMapping.vue';

const SIDED = [
  'Date,Sent Amount,Sent Currency,Received Amount,Received Currency,Label',
  '2024-03-05T12:00:00Z,30000,EUR,0.5,BTC,',
  '2024-03-06T08:00:00Z,,,1.5,ETH,',
  '2024-03-07T08:00:00Z,0.2,ETH,,,',
  '',
].join('\n');

async function mapping(): ReturnType<typeof mountInWizard> {
  return mountInWizard(StepMapping, {}, { name: 'export.csv', text: SIDED });
}

describe('stepMapping for a both recipe', () => {
  it('shows the rule for trades and how it splits the sample', async () => {
    const { wrapper } = await mapping();
    const selects = wrapper.findAllComponents(RuiMenuSelect).filter(select => /trade when|and also/.test(String(prop(select, 'label'))));
    expect(selects.map(select => prop(select, 'modelValue'))).toEqual(['Sent Amount', 'Received Amount']);
    expect(wrapper.find('[data-testid=route-counts]').text()).toBe('In the sample: 1 row as trades, 2 rows as events.');
  });

  it('updates the rule and the counts when a column changes', async () => {
    const { wrapper, wizard } = await mapping();
    wrapper.findAllComponents(RuiMenuSelect).find(select => prop(select, 'label') === 'and also')?.vm.$emit('update:modelValue', 'Sent Currency');
    await nextTick();
    expect(wizard.recipe.value.route).toEqual([{ kind: 'filled', column: 'Sent Amount' }, { kind: 'filled', column: 'Sent Currency' }]);
    expect(wrapper.find('[data-testid=route-counts]').text()).toBe('In the sample: 2 rows as trades, 1 row as events.');
  });

  it('describes a rule from a recipe file instead of editing it', async () => {
    const { wrapper, wizard } = await mapping();
    wizard.recipe.value.route = [{ kind: 'one_of', column: 'Label', values: ['Trade', 'Swap'] }];
    await nextTick();
    expect(wrapper.find('[data-testid=route-custom]').text()).toBe('The recipe makes a row a trade when Label is one of Trade, Swap.');
    expect(wrapper.find('[data-testid=route-first]').exists()).toBe(false);
  });

  it('groups the event fields apart from the trade fields', async () => {
    const { wrapper } = await mapping();
    const sections = wrapper.findAll('section').map(section => section.attributes('aria-label'));
    expect(sections).toEqual(['Trades and events', 'Spent', 'Received', 'Deposits and withdrawals', 'Fee', 'When and where', 'Note']);
  });

  it('shows no rule for a single format', async () => {
    const { wrapper, wizard } = await mapping();
    wizard.setFormat(RotkiFormat.trades);
    await nextTick();
    expect(wrapper.find('[data-testid=route-section]').exists()).toBe(false);
  });
});
