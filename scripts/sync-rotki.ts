/**
 * Regenerates `src/modules/rotki-release.ts` from rotki's source at a release tag: the locations
 * rotki deserializes, the event types its generic importer maps, and the columns each of its CSV
 * importers reads. Prints what changed since the last sync. See "Updating to a new rotki release"
 * in the README.
 *
 * Usage: `pnpm sync:rotki --ref v1.45.0`, reading rotki from GitHub, or add `--repo ../rotki` to
 * read a local clone that has the tag.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const IMPORTERS_DIR = 'rotkehlchen/data_import/importers';
const OUTPUT = fileURLToPath(new URL('../src/modules/rotki-release.ts', import.meta.url));

/** `Location` members that are not a place a row comes from; rotki keeps them for its own use. */
const NOT_LOCATIONS = new Set(['TOTAL']);

/** Files in the importers folder that are not an importer. */
const NOT_IMPORTERS = new Set(['__init__', 'constants']);

/** The importers built on rotki's shared generic helper, and the helper that reads part of their columns. */
const GENERIC_IMPORTERS = new Set(['rotki_events', 'rotki_trades']);
const GENERIC_HELPER = 'process_rotki_generic_import_csv_fields';

interface Source {
  read: (path: string) => Promise<string>;
  list: (dir: string) => Promise<string[]>;
}

interface Release {
  ROTKI_RELEASE: string;
  ROTKI_LOCATIONS: readonly string[];
  ROTKI_EVENT_TYPES: readonly string[];
  ROTKI_IMPORTER_COLUMNS: Record<string, readonly string[]>;
}

function gitSource(repo: string, ref: string): Source {
  const git = (...args: string[]): string => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    read: async path => git('show', `${ref}:${path}`),
    list: async dir => git('ls-tree', '--name-only', ref, `${dir}/`).split('\n').filter(Boolean),
  };
}

function githubSource(ref: string): Source {
  async function get(url: string): Promise<Response> {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`${url} answered ${response.status}.`);
    return response;
  }
  return {
    read: async path => (await get(`https://raw.githubusercontent.com/rotki/rotki/${ref}/${path}`)).text(),
    list: async (dir) => {
      const entries: unknown = await (await get(`https://api.github.com/repos/rotki/rotki/contents/${dir}?ref=${ref}`)).json();
      if (!Array.isArray(entries))
        throw new TypeError(`GitHub listed no files in ${dir} at ${ref}.`);
      return entries.flatMap(entry => (typeof entry?.path === 'string' ? [entry.path] : []));
    },
  };
}

/** The text of a Python block that starts at `start`, up to the next line indented no deeper than it. */
function pythonBlock(text: string, start: string): string {
  const from = text.indexOf(start);
  if (from === -1)
    throw new Error(`rotki's source has no \`${start}\`; the sync script needs updating.`);
  const lines = text.slice(from).split('\n');
  const end = lines.findIndex((line, index) => index > 0 && line.trim() !== '' && !/^\s/.test(line) && !line.startsWith(')') && !line.startsWith('}'));
  return lines.slice(0, end === -1 ? undefined : end).join('\n');
}

/** `Location` members as `Location.deserialize` reads them: the name in lower case, `_` as a space. */
function readLocations(types: string): string[] {
  const block = pythonBlock(types, 'class Location(');
  return Array.from(block.matchAll(/^ {4}([A-Z][A-Z0-9_]*) = \d+/gm), match => match[1] ?? '')
    .filter(name => !NOT_LOCATIONS.has(name))
    .map(name => name.toLowerCase().replaceAll('_', ' '));
}

/** The `Type` values rotki's generic events importer maps to an event. */
function readEventTypes(events: string): string[] {
  const block = pythonBlock(events, 'GENERIC_TYPE_TO_HISTORY_EVENT_TYPE_MAPPINGS');
  return Array.from(block.matchAll(/^\s+'([^']+)':/gm), match => match[1] ?? '');
}

/**
 * The column names an importer's code mentions: row lookups (`csv_row['Date']`), Kucoin's
 * `*_key = 'Date'` assignments and header lines it matches as written (`'a,b,c' in first_line`).
 */
