# Contributing

Pull requests are welcome. For a large change, such as a new feature, a new dependency or a change to the file format,
open an issue first, so that we agree on the approach before you spend time on it. Small fixes need no issue.

Report security problems privately, as [SECURITY.md](SECURITY.md) says.

## Set up

You need Node.js 24 or later and pnpm 10.33 (`corepack enable` installs the version that `package.json` names).

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. For the desktop app, run `pnpm desktop:dev`.

## Commands

| Task                 | Command                                                       |
| -------------------- | ------------------------------------------------------------- |
| Dev server (HMR)     | `pnpm dev` → http://127.0.0.1:5173                            |
| Typecheck            | `pnpm typecheck`                                              |
| Lint                 | `pnpm lint`                                                   |
| Format               | `pnpm format` (check only: `pnpm format:check`)               |
| Unit + browser tests | `pnpm test` (`*.browser.test.ts` runs in Chromium)            |
| End-to-end tests     | `pnpm e2e` (Playwright; reuses a running dev server)          |
| Production build     | `pnpm build`                                                  |
| Desktop dev (HMR)    | `pnpm desktop:dev`                                            |
| Desktop build        | `pnpm desktop:build`                                          |
| Desktop e2e          | `pnpm e2e:desktop` (build first)                              |
| Desktop installer    | `pnpm desktop:package` (writes `release/`; publishes nothing) |
| Icon sets            | `pnpm icons` (downloads the official icon packages)           |
| App icon             | `pnpm app-icon` (renders `build/icon.png` and `icon.ico`)     |

Before you open a pull request, run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm e2e`.
For changes to `electron/`, `src/desktop/` or `src/agent/`, also run `pnpm desktop:build` and `pnpm e2e:desktop`. CI
runs the same checks on Windows, macOS and Linux.

## How the code is written

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the parts of the app and why they work as they do.
- [DESIGN.md](DESIGN.md) is the design system: colours, type, components and the rules for each.
- [CLAUDE.md](CLAUDE.md) holds the project conventions. It is written for AI coding agents, but the rules are the same
  for people. Read its section on code comments: the default is no comment, and a comment that only repeats the code
  fails review.
- Write text that users see in sentence case and plain words.
- Add a test for a bug fix or a new behaviour.

## AI tools

You can use AI tools. If you do:

- Read, understand and test every line before you open the pull request. You are the author, not the tool.
- Say so in the pull request template.
- Write the pull request description and your replies in review yourself.

## Icons and logos

The icon sets come from the official packages of AWS, Microsoft, Google, the Kubernetes project and Simple Icons, under
their own terms ([THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)). Do not add icons from other sources, and do not
change the artwork of the official cloud icons.

## Licence

By contributing, you agree that your contribution is licensed under the [MIT licence](LICENSE) of this project.
