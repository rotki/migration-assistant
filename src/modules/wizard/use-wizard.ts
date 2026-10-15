import type { Message } from '@/modules/convert/messages';
import { computed, type ComputedRef, inject, type InjectionKey, provide, type Ref, ref, shallowRef } from 'vue';
import { DateFormat, detectDateFormats } from '@/modules/convert/dates';
import { DecimalSeparator, detectDecimalSeparator } from '@/modules/convert/numbers';
import { meetsAll, MOVED_AMOUNT_COLUMNS, type Recipe, RecipeFormat, SourceKind } from '@/modules/convert/recipe';
import { createRowConverter, RecipeError, type RowResult } from '@/modules/convert/row-converter';
import { guessEventTypes, guessLocation, guessSeparator, guessSwap, suggestFormat, suggestMapping } from '@/modules/convert/suggest';
import { parseCsv } from '@/modules/csv/parser';
import { decodeSample, detectDelimiter, detectEncoding, detectHeaderIndex, normalizeHeader, SAMPLE_BYTES } from '@/modules/csv/sniff';
import { RotkiColumn, RotkiFormat } from '@/modules/rotki-format';

const PREVIEW_ROWS = 50;

export interface PreviewRow {
  row: number;
  record: string[];
  result: RowResult;
}

export interface Preview {
  /** What keeps the recipe from converting this file, as messages to translate. */
  problems: Message[];
  rows: PreviewRow[];
}

export interface Wizard {
  file: Ref<File | undefined>;
  recipe: Ref<Recipe>;
  /** Every record in the sample, header and preamble included. */
  records: ComputedRef<string[][]>;
  header: ComputedRef<string[]>;
  /** Records below the header in the sample. */
  rows: ComputedRef<string[][]>;
  /** Whether the sample is the whole file, so the counts are final. */
  isWholeFile: Ref<boolean>;
  preview: ComputedRef<Preview>;
  dateFormats: ComputedRef<string[]>;
  /** The format the file most likely is, chosen when it was loaded. */
  suggestedFormat: Ref<RecipeFormat | undefined>;
  /** The wizard step on screen, counted from 0. */
  step: Ref<number>;
  loadFile: (file: File) => Promise<void>;
  setFormat: (format: RecipeFormat) => void;
  applyRecipe: (recipe: Recipe) => void;
  /**
   * The non-empty values of a source column in the sample. With `output`, a recipe of format
   * `both` gives only the rows that go to that rotki file, so a trade's label is not offered as
   * an event type.
   */
  columnSamples: (column: string, output?: RotkiFormat) => string[];
  /** Forgets the file and the recipe and returns to the first step. */
  restart: () => void;
}

const WIZARD: InjectionKey<Wizard> = Symbol('wizard');

/** Exchanges export in UTC far more often than in the viewer's zone. */
const DEFAULT_TIME_ZONE = 'UTC';

function emptyRecipe(): Recipe {
  return {
    version: 2,
    name: '',
    input: { encoding: 'utf-8', delimiter: ',', headerIndex: 0 },
    format: RotkiFormat.trades,
    fields: {},
    numbers: { decimalSeparator: DecimalSeparator.dot },
    dates: { format: DateFormat.iso, timeZone: DEFAULT_TIME_ZONE },
  };
}

