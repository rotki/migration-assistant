import { createRui } from '@rotki/ui-library';
import { mount, type VueWrapper } from '@vue/test-utils';
import { type Component, defineComponent, h, nextTick, type VNode } from 'vue';
import { provideWizard, type Wizard } from '@/modules/wizard/use-wizard';

export interface WizardMount {
  wrapper: VueWrapper;
  wizard: Wizard;
}

/** Plugins a component needs to render as it does in the app. */
export const global = { plugins: [createRui()] };

/** Reads one prop of a mounted component, whatever its declared props. */
export function prop(wrapper: VueWrapper, key: string): unknown {
  const props: Record<string, unknown> = wrapper.props();
  return props[key];
}

/** Mounts a component under a real wizard, with `csv` loaded as the file when given. */
export async function mountInWizard(component: Component, props: Record<string, unknown> = {}, csv?: { name: string; text: string }): Promise<WizardMount> {
  let provided: Wizard | undefined;
  const wrapper = mount(defineComponent({
    setup() {
      provided = provideWizard();
      return (): VNode => h(component, props);
    },
  }), { global });
  if (!provided)
    throw new Error('The wizard was not provided.');
  if (csv)
    await provided.loadFile(new File([csv.text], csv.name));
  await nextTick();
  return { wrapper, wizard: provided };
}
