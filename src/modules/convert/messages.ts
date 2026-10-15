/** The codes a rejected row can carry; their texts also go to the worker for the rejected file. */
export const RejectionCode = {
  amountNotNumber: 'amount_not_number',
  amountNegative: 'amount_negative',
  columnEmpty: 'column_empty',
  timestampFormat: 'timestamp_format',
  unknownLocation: 'unknown_location',
  unknownType: 'unknown_type',
  feeWithoutCurrency: 'fee_without_currency',
} as const;

export type RejectionCode = (typeof RejectionCode)[keyof typeof RejectionCode];

/**
 * What the converter reports, as codes the page translates. Modules and the worker never build
 * user-facing text; they return a {@link Message} and the consumer looks its code up under
 * `messages.<code>` in the locale.
 */
export const MessageCode = {
  ...RejectionCode,
  // A recipe that cannot convert a file.
  needsSource: 'needs_source',
  needsRoute: 'needs_route',
  missingColumn: 'missing_column',
  unknownTimeZone: 'unknown_time_zone',
  // A saved recipe file that cannot be read.
  notJson: 'not_json',
  notRecipe: 'not_recipe',
  noFormat: 'no_format',
  noInput: 'no_input',
  noDates: 'no_dates',
  noDecimalSeparator: 'no_decimal_separator',
  // A start request the worker refuses.
  requestNotObject: 'request_not_object',
  requestUnknownType: 'request_unknown_type',
  requestNoFile: 'request_no_file',
  requestInvalidOutput: 'request_invalid_output',
  requestInvalidTexts: 'request_invalid_texts',
  // A conversion that stops.
  noStorage: 'no_storage',
  noHeader: 'no_header',
  stopped: 'stopped',
  stoppedWithDetail: 'stopped_with_detail',
} as const;

export type MessageCode = (typeof MessageCode)[keyof typeof MessageCode];

export const REJECTION_CODES: readonly RejectionCode[] = Object.values(RejectionCode);

export type MessageParams = Record<string, string>;

export interface Message<C extends MessageCode = MessageCode> {
  code: C;
  params: MessageParams;
}

export function message<C extends MessageCode>(code: C, params: MessageParams = {}): Message<C> {
  return { code, params };
}

/**
 * The params each rejection carries. {@link rejection} accepts exactly these, so the page, which
 * leaves them open as `{name}` in the texts it sends the worker, cannot miss one the converter sets.
 */
export const REJECTION_PARAMS = {
  [RejectionCode.amountNotNumber]: ['column', 'value', 'separator'],
  [RejectionCode.amountNegative]: ['column', 'value'],
  [RejectionCode.columnEmpty]: ['column'],
  [RejectionCode.timestampFormat]: ['value', 'format'],
  [RejectionCode.unknownLocation]: ['value'],
  [RejectionCode.unknownType]: ['value'],
  [RejectionCode.feeWithoutCurrency]: ['value'],
} as const satisfies Record<RejectionCode, readonly string[]>;

type RejectionParams<C extends RejectionCode> = Record<(typeof REJECTION_PARAMS)[C][number], string>;

/** A rejection with exactly the params {@link REJECTION_PARAMS} lists for its code. */
export function rejection<C extends RejectionCode>(code: C, params: RejectionParams<C>): Message<C> {
  return { code, params };
}

/** A record with a value for every rejection code; the object literal keeps it exhaustive without a cast. */
export function byRejectionCode<T>(value: (code: RejectionCode) => T): Record<RejectionCode, T> {
  return {
    [RejectionCode.amountNotNumber]: value(RejectionCode.amountNotNumber),
    [RejectionCode.amountNegative]: value(RejectionCode.amountNegative),
    [RejectionCode.columnEmpty]: value(RejectionCode.columnEmpty),
    [RejectionCode.timestampFormat]: value(RejectionCode.timestampFormat),
    [RejectionCode.unknownLocation]: value(RejectionCode.unknownLocation),
    [RejectionCode.unknownType]: value(RejectionCode.unknownType),
    [RejectionCode.feeWithoutCurrency]: value(RejectionCode.feeWithoutCurrency),
  };
}

/** The rejected file's texts, in the page's language. */
export interface RejectedFileTexts {
  /** A text per rejection code, with every param left as `{name}` for the worker to fill. */
  reasons: Record<RejectionCode, string>;
  /**
   * Params the page shows differently from the converter's value, as a date format by its name.
   * They replace the row's own value when the worker fills a text.
   */
  shown: MessageParams;
  /** Headers of the two columns added after the source columns. */
  row: string;
  reason: string;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fills `{name}` placeholders in one pass, leaving unknown ones as written. */
export function fillTemplate(template: string, params: MessageParams): string {
  return template.replaceAll(PLACEHOLDER, (placeholder, name: string) => params[name] ?? placeholder);
}

/** The reason text the rejected file gets for a rejection. */
export function rejectionText(texts: RejectedFileTexts, reason: Message<RejectionCode>): string {
  return fillTemplate(texts.reasons[reason.code], { ...reason.params, ...texts.shown });
}

/** A stable key for a message in a list, without translating it. */
export function messageKey(problem: Message): string {
  return `${problem.code}:${JSON.stringify(problem.params)}`;
}

/** An error that carries a {@link Message} for the consumer to translate. */
export class MessageError extends Error {
  override name = 'MessageError';

  constructor(readonly problem: Message, options?: ErrorOptions) {
    super(problem.code, options);
  }
}
