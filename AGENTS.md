# rotki migration assistant

A static Vue site that converts CSV exports from exchanges and other tax tools into the generic CSV
formats rotki imports. Everything runs in the browser: nothing is uploaded, and the deployed page
ships a content security policy with `connect-src 'none'`. It is deployed to GitHub Pages at
<https://rotki.github.io/migration-assistant/> by the release workflow only.

This file is the maintenance guide for humans and coding agents. `README.md` covers what the app
does, the recipe format, verifying a deployment, releasing, and updating to a new rotki release in
detail; this guide links there instead of repeating it.

## Toolchain

- Node.js 24 (`.nvmrc`) and pnpm 12 (`packageManager` in `package.json`).
- Vue 3 with `@rotki/ui-library`, built by Vite and pre-rendered with `vite-ssg`.
- Vitest for unit tests (`*.spec.ts` next to the code), Playwright for e2e (`tests/e2e/`).
- Linting with `@rotki/eslint-config` (`eslint.config.mjs`), and the `typos` spell checker in CI.
- Husky hooks: `pre-commit` runs lint-staged, `commit-msg` runs commitlint.

## Layout

- `src/modules/convert/`: the conversion itself: field mapping, fallbacks, routes, suggestions,
  recipes (`recipe.ts`), and the native importers rotki already reads
  (`native-importers.ts`).
- `src/modules/csv/`: CSV parsing.
- `src/modules/rotki-format.ts`: the columns of rotki's generic trades and events formats.
- `src/modules/rotki-release.ts`: locations, event types and importer columns of the rotki release
  the converter targets. **Generated** by `pnpm sync:rotki`; never edit it by hand.
- `src/modules/build-info.ts`, `stale-build.ts`: the footer's release and commit links, and the
  recovery for a tab that outlived a release.
- `src/workers/`: the conversion web worker, with its own `tsconfig.json`.
- `src/components/wizard/`, `src/modules/wizard/`, `src/pages/`: the wizard UI.
- `src/locales/en.json`: all UI strings.
- `tests/e2e/`: `privacy.spec.ts` holds the build to the "nothing leaves your browser" claim;
  `convert.spec.ts` and `new-release.spec.ts` cover the flows, with CSV files in `fixtures/`.
- `scripts/sync-rotki.ts`: the generator for `rotki-release.ts`.
- `vite.config.ts`: the build, including the content security policy added to builds.

## Commands

| Command                                | What it does                                                                |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                             | Dev server (no content security policy, since hot reload needs a websocket) |
| `pnpm build`                           | Static build into `dist/`                                                   |
| `pnpm preview`                         | Serve the build, with the content security policy applied                   |
| `pnpm typecheck`                       | `vue-tsc` for the app and for `src/workers/`                                |
| `pnpm lint` / `pnpm lint:fix`          | ESLint                                                                      |
| `pnpm test:run` / `pnpm test:coverage` | Unit tests once / with coverage, as CI does                                 |
| `pnpm test:e2e`                        | Playwright against `pnpm preview`, so build first                           |
| `pnpm sync:rotki --ref <tag>`          | Regenerate `rotki-release.ts` from a rotki release                          |

CI (`.github/workflows/ci.yml`) runs commitlint on the commits and the pull request title,
`typos`, zizmor, lint, typecheck, unit tests with coverage (uploaded to Codecov with OIDC), the
build, and the e2e privacy checks in the Playwright container image.

## Hard rules

Follow these in every change.

- **Nothing leaves the browser.** No network requests at runtime, no analytics, no fonts, scripts
  or styles from a CDN, no remote error reporting. Do not loosen the content security policy in
  `vite.config.ts`. `tests/e2e/privacy.spec.ts` must keep passing against the production build.
- **Never edit `src/modules/rotki-release.ts` by hand.** Regenerate it with `pnpm sync:rotki` from
  a rotki release tag, never from `develop` (see "Updating to a new rotki release" in the README).
  Treat rotki's source as untrusted input there; widen a pattern in `scripts/sync-rotki.ts` only
  after checking the new value in rotki's source.
- **Keep old recipes loading.** The app writes the newest recipe version and must still read every
  older one. A format change bumps the version and adds a migration with a test.
