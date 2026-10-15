import { RuiMenuSelect, RuiTextField } from '@rotki/ui-library';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { SKIP_ROW } from '@/modules/convert/recipe';
import { global } from '@/test-utils/wizard';
import ValueMapEditor from './ValueMapEditor.vue';

interface Setup {
  wrapper: VueWrapper;
  model: () => Record<string, string>;
}

function setup(values: string[], mode: 'type' | 'rename', initial: Record<string, string> = {}): Setup {
  let model = initial;
  const wrapper = mount(ValueMapEditor, {
    props: {
      'values': values,
      mode,
      'modelValue': model,
      'onUpdate:modelValue': async (next: Record<string, string>) => {
        model = next;
        await wrapper.setProps({ modelValue: next });
      },
    },
    global,
  });
  return { wrapper, model: () => model };
}

const banner = (wrapper: VueWrapper): string => wrapper.find('[data-testid=value-map-unmapped]').text().replace(/\s+/g, ' ');

describe('valueMapEditor for event types', () => {
  it('counts the values and the sample rows that would be rejected', () => {
    const { wrapper } = setup(['Deposit', 'Deposit', 'Trade', 'Reward'], 'type', { Reward: 'staking' });
    expect(banner(wrapper)).toContain('2 values are not mapped yet, so 3 rows of the sample would be rejected.');
    expect(wrapper.find('[data-testid=value-map-Deposit]').classes()).toContain('border-rui-warning');
    expect(wrapper.find('[data-testid=value-map-Reward]').classes()).toContain('border-transparent');
  });

  it('uses the singular for one value in one row', () => {
    const { wrapper } = setup(['Deposit'], 'type');
    expect(banner(wrapper)).toContain('1 value is not mapped yet, so 1 row of the sample');
    expect(wrapper.find('[data-testid=value-map-Deposit]').text()).toContain('1 row in the sample');
  });

  it('counts a skipped value as mapped', async () => {
    const { wrapper, model } = setup(['Transfer'], 'type');
    wrapper.findComponent(RuiMenuSelect).vm.$emit('update:modelValue', SKIP_ROW);
    await flushPromises();
    expect(model()).toEqual({ Transfer: SKIP_ROW });
    expect(wrapper.find('[data-testid=value-map-unmapped]').exists()).toBe(false);
  });

  it('forgets a value set back to not mapped', async () => {
    const { wrapper, model } = setup(['Deposit'], 'type', { Deposit: 'deposit' });
    wrapper.findComponent(RuiMenuSelect).vm.$emit('update:modelValue', '__keep__');
    await flushPromises();
    expect(model()).toEqual({});
    expect(wrapper.find('[data-testid=value-map-unmapped]').exists()).toBe(true);
  });

  it('leaves out empty values and says when there are none', () => {
    const { wrapper } = setup(['', ''], 'type');
    expect(wrapper.text()).toContain('No values in the sample yet.');
    expect(wrapper.findAllComponents(RuiMenuSelect)).toHaveLength(0);
  });
});

describe('valueMapEditor for renames', () => {
  it('never warns, since an unrenamed value is kept as is', () => {
    const { wrapper } = setup(['XBT', 'ETH'], 'rename');
    expect(wrapper.find('[data-testid=value-map-unmapped]').exists()).toBe(false);
  });

  it('sets a rename and removes it when cleared', async () => {
    const { wrapper, model } = setup(['XBT'], 'rename');
    const field = wrapper.findComponent(RuiTextField);
    field.vm.$emit('update:modelValue', 'BTC');
    await flushPromises();
    expect(model()).toEqual({ XBT: 'BTC' });
    field.vm.$emit('update:modelValue', '');
    await flushPromises();
    expect(model()).toEqual({});
  });
});
