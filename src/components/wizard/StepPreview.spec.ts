import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mountInWizard, type WizardMount } from '@/test-utils/wizard';
import StepPreview from './StepPreview.vue';

const LEDGER = [
  'Time,Kind,Coin,Change',
  '2024-03-05T12:00:00Z,Deposit,ETH,1.5',
  '2024-03-06T12:00:00Z,Mystery,DOT,0.1',
  'yesterday,Deposit,DOT,0.1',
  '',
].join('\n');

async function preview(): Promise<WizardMount> {
  return mountInWizard(StepPreview, {}, { name: 'kraken-ledger.csv', text: LEDGER });
}

describe('stepPreview', () => {
  it('counts the rows by outcome', async () => {
    const { wrapper } = await preview();
    const text = wrapper.text();
    expect(text).toContain('First 3 rows:');
    expect(text).toContain('1 converted');
    expect(text).toContain('2 rejected');
    expect(text).toContain('0 skipped');
  });

  it('numbers rejected rows as the file does and says why', async () => {
    const { wrapper } = await preview();
    const items = wrapper.findAll('[data-testid=preview-rejected] li').map(item => item.text());
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/^Row 3.*Mystery.*Fix in Map columns$/);
    expect(items[1]).toMatch(/^Row 4.*yesterday.*Fix in Dates and numbers$/);
  });

  it('sends a mapping problem to Map columns and a format problem to Dates and numbers', async () => {
    const { wrapper, wizard } = await preview();
    wizard.step.value = 4;
    await wrapper.find('[data-testid=fix-3]').trigger('click');
    expect(wizard.step.value).toBe(2);
    await wrapper.find('[data-testid=fix-4]').trigger('click');
    expect(wizard.step.value).toBe(3);
  });

  it('lists what is missing instead of rows when the mapping is not complete', async () => {
    const { wrapper, wizard } = await preview();
    wizard.recipe.value.fields.Currency = { source: { kind: 'empty' } };
    await nextTick();
    expect(wrapper.text()).toContain('The mapping is not complete');
    expect(wrapper.text()).toContain('Currency needs a source column or a fixed value.');
    expect(wrapper.find('[data-testid=preview-rejected]').exists()).toBe(false);
  });

  it('says so when no row converts', async () => {
    const { wrapper, wizard } = await preview();
    wizard.recipe.value.fields.Type = { source: { kind: 'column', column: 'Kind' }, values: {} };
    wizard.recipe.value.fields.Timestamp = { source: { kind: 'column', column: 'Coin' } };
    await nextTick();
    expect(wrapper.text()).toContain('No row converts yet.');
  });
});