- **Every UI string goes through `src/locales/en.json`.**
- **Do not lower a check to make it pass.** No `eslint-disable`, `@ts-expect-error`, skipped
  tests, coverage changes, typos ignores or zizmor ignores, unless the commit explains why the
  check is wrong for this case.
- **Do not bypass the git hooks** (`--no-verify`).

## Verify before you finish

A change is done when the checks for it pass locally and you have looked at it running. Report
which commands you ran and their result; if you skipped one, say so and why.

| You changed                                                   | Run                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Anything                                                      | `pnpm lint`, `pnpm typecheck`                                                                           |
| Conversion, CSV parsing, recipes, the worker                  | `pnpm test:run`, with a spec that fails without your change                                             |
| Anything a user sees                                          | `pnpm build && pnpm preview` and check it in a browser, then `pnpm test:e2e`                            |
| Dependencies, `vite.config.ts` or the content security policy | `pnpm build`, then `pnpm test:e2e` (the privacy checks)                                                 |
| `rotki-release.ts` (through `pnpm sync:rotki`)                | `pnpm test:run`, then the manual checks in the README section                                           |
| UI strings                                                    | `src/locales/en.json` only, then check the page                                                         |
| `.github/workflows/`                                          | `actionlint` and `GH_TOKEN=$(gh auth token) zizmor .github/workflows`; pin every action to a commit SHA |

On a system whose Playwright browsers do not run (for example Arch Linux), set
`PLAYWRIGHT_CHROMIUM_PATH` to a system Chromium for `pnpm test:e2e`.

When a check fails, find the cause. Do not retry until it passes, and do not change a test to match
broken behavior.

## Git and pull requests

- Commits and pull request titles follow Conventional Commits; CI checks both. `feat` and `fix`
  commits end up in the release notes. A rotki sync is committed as `feat: match rotki vX.Y.Z`.
- Branch names: `type/short-description` (`fix/kraken-fees`), never an agent-tool prefix such as
  `claude/`.
- End every commit you create or amend with exactly one of each trailer, after a blank line:

  ```text
  LLM-Model: <provider>/<model-id>
  Harness: <harness-name> <version>
  ```

  Use the model selected in the current session, and the version of the harness process that runs
  you, not of a CLI on `PATH` (a desktop app ships its own copy). Walk up the parent processes
  (`ps -o pid=,ppid=,args= -p <pid>`) to the binary and ask it for `--version`. If you cannot
  verify either value, ask before committing.

- No AI `Co-Authored-By` trailers and no "generated with" lines in commits, pull requests or code.
- Do not push to `main`, merge pull requests, create tags or run the release workflow unless the
  maintainer asks for that specific step.

## Recording what you learn

Before you finish, ask whether you hit something the next person would trip over. If you did, first
try to make a tool catch it: a lint rule, a test or a CI check. Write it down only when no tool can,
short and with the fix or the reason, in this file or the README and in the same pull request.
Unfinished work goes to the maintainer as a proposed GitHub issue, never as a to-do list.

## Dependency updates

Renovate lists updates on the Dependency Dashboard issue and opens pull requests only on approval
(`.github/renovate.json5`).

**Prefer one batched update over approving Renovate pull requests one at a time.** Use the
dashboard as the checklist, and do a maintenance pass by hand when updates have piled up and before
a release. A batch is a single branch and pull request, so CI, the e2e privacy checks and review run
once. Renovate notices the merged versions and clears those dashboard entries by itself. Tick a
single dashboard box only for an update that cannot wait, such as a fix for a security advisory.

### Policy

The Renovate rules record versions held on purpose; respect them in a manual pass too:

- **7-day release-age cooldown** in `.github/renovate.json5` and `pnpm-workspace.yaml`. The
  `@rotki/*` packages are excluded.
- **Node 24 and pnpm 12:** `@types/node`, `node` and `pnpm` stay on those majors.
- **TypeScript stays below 7:** `vue-tsc` needs the TypeScript compiler API, which the native
  TypeScript 7 port does not ship yet.
- **`@unhead/vue` stays below 3:** `vite-ssg` renders head tags through version 2.
- **`@vueuse/core` follows `@rotki/ui-library`:** it is kept on the version the UI library pins,
  so the bundle carries one copy. Renovate does not update it.
