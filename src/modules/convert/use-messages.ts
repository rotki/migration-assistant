import { type Composer, useI18n } from 'vue-i18n';
import { DateFormat } from './dates';
import { byRejectionCode, type Message, MessageCode, type MessageParams, type RejectedFileTexts, REJECTION_PARAMS } from './messages';

export interface Messages {
  /** The text for a message from the converter, in the page's language. */
  translate: (problem: Message) => string;
  /** A date format as people read it: the name of a named format, a pattern as written. */
  dateFormatName: (format: string) => string;
  /** The rejected file's texts for a run with this date format, for the worker to fill per row. */
  rejectedFileTexts: (dateFormat: string) => RejectedFileTexts;
}

type Text = (params: MessageParams) => string;

/** Translates the codes the converter and the worker report, with any vue-i18n `t`. */
export function createMessages(t: Composer['t']): Messages {
  /** One entry per code, with literal keys the i18n lint rules can check; a code without a text fails to compile. */
  const texts: Record<MessageCode, Text> = {
    [MessageCode.amountNotNumber]: params => t('messages.amount_not_number', params),
    [MessageCode.amountNegative]: params => t('messages.amount_negative', params),
    [MessageCode.columnEmpty]: params => t('messages.column_empty', params),
    [MessageCode.timestampFormat]: params => t('messages.timestamp_format', params),
    [MessageCode.unknownLocation]: params => t('messages.unknown_location', params),
    [MessageCode.unknownType]: params => t('messages.unknown_type', params),
    [MessageCode.feeWithoutCurrency]: params => t('messages.fee_without_currency', params),
    [MessageCode.needsSource]: params => t('messages.needs_source', params),
    [MessageCode.missingColumn]: params => t('messages.missing_column', params),
    [MessageCode.unknownTimeZone]: params => t('messages.unknown_time_zone', params),
    [MessageCode.notJson]: () => t('messages.not_json'),
    [MessageCode.notRecipe]: () => t('messages.not_recipe'),
    [MessageCode.noFormat]: () => t('messages.no_format'),
    [MessageCode.noInput]: () => t('messages.no_input'),
    [MessageCode.noDates]: () => t('messages.no_dates'),
    [MessageCode.noDecimalSeparator]: () => t('messages.no_decimal_separator'),
    [MessageCode.requestNotObject]: () => t('messages.request_not_object'),
    [MessageCode.requestUnknownType]: () => t('messages.request_unknown_type'),
    [MessageCode.requestNoFile]: () => t('messages.request_no_file'),
    [MessageCode.requestInvalidOutput]: () => t('messages.request_invalid_output'),
    [MessageCode.requestInvalidTexts]: () => t('messages.request_invalid_texts'),
    [MessageCode.noStorage]: () => t('messages.no_storage'),
    [MessageCode.noHeader]: () => t('messages.no_header'),
    [MessageCode.stopped]: () => t('messages.stopped'),
    [MessageCode.stoppedWithDetail]: params => t('messages.stopped_with_detail', params),
  };

  const formatNames: Record<string, () => string> = {
    [DateFormat.iso]: () => t('step_formats.date_format.names.iso'),
    [DateFormat.unixSeconds]: () => t('step_formats.date_format.names.unix_s'),
    [DateFormat.unixMilliseconds]: () => t('step_formats.date_format.names.unix_ms'),
  } satisfies Record<DateFormat, () => string>;

  function dateFormatName(format: string): string {
    return formatNames[format]?.() ?? format;
  }

  /** Params as the texts show them: a date format by its name. */
  function shown(params: MessageParams): MessageParams {
    return params.format === undefined ? params : { ...params, format: dateFormatName(params.format) };
  }

  function translate(problem: Message): string {
    return texts[problem.code](shown(problem.params));
  }

  function rejectedFileTexts(dateFormat: string): RejectedFileTexts {
    return {
      reasons: byRejectionCode(code => texts[code](Object.fromEntries(REJECTION_PARAMS[code].map(name => [name, `{${name}}`])))),
      shown: { format: dateFormatName(dateFormat) },
      row: t('rejected_file.row'),
      reason: t('rejected_file.reason'),
    };
  }

  return { translate, dateFormatName, rejectedFileTexts };
}

/** {@link createMessages} with the app's global `t`, for components. */
export function useMessages(): Messages {
  const { t } = useI18n({ useScope: 'global' });
  return createMessages(t);
}
