import { describe, expect, it } from 'vitest';
import { RotkiFormat } from '@/modules/rotki-format';
import { englishTexts } from '@/test-utils/messages';
import { message, MessageCode, MessageError } from './messages';
import { problemsOf, readStartConversion } from './protocol';
import { type Recipe, serializeRecipe } from './recipe';
import { RecipeError } from './row-converter';

const recipe: Recipe = {
  version: 2,
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
    outputNames: { trades: 'trades.csv', events: 'events.csv' },
    rejectedName: 'rejected.csv',
    texts: englishTexts(),
    ...overrides,
  };
}

describe('readStartConversion', () => {
  it('accepts a well formed request', () => {
    const result = readStartConversion(request());
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.recipe).toEqual(recipe);
    expect(result.ok && result.value.texts).toEqual(englishTexts());
  });

  const missingReason = Object.fromEntries(Object.entries(englishTexts().reasons).filter(([code]) => code !== MessageCode.columnEmpty));

  it.each([
    ['nothing', undefined, MessageCode.requestNotObject],
    ['a string', 'start', MessageCode.requestNotObject],
    ['another type', request({ type: 'stop' }), MessageCode.requestUnknownType],
    ['no file', request({ file: 'data.csv' }), MessageCode.requestNoFile],
    ['a path as output', request({ outputNames: { trades: '../trades.csv', events: 'events.csv' } }), MessageCode.requestInvalidOutput],
    ['a missing output name', request({ outputNames: { trades: 'trades.csv' } }), MessageCode.requestInvalidOutput],
    ['a non csv output', request({ rejectedName: 'rejected.txt' }), MessageCode.requestInvalidOutput],
    ['one name for an output and the rejected rows', request({ rejectedName: 'trades.csv' }), MessageCode.requestInvalidOutput],
    ['one name for both outputs', request({ outputNames: { trades: 'rows.csv', events: 'rows.csv' } }), MessageCode.requestInvalidOutput],
    ['no texts', request({ texts: undefined }), MessageCode.requestInvalidTexts],
    ['a missing reason text', request({ texts: { ...englishTexts(), reasons: missingReason } }), MessageCode.requestInvalidTexts],
    ['no recipe', request({ recipe: undefined }), MessageCode.notRecipe],
  ])('rejects %s', (_, data, code) => {
    expect(readStartConversion(data)).toEqual({ ok: false, error: message(code) });
  });
});

describe('problemsOf', () => {
  it('keeps the messages of our own errors', () => {
    const missing = message(MessageCode.missingColumn, { column: 'Pair' });
    expect(problemsOf(new RecipeError([missing]))).toEqual([missing]);
    expect(problemsOf(new MessageError(message(MessageCode.noStorage)))).toEqual([message(MessageCode.noStorage)]);
  });

  it('keeps the text of a browser error as the detail', () => {
    expect(problemsOf(new DOMException('Quota exceeded.'))).toEqual([message(MessageCode.stoppedWithDetail, { detail: 'Quota exceeded.' })]);
    expect(problemsOf('boom')).toEqual([message(MessageCode.stopped)]);
  });
});
