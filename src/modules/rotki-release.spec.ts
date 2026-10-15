import { describe, expect, it } from 'vitest';
import { NATIVE_IMPORTERS, type RotkiImporter, SKIPPED_IMPORTERS } from '@/modules/convert/native-importers';
import { ROTKI_EVENT_COLUMNS, ROTKI_TRADE_COLUMNS } from './rotki-format';
import { ROTKI_IMPORTER_COLUMNS } from './rotki-release';

/*
 * These fail after `pnpm sync:rotki` when rotki changed something the app relies on. The README's
 * "Updating to a new rotki release" says what to do for each.
 */

function sorted(columns: readonly string[]): string[] {
  return [...columns].sort((a, b) => a.localeCompare(b));
}

const IMPORTERS = Object.keys(ROTKI_IMPORTER_COLUMNS).filter((name): name is RotkiImporter => name in ROTKI_IMPORTER_COLUMNS);

describe('the generic formats', () => {
  it('write exactly the columns rotki\'s generic importers read', () => {
    expect(sorted(ROTKI_TRADE_COLUMNS)).toEqual(sorted(ROTKI_IMPORTER_COLUMNS.rotki_trades));
    expect(sorted(ROTKI_EVENT_COLUMNS)).toEqual(sorted(ROTKI_IMPORTER_COLUMNS.rotki_events));
  });
});

describe('rotki\'s own importers', () => {
  it('match only on columns rotki still reads', () => {
    const readable = new Map<RotkiImporter, ReadonlySet<string>>(IMPORTERS.map(name => [name, new Set(ROTKI_IMPORTER_COLUMNS[name])]));
    const unread = NATIVE_IMPORTERS.flatMap(importer => importer.variants
      .flat()
      .filter(column => !readable.get(importer.id)?.has(column))
      .map(column => `${importer.id}: ${column}`));
    expect(unread).toEqual([]);
  });

  it('cover every importer rotki has, or say why one is skipped', () => {
    const handled = new Set<string>([...NATIVE_IMPORTERS.map(importer => importer.id), ...Object.keys(SKIPPED_IMPORTERS)]);
    expect(IMPORTERS.filter(name => !handled.has(name))).toEqual([]);
  });
});