export function provideWizard(): Wizard {
  const file = ref<File>();
  const bytes = shallowRef<Uint8Array>(new Uint8Array());
  const isWholeFile = ref(true);
  const recipe = ref<Recipe>(emptyRecipe());
  const step = ref(0);
  const suggestedFormat = ref<RecipeFormat>();

  function restart(): void {
    file.value = undefined;
    bytes.value = new Uint8Array();
    isWholeFile.value = true;
    recipe.value = emptyRecipe();
    step.value = 0;
    suggestedFormat.value = undefined;
  }

  const text = computed<string>(() => decodeSample(bytes.value, recipe.value.input.encoding, isWholeFile.value));
  const records = computed<string[][]>(() => parseCsv(text.value, recipe.value.input.delimiter));
  const header = computed<string[]>(() => normalizeHeader(records.value[recipe.value.input.headerIndex] ?? []));
  const rows = computed<string[][]>(() => records.value.slice(recipe.value.input.headerIndex + 1));

  /** Whether a record goes to `output`; for a recipe of a single format, every record does. */
  function goesTo(record: readonly string[], output: RotkiFormat | undefined): boolean {
    if (!output || recipe.value.format !== RecipeFormat.both)
      return true;
    const isTrade = meetsAll(recipe.value.route, name => record[header.value.indexOf(name)] ?? '');
    return isTrade === (output === RotkiFormat.trades);
  }

  function columnSamples(column: string, output?: RotkiFormat): string[] {
    const index = header.value.indexOf(column);
    if (index === -1)
      return [];
    return rows.value
      .filter(record => goesTo(record, output))
      .map(record => record[index] ?? '')
      .filter(value => value.trim() !== '');
  }

  const dateFormats = computed<string[]>(() => {
    const source = recipe.value.fields[RotkiColumn.timestamp]?.source;
    if (source?.kind !== SourceKind.column)
      return [];
    return detectDateFormats(columnSamples(source.column).slice(0, 500), recipe.value.dates.timeZone);
  });

  function detectFormats(): void {
    const timestamp = recipe.value.fields[RotkiColumn.timestamp]?.source;
    if (timestamp?.kind === SourceKind.column) {
      const formats = detectDateFormats(columnSamples(timestamp.column).slice(0, 500), recipe.value.dates.timeZone);
      if (formats[0])
        recipe.value.dates.format = formats[0];
    }
    const amounts = MOVED_AMOUNT_COLUMNS
      .map(column => recipe.value.fields[column]?.source)
      .flatMap(source => (source?.kind === SourceKind.column ? columnSamples(source.column).slice(0, 500) : []));
    recipe.value.numbers.decimalSeparator = detectDecimalSeparator(amounts);
  }

  function guessTypes(): void {
    const type = recipe.value.fields[RotkiColumn.type];
    if (type?.source.kind !== SourceKind.column)
      return;
    type.values = guessEventTypes(columnSamples(type.source.column, RotkiFormat.events));
  }

  /** Fits the suggested separators to the values, as `-` for `BTC-EUR`. */
  function guessSeparators(): void {
    for (const mapping of Object.values(recipe.value.fields)) {
      if (mapping.split && mapping.source.kind === SourceKind.column)
        mapping.split.separator = guessSeparator(columnSamples(mapping.source.column).slice(0, 100)) ?? mapping.split.separator;
    }
  }

  function setFormat(format: RecipeFormat): void {
    recipe.value.format = format;
    const { fields, route } = suggestMapping(header.value, format);
    recipe.value.fields = fields;
    if (route)
      recipe.value.route = route;
    else
      delete recipe.value.route;
    const location = guessLocation(file.value?.name ?? '');
    if (location)
      recipe.value.fields[RotkiColumn.location] = { source: { kind: SourceKind.constant, value: location } };
    const swap = format === RotkiFormat.trades ? guessSwap(header.value, columnSamples) : undefined;
    if (swap)
      recipe.value.swap = swap;
    else
      delete recipe.value.swap;
    guessSeparators();
    guessTypes();
    detectFormats();
  }

  async function loadFile(selected: File): Promise<void> {
    const sample = new Uint8Array(await selected.slice(0, SAMPLE_BYTES).arrayBuffer());
    file.value = selected;
    isWholeFile.value = selected.size <= SAMPLE_BYTES;
    bytes.value = sample;

    const encoding = detectEncoding(sample);
    const decoded = decodeSample(sample, encoding, isWholeFile.value);
    const delimiter = detectDelimiter(decoded);
    const headerIndex = detectHeaderIndex(parseCsv(decoded, delimiter));
    recipe.value = {
      ...emptyRecipe(),
      name: selected.name.replace(/\.[^.]+$/, ''),
      input: { encoding, delimiter, headerIndex },
    };
    suggestedFormat.value = suggestFormat(header.value, columnSamples);
    setFormat(suggestedFormat.value);
  }

  /** Takes over a saved recipe for the loaded file; the file's own detection is replaced. */
  function applyRecipe(saved: Recipe): void {
    recipe.value = structuredClone(saved);
  }

  const preview = computed<Preview>(() => {
    try {
      const convert = createRowConverter(recipe.value, header.value);
      return {
        problems: [],
        // Rows are numbered as the file table counts them, preamble and header included.
        rows: rows.value.slice(0, PREVIEW_ROWS).map((record, index) => ({ row: recipe.value.input.headerIndex + index + 2, record, result: convert(record) })),
      };
    }
    catch (error) {
      if (error instanceof RecipeError)
        return { problems: error.problems, rows: [] };
      throw error;
    }
  });

  const wizard: Wizard = {
    file,
    recipe,
    records,
    header,
    rows,
    isWholeFile,
    preview,
    dateFormats,
    suggestedFormat,
    step,
    loadFile,
    setFormat,
    applyRecipe,
    columnSamples,
    restart,
  };
  provide(WIZARD, wizard);
  return wizard;
}

export function useWizard(): Wizard {
  const wizard = inject(WIZARD);
  if (!wizard)
    throw new Error('useWizard needs provideWizard in a parent component.');
  return wizard;
}
