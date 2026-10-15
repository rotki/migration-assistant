import { describe, expect, it } from 'vitest';
import { createAppI18n } from '@/i18n';
import { englishMessages, englishTexts } from '@/test-utils/messages';
import { fillTemplate, message, MessageCode, rejection, REJECTION_CODES, REJECTION_PARAMS, RejectionCode, rejectionText } from './messages';

describe('createMessages', () => {
  const { translate } = englishMessages();

  it('has an English text for every code', () => {
    const missing = Object.values(MessageCode).filter(code => translate(message(code)).startsWith('messages.'));
    expect(missing).toEqual([]);
  });

  it('fills a message with its params', () => {
    expect(translate(message(MessageCode.missingColumn, { column: 'Pair' }))).toBe('The file has no column named "Pair".');
  });

  it('names a date format instead of showing its id', () => {
    expect(translate(message(MessageCode.timestampFormat, { value: 'soon', format: 'iso' })))
      .toBe('Timestamp "soon" does not match the date format ISO 8601.');
    expect(translate(message(MessageCode.timestampFormat, { value: 'soon', format: 'DD.MM.YYYY' })))
      .toBe('Timestamp "soon" does not match the date format DD.MM.YYYY.');
  });

  it('gives the worker templates with every param left open and the date format by name', () => {
    const texts = englishTexts('unix-s');
    expect(texts.reasons[RejectionCode.timestampFormat]).toBe('Timestamp "{value}" does not match the date format {format}.');
    expect(texts.shown).toEqual({ format: 'seconds since 1970' });
    expect([texts.row, texts.reason]).toEqual(['Row', 'Reason']);
  });

  it('writes the same reason into the rejected file as the preview shows, for every rejection', () => {
    const texts = englishTexts('unix-s');
    for (const code of REJECTION_CODES) {
      const params = Object.fromEntries(REJECTION_PARAMS[code].map(name => [name, `<${name}>`]));
      const reason = message(code, { ...params, ...(params.format === undefined ? {} : { format: 'unix-s' }) });
      expect(rejectionText(texts, reason)).toBe(translate(reason));
    }
  });

  it('fills a custom date pattern with braces once, as the preview does', () => {
    const texts = englishTexts('{value} YYYY');
    const reason = rejection(RejectionCode.timestampFormat, { value: 'soon', format: '{value} YYYY' });
    expect(rejectionText(texts, reason)).toBe('Timestamp "soon" does not match the date format {value} YYYY.');
  });
});

describe('plural texts', () => {
  const { t } = createAppI18n().global;

  it('reads naturally for one row and for many', () => {
    expect(t('step_preview.first_rows', { count: 1 }, 1)).toBe('First row:');
    expect(t('step_preview.first_rows', { count: 3 }, 3)).toBe('First 3 rows:');
    expect(t('step_convert.expectation.converted', { converted: 1, total: 1 }, 1)).toBe('1 of 1 row converts');
    expect(t('step_convert.expectation.converted', { converted: 0, total: 2 }, 2)).toBe('0 of 2 rows convert');
  });
});

describe('rejection', () => {
  it('accepts exactly the params its code lists, so the rejected file shows what the preview shows', () => {
    // @ts-expect-error unknown_type lists no column, so the page would leave no `{column}` open for it.
    rejection(RejectionCode.unknownType, { value: 'x', column: 'Type' });
    // @ts-expect-error amount_negative lists its column.
    rejection(RejectionCode.amountNegative, { value: '-1' });
    expect(rejection(RejectionCode.columnEmpty, { column: 'Fee' })).toEqual(message(MessageCode.columnEmpty, { column: 'Fee' }));
  });
});

describe('fillTemplate', () => {
  it('leaves unknown placeholders and does not refill inserted values', () => {
    expect(fillTemplate('{a} and {b}', { a: '{b}' })).toBe('{b} and {b}');
  });
});
