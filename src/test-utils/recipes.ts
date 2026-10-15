import type { Recipe } from '@/modules/convert/recipe';

/** The header of a sided export, as Koinly's template writes it. */
export const SIDED_HEADER = ['Date', 'Sent Amount', 'Sent Currency', 'Received Amount', 'Received Currency', 'Fee Amount', 'Fee Currency', 'Label', 'Description'];

/**
 * A `both` recipe for {@link SIDED_HEADER}: both amounts make a trade; an event takes the side it
 * has, and its type from the label or, with no label, from the side.
 */
export function sidedRecipe(): Recipe {
  return {
    version: 2,
    name: 'Tax tool export',
    input: { encoding: 'utf-8', delimiter: ',', headerIndex: 0 },
    format: 'both',
    fields: {
      'Location': { source: { kind: 'constant', value: 'external' } },
      'Spend Amount': { source: { kind: 'column', column: 'Sent Amount' } },
      'Spend Currency': { source: { kind: 'column', column: 'Sent Currency' } },
      'Receive Amount': { source: { kind: 'column', column: 'Received Amount' } },
      'Receive Currency': { source: { kind: 'column', column: 'Received Currency' } },
      'Type': {
        source: { kind: 'column', column: 'Label' },
        values: { staking: 'Staking', airdrop: 'Income' },
        fallbacks: [
          { when: [{ kind: 'filled', column: 'Received Amount' }], source: { kind: 'constant', value: 'Deposit' } },
          { source: { kind: 'constant', value: 'Withdrawal' } },
        ],
      },
      'Currency': { source: { kind: 'column', column: 'Received Currency' }, fallbacks: [{ source: { kind: 'column', column: 'Sent Currency' } }] },
      'Amount': { source: { kind: 'column', column: 'Received Amount' }, fallbacks: [{ source: { kind: 'column', column: 'Sent Amount' } }], absolute: true },
      'Fee': { source: { kind: 'column', column: 'Fee Amount' } },
      'Fee Currency': { source: { kind: 'column', column: 'Fee Currency' } },
      'Description': { source: { kind: 'column', column: 'Description' } },
      'Timestamp': { source: { kind: 'column', column: 'Date' } },
    },
    route: [
      { kind: 'filled', column: 'Sent Amount' },
      { kind: 'filled', column: 'Received Amount' },
    ],
    numbers: { decimalSeparator: '.' },
    dates: { format: 'iso', timeZone: 'UTC' },
  };
}
