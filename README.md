# rotki migration assistant

Convert a CSV export from any exchange into one of the generic CSV formats
[rotki](https://rotki.com) imports: generic trades, generic events, or both from one file,
as for exports of other tax tools where each row sends, receives or swaps.

Everything runs in your browser. Files are read and converted inside the page, nothing is
uploaded, and the deployed page ships a content security policy with `connect-src 'none'`,
so the browser blocks any network request it would make.

Live at <https://rotki.github.io/migration-assistant/>.

## Recipes

The mapping a conversion uses can be saved as a recipe file (`*.recipe.json`) and loaded on
the first step next time, so an export from the same source converts without setting it up
again. The format is `Recipe` in `src/modules/convert/recipe.ts`; this app writes version 2
and still reads version 1 files.

- `format` is `trades`, `events` or `both`.
- `fields` maps each rotki column to a `source`: a column of the export, a fixed value or
  nothing. A field can split the value (`BTC` from `BTC/EUR`), replace values through a
  table, or drop the sign of an amount.
- `fallbacks` on a field are tried in order when its source is empty, each when its
  conditions hold, as an event's currency taken from `Sent Currency` when
  `Received Currency` is empty.
- `route`, for `both`: the conditions a row has to meet to become a trade. Every other row
  becomes an event.
- A condition tests one column of the row: `filled`, `empty`, or `one_of` a list of values.

The wizard edits the common shapes of fallbacks and routes. A recipe file can hold any other
combination, which the wizard then shows as it is.

## Verifying a deployment

The footer of the live page links the release it belongs to, the commit it was built from
and the GitHub Actions run that built it. Every deployed HTML, JavaScript and CSS file, and
the site tarball attached to each release, carries a build provenance attestation, which you
can check against this repository:

```bash
gh attestation verify index.html --repo rotki/migration-assistant
gh attestation verify migration-assistant-v0.1.0.tar.gz --repo rotki/migration-assistant
```

The deployment ships source maps, so the browser's developer tools show the deployed code as
the source files in this repository.

## Releasing

The site is deployed only by releases. Run the **release** workflow from the Actions tab on
`main` with the version, such as `0.2.0`. It builds that commit, waits for a maintainer to
approve the deployment in the `github-pages` environment, deploys it, then tags the commit
and publishes release notes generated from the conventional commits since the last release,
with the deployed site attached.

## Development

Requires Node.js 24 and pnpm 12.

```bash
pnpm install
pnpm dev          # dev server
pnpm build        # static build in dist/
pnpm preview      # serve the build, with the content security policy applied
pnpm test         # unit tests
pnpm lint
pnpm typecheck
```

The content security policy is only added to builds, since the dev server needs a
websocket for hot reload. Use `pnpm build && pnpm preview` to check behavior under it.

## Updating to a new rotki release

The converter has to agree with the rotki release people import into, in two places:

- **Locations.** rotki files a `Location` value it does not know under `external` without a
  word, so the converter only accepts the locations the release deserializes.
- **Importer columns.** The generic trades and events formats must have exactly the columns
  rotki's generic importers read. The file step also recognises exports that one of rotki's own
  importers (Binance, Kucoin and the others under Import Data) reads as they are, by the
  columns each importer reads.

Both come from `src/modules/rotki-release.ts`, which is generated from rotki's source. Do not
edit it by hand. To move to a new release:

1. Regenerate it from the release tag:

   ```bash
   pnpm sync:rotki --ref v1.45.0                    # reads rotki from GitHub
   pnpm sync:rotki --ref v1.45.0 --repo ../rotki    # or from a local clone with the tag
   ```

   The script prints what changed since the last sync: locations, event types, importers and
   the columns of each importer.

   It treats rotki's source as untrusted text, since what it reads ends up in code the app
   imports. Every value must match a strict pattern (`PATTERNS` in `scripts/sync-rotki.ts`),
   the ref must be a release tag, and each list must have a plausible size. Anything else stops
   the sync without writing. If rotki adds a value the patterns reject, such as a column with a
   new character, check it in rotki's source first, then widen the pattern.

2. Run `pnpm test:run`. `src/modules/rotki-release.spec.ts` fails when the change needs a
   decision, and the failure names the importer and column:

   - **"match only on columns rotki still reads"**: an importer renamed or dropped a column
     that `NATIVE_IMPORTERS` in `src/modules/convert/native-importers.ts` matches on. Update
     that importer's variants from its module in `rotkehlchen/data_import/importers/`.
   - **"cover every importer rotki has"**: rotki added an importer. Add it to
     `NATIVE_IMPORTERS` with the columns it requires (its `name` as rotki's Import Data page
     lists it), or to `SKIPPED_IMPORTERS` with the reason, as Bittrex is.
   - **"write exactly the columns rotki's generic importers read"**: the generic formats
     changed. Update `RotkiColumn`, `ROTKI_TRADE_COLUMNS` and `ROTKI_EVENT_COLUMNS` in
     `src/modules/rotki-format.ts`, and the converter if a column means something new.

3. Check what the tests cannot:

   - **New columns in an importer you match on.** The script reports them. If rotki now
     requires one, add it to that importer's variant, or the file step would send people to an
     importer that rejects their file.
   - **New event types.** They appear in the Type options on their own. Check that
     `guessEventType` in `src/modules/convert/suggest.ts` maps exchange labels to them.
   - **New Import Data sections**, such as a third tab on an importer page: add them to
     `ImporterSection` and to `step_file.native_importer.sections` in `src/locales/en.json`.

4. Commit the regenerated file with the changes, as `feat: match rotki v1.45.0`, so the release
   notes say which rotki release the converter targets.

Sync to a release tag, not to `develop`: people import into the release they run, and a
location that exists only on `develop` would land under `external` in their rotki.

## License

[AGPL-3.0](LICENSE.md)
