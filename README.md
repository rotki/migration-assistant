# rotki migration assistant

Convert a CSV export from any exchange into one of the generic CSV formats
[rotki](https://rotki.com) imports: generic trades or generic events.

Everything runs in your browser. Files are read and converted inside the page, nothing is
uploaded, and the deployed page ships a content security policy with `connect-src 'none'`,
so the browser blocks any network request it would make.

Live at <https://rotki.github.io/migration-assistant/>.

## Verifying a deployment

The footer of the live page links the commit it was built from and the GitHub Actions run
that built it. Every deployed HTML, JavaScript and CSS file carries a build provenance
attestation, which you can check against this repository:

```bash
gh attestation verify index.html --repo rotki/migration-assistant
```

The deployment ships source maps, so the browser's developer tools show the deployed code as
the source files in this repository.

Deployments run only from `main`, and each one waits for a maintainer's approval in the
`github-pages` environment.

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

## License

[AGPL-3.0](LICENSE.md)