function readColumns(code: string): Set<string> {
  const columns = new Set<string>();
  const patterns = [
    /\b(?:csv_row|row|entry)\[['"]([^'"]+)['"]\]/g,
    /\b(?:csv_row|row|entry)\.get\(['"]([^'"]+)['"]/g,
    /\b\w+_key(?:\s*,\s*\w+)?\s*=\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern))
      columns.add(match[1] ?? '');
  }
  for (const match of code.matchAll(/['"]([^'"]*,[^'"]*)['"]\s+in\s+first_line/g)) {
    for (const column of (match[1] ?? '').split(','))
      columns.add(column);
  }
  columns.delete('');
  return columns;
}

async function readImporterColumns(source: Source): Promise<Record<string, string[]>> {
  const files = (await source.list(IMPORTERS_DIR)).filter(path => path.endsWith('.py'));
  const helper = pythonBlock(await source.read('rotkehlchen/data_import/utils.py'), `def ${GENERIC_HELPER}(`);
  const importers: Record<string, string[]> = {};
  for (const path of files) {
    const name = path.slice(path.lastIndexOf('/') + 1, -'.py'.length);
    if (NOT_IMPORTERS.has(name))
      continue;
    const code = await source.read(path);
    const columns = readColumns(code);
    if (GENERIC_IMPORTERS.has(name)) {
      for (const column of readColumns(helper))
        columns.add(column);
      for (const match of code.matchAll(new RegExp(`${GENERIC_HELPER}\\(\\s*csv_row,\\s*'([^']+)'`, 'g')))
        columns.add(match[1] ?? '');
    }
    importers[name] = [...columns].sort((a, b) => a.localeCompare(b));
  }
  return Object.fromEntries(Object.entries(importers).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * What each value may look like before it goes into the generated module. rotki's source is read
 * as untrusted text: a value outside these stops the sync instead of being written into code the
 * app imports. Widen a pattern only after checking the value in rotki's source.
 */
const PATTERNS = {
  release: /^v\d+\.\d+\.\d+(?:-[\w.]+)?$/,
  location: /^[a-z0-9]+(?: [a-z0-9]+)*$/,
  eventType: /^[A-Z][a-z]+$/,
  importer: /^[a-z][a-z0-9_]*$/,
  column: /^[\w .,/()-]+$/,
} as const;

function check(kind: keyof typeof PATTERNS, values: readonly string[]): void {
  const unexpected = values.filter(value => !PATTERNS[kind].test(value));
  if (unexpected.length > 0)
    throw new Error(`rotki's source has an unexpected ${kind}: ${unexpected.map(value => JSON.stringify(value)).join(', ')}. Check it, then widen PATTERNS.${kind} in this script if it is real.`);
}

/**
 * Lower bounds on what a release holds. Parsing rotki's source with patterns fails quietly when the
 * source changes shape, and an empty list would silently drop every location instead of stopping.
 */
const MINIMUMS = {
  locations: 20,
  eventTypes: 4,
  importers: 10,
} as const;

function checkSize(kind: keyof typeof MINIMUMS, count: number): void {
  if (count < MINIMUMS[kind])
    throw new Error(`Read only ${count} ${kind} from rotki's source, expected at least ${MINIMUMS[kind]}. Its layout probably changed; update the parsing in this script.`);
}

/**
 * Every value of the release, checked against {@link PATTERNS}, plus the sizes in {@link MINIMUMS}
 * and the importers the generic formats depend on. Throws instead of returning a release it doubts.
 */
function validate(release: Release): Release {
  checkSize('locations', release.ROTKI_LOCATIONS.length);
  checkSize('eventTypes', release.ROTKI_EVENT_TYPES.length);
  checkSize('importers', Object.keys(release.ROTKI_IMPORTER_COLUMNS).length);
  for (const name of GENERIC_IMPORTERS) {
    if ((release.ROTKI_IMPORTER_COLUMNS[name] ?? []).length === 0)
      throw new Error(`Read no columns for rotki's ${name} importer; the generic formats depend on it.`);
  }
  check('release', [release.ROTKI_RELEASE]);
  check('location', release.ROTKI_LOCATIONS);
  check('eventType', release.ROTKI_EVENT_TYPES);
  check('importer', Object.keys(release.ROTKI_IMPORTER_COLUMNS));
  check('column', Object.values(release.ROTKI_IMPORTER_COLUMNS).flat());
  return release;
}

function quote(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`;
}

function list(items: readonly string[], indent: string): string {
  return items.map(item => `${indent}${quote(item)},\n`).join('');
}

function render(release: Release): string {
  const importers = Object.entries(release.ROTKI_IMPORTER_COLUMNS)
    .map(([name, columns]) => `  ${name}: [\n${list(columns, '    ')}  ],\n`)
    .join('');
  return `/**
 * What rotki ${release.ROTKI_RELEASE} reads, generated by \`pnpm sync:rotki\` from rotki's source. Do not edit by
 * hand: see "Updating to a new rotki release" in the README.
 */
export const ROTKI_RELEASE = ${quote(release.ROTKI_RELEASE)};

/**
 * Locations rotki deserializes, as \`Location.serialize()\` writes them: the enum name in lower
 * case with spaces for underscores. rotki files any other value under \`external\` without a word,
 * so the converter rejects those rows instead.
 */
export const ROTKI_LOCATIONS = [
${list(release.ROTKI_LOCATIONS, '  ')}] as const;

/** Values rotki accepts in the \`Type\` column of a generic events file. */
export const ROTKI_EVENT_TYPES = [
${list(release.ROTKI_EVENT_TYPES, '  ')}] as const;

/**
 * The columns each of rotki's CSV importers reads, by importer module in
 * \`${IMPORTERS_DIR}\`. An importer that handles several layouts lists the
 * columns of all of them.
 */
export const ROTKI_IMPORTER_COLUMNS = {
${importers}} as const;
`;
}

function isRelease(module: unknown): module is Release {
  return typeof module === 'object' && module !== null && 'ROTKI_RELEASE' in module && 'ROTKI_LOCATIONS' in module
    && 'ROTKI_EVENT_TYPES' in module && 'ROTKI_IMPORTER_COLUMNS' in module;
}

/** The release the last sync wrote, to report what changes; `undefined` before the first sync. */
async function previousRelease(): Promise<Release | undefined> {
  if (!existsSync(OUTPUT))
    return undefined;
  const module: unknown = await import(pathToFileURL(OUTPUT).href);
  return isRelease(module) ? module : undefined;
}

function difference(label: string, before: readonly string[] = [], after: readonly string[] = []): string[] {
  const added = after.filter(item => !before.includes(item));
  const removed = before.filter(item => !after.includes(item));
  return [
    ...(added.length > 0 ? [`  ${label} added: ${added.join(', ')}`] : []),
    ...(removed.length > 0 ? [`  ${label} removed: ${removed.join(', ')}`] : []),
  ];
}

function report(before: Release | undefined, after: Release): string {
  if (!before)
    return `Wrote ${after.ROTKI_RELEASE}; there was no earlier sync to compare with.`;
  const importers = [...new Set([...Object.keys(before.ROTKI_IMPORTER_COLUMNS), ...Object.keys(after.ROTKI_IMPORTER_COLUMNS)])].sort();
  const lines = [
    ...difference('locations', before.ROTKI_LOCATIONS, after.ROTKI_LOCATIONS),
    ...difference('event types', before.ROTKI_EVENT_TYPES, after.ROTKI_EVENT_TYPES),
    ...difference('importers', Object.keys(before.ROTKI_IMPORTER_COLUMNS), Object.keys(after.ROTKI_IMPORTER_COLUMNS)),
    ...importers.flatMap(name => difference(`${name} columns`, before.ROTKI_IMPORTER_COLUMNS[name], after.ROTKI_IMPORTER_COLUMNS[name])),
  ];
  const changes = lines.length > 0 ? lines.join('\n') : '  nothing changed';
  return `${before.ROTKI_RELEASE} -> ${after.ROTKI_RELEASE}\n${changes}\n\nNext: pnpm test:run, then follow "Updating to a new rotki release" in the README.`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { ref: { type: 'string' }, repo: { type: 'string' } } });
  const ref = values.ref;
  if (!ref)
    throw new Error('Pass the rotki release tag to read, as --ref v1.45.0.');
  const source = values.repo ? gitSource(values.repo, ref) : githubSource(ref);
  const release = validate({
    ROTKI_RELEASE: ref,
    ROTKI_LOCATIONS: readLocations(await source.read('rotkehlchen/types.py')),
    ROTKI_EVENT_TYPES: readEventTypes(await source.read(`${IMPORTERS_DIR}/rotki_events.py`)),
    ROTKI_IMPORTER_COLUMNS: await readImporterColumns(source),
  });
  const before = await previousRelease();
  writeFileSync(OUTPUT, render(release));
  console.log(report(before, release));
}

await main();