- **Playwright moves as one:** `@playwright/test` and the `mcr.microsoft.com/playwright` container
  image in `ci.yml` (tag and digest) change together, since each image carries the browsers of one
  release.
- **Groups:** `tailwindcss` with `@tailwindcss/vite`, `vitest` with `@vitest/coverage-v8`, and `vue`
  with `vue-tsc`.
- GitHub Actions and the container image are pinned by digest with the version in a comment.

### Procedure

1. Start from an up to date `main` on a branch such as `chore/deps-update`.
2. Gather the state: `pnpm audit`, `pnpm outdated`, and the dashboard
   (`gh issue list -R rotki/migration-assistant --search "Dependency Dashboard in:title"`).
3. Check publish dates (`npm view <package> "time[<version>]"`) and skip anything younger than 7
   days.
4. Bump with `pnpm add -E` (or `-D -E`), keeping the groups above together. Update pnpm with
   `corepack use pnpm@<version>`, action pins with
   `gh api repos/<owner>/<repo>/commits/<tag> -q .sha`, and the Playwright image with its
   matching tag and digest.
5. Refresh vulnerable transitive packages with `pnpm update --depth Infinity <package> ...`, and
   trace what remains with `pnpm why`.
6. Verify with the table above, including `pnpm build` and `pnpm test:e2e`.
7. Commit in parts: `ci: update github actions` for workflow pins and the container image, and
   `chore(deps): update dependencies` (or `fix(deps):` when it changes the shipped app) for the
   rest.

## Workflow changes

Check any change under `.github/workflows/`, including pin bumps, with both tools:

- [actionlint](https://github.com/rhysd/actionlint) checks that workflows are valid: syntax,
  expressions, references, action inputs, and `run:` scripts through shellcheck. Run `actionlint`
  from the repository root.
- [zizmor](https://docs.zizmor.sh/) checks workflow security. CI runs it in the `zizmor` job; run it
  locally with a token so the online audits run too:

  ```sh
  GH_TOKEN=$(gh auth token) zizmor .github/workflows
  ```

The current baseline for both is no findings, and a change must keep it that way. Keep the
existing patterns: `permissions: {}` at the top level with per-job grants, `timeout-minutes` on
every job, `persist-credentials: false` on checkout, SHA pins with a version comment, expressions
passed to `run:` through `env:`, and no dependency cache in the release workflow (a cache written
by another run must not end up in an attested build).

## Releasing

Follow "Releasing" in the README: run the `release` workflow from the Actions tab on `main` with
the version (`0.2.0`, without the `v`). It builds and attests the site, waits for a maintainer to
approve the `github-pages` deployment, deploys, then tags the deployed commit and publishes release
notes with the site tarball attached.

- Do not tag or create releases by hand; the workflow tags the commit it deployed.
- After it finishes, check the footer of the live page links the new release and commit, and
  verify a file with `gh attestation verify` as the README shows.

### Versioning

Semantic versioning on the `0.x` line: a minor for new formats, importers or wizard features, a
patch for fixes and rotki syncs that only add values. A change that makes existing recipe files
unreadable is not allowed (see Hard rules).

## Repository settings

These live in GitHub, not in the repository. Keep this list current when they change.

- `main` is guarded by rulesets instead of branch protection:
  - `main`: pull requests with 1 approving review and code owner review, and the `commit-lint`,
    `check-typos`, `zizmor`, `ci`, `e2e`, `license/cla`, `analyze (actions)` and
    `analyze (javascript-typescript)` checks. Organization admins can bypass it.
  - `main history`: no deletion, no force pushes, linear history.
  - `release tags` (`v*`): no deletion, update or force push.
  - `tag protection` (every tag except `v*`): no deletion or force push, and no creation. Since
    `v*` is excluded, the release workflow can create release tags, which `release tags` then
    keeps from moving.
- The `github-pages` environment accepts deployments from `main` only and requires approval from a
  required reviewer.
- `CODEOWNERS` assigns everything to `@rotki/maintainers`, which has write access.
- Codecov uploads use OIDC; there are no repository secrets.
