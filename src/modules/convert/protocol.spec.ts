import { describe, expect, it } from 'vitest';
import { RotkiFormat } from '@/modules/rotki-format';
import { readStartConversion } from './protocol';
import { type Recipe, serializeRecipe } from './recipe';

const recipe: Recipe = {
  version: 1,
  name: '',
  input: { encoding: 'utf-8', delimiter: ',', headerIndex: 0 },
  format: RotkiFormat.trades,
  fields: { Location: { source: { kind: 'constant', value: 'Kraken' } } },
  numbers: { decimalSeparator: '.' },
  dates: { format: 'iso', timeZone: 'UTC' },
};

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'start',
    file: new Blob(['a,b\n']),
    recipe: JSON.parse(serializeRecipe(recipe)),
    outputName: 'converted.csv',
    rejectedName: 'rejected.csv',
    ...overrides,
  };
}

describe('readStartConversion', () => {
  it('accepts a well formed request', () => {
    const result = readStartConversion(request());
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.recipe).toEqual(recipe);
  });

  it.each([
    ['nothing', undefined, 'The conversion request is not an object.'],
    ['a string', 'start', 'The conversion request is not an object.'],
    ['another type', request({ type: 'stop' }), 'The conversion request has an unknown type.'],
    ['no file', request({ file: 'data.csv' }), 'The conversion request carries no file.'],
    ['a path as output', request({ outputName: '../converted.csv' }), 'The conversion request names invalid output files.'],
    ['a non csv output', request({ rejectedName: 'rejected.txt' }), 'The conversion request names invalid output files.'],
    ['one name for both outputs', request({ rejectedName: 'converted.csv' }), 'The conversion request names invalid output files.'],
    ['no recipe', request({ recipe: undefined }), 'The file is not a migration assistant recipe.'],
  ])('rejects %s', (_, data, error) => {
    expect(readStartConversion(data)).toEqual({ ok: false, error });
  });
});
