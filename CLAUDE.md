# Diagrams

React app for animated architecture diagrams and user flows, as a website and as an Electron desktop
app. The website keeps data in `localStorage`; the desktop app keeps files in `Documents/Diagrams`
and runs an MCP server for AI agents. Read `docs/ARCHITECTURE.md` for the architecture and the
reasons behind it.

## Commands

| Task                 | Command                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Dev server (HMR)     | `pnpm dev` → http://127.0.0.1:5173                                                             |
| Typecheck            | `pnpm typecheck` (TypeScript 7, `tsc -b`; app, e2e, configs)                                   |
| Lint                 | `pnpm lint` (oxlint, type-aware)                                                               |
| Format               | `pnpm format` (oxfmt; `pnpm format:check` only checks)                                         |
| Unit + browser tests | `pnpm test` (Vitest 5; `*.browser.test.ts` runs in Chromium)                                   |
| Test coverage        | `pnpm test:coverage` (writes `coverage/`)                                                      |
| Actions lockfile     | `gh actions-lock --no-narrow` (after a `uses:` change)                                         |
| All coverage         | `pnpm coverage:all` (with web e2e; writes `coverage-all/`)                                     |
| End-to-end tests     | `pnpm e2e` (Playwright; reuses a running dev server)                                           |
| Production build     | `pnpm build`                                                                                   |
| Desktop dev (HMR)    | `pnpm desktop:dev` (Electron window on the Vite dev server)                                    |
| Desktop build        | `pnpm desktop:build` (web build, then main and preload)                                        |
| Desktop e2e          | `pnpm e2e:desktop` (Playwright Electron; build first)                                          |
| Desktop installer    | `pnpm desktop:package` (electron-builder to `release/`; then `node scripts/smoke-package.mjs`) |
| Release (maintainer) | `pnpm release:tag patch` (or `minor`, `major`, `beta`; see `docs/RELEASING.md`)                |
| App icon             | `pnpm app-icon` (renders `build/icon.png`, `icon.ico` and the web app icons in `public/icons`) |
| README image         | `pnpm readme-gif` (records the editor while a flow plays to `docs/images/editor.gif`)          |
| Diagram format files | `node scripts/format-sample.mjs` (or `<git ref>`; see "Change the diagram format")             |
| Template icons       | `node scripts/template-icons.mjs` (after a template or icon set change)                        |
| README features      | `node scripts/readme-features.ts` (after a change to `src/library/feature-list.ts`)            |

Run typecheck, lint, format:check, test and e2e before you report work as done. For changes to `electron/`,
`src/desktop/` or `src/agent/`, also run `pnpm desktop:build` and `pnpm e2e:desktop`.

## Code comments (hard rule)

Default is no comment. A comment exists only if it gives information that names, types and code
structure cannot give. First try a better name, a type, a named constant or an extracted function.

Two kinds, never mixed:

1. `/** … */` doc comments (JSDoc/TSDoc) on exported symbols, only when the contract is not clear
   from the name and the type. First line: one summary sentence, third person, present tense.
   Then `@param name - description`, `@returns`, `@throws ErrorName If …`, `@example`, `@see`,
   `{@link Symbol}` only when they add information (meaning, range, unit, edge cases). No type
   braces like `{string}`. No tags that TypeScript already expresses (`@type`, `@private`,
   `@override`, `@enum`, `@async`, …).
2. `//` comments only for a hard technical fact about external behaviour (a library, browser,
   codec or file format) that the code depends on.

All comments use ASD-STE100 Simplified Technical English: approved words, active voice, simple
tenses, no `-ing` verb forms, max 20 words per instruction and 25 per description.

Never in a comment: what the code does, why it was written this way, design or library rationale
(it goes in `docs/ARCHITECTURE.md`), benefits, marketing or quality words, banners, history, session
notes, TODO/FIXME, commented-out code. Units go in names (`durationMs`). The same rule applies
to generated code (shadcn components, scaffold files). oxlint enforces `no-warning-comments` and
the JSDoc tag rules.

## Conventions

- Path alias `@/` → `src/`. No `baseUrl` in tsconfig (TypeScript 7 rejects it).
- Document state lives in `src/store/doc-store.ts`. Change it through `src/store/actions.ts`, which
  records undo steps through `src/store/history.ts`.
- The animation engine (`src/engine`) is plain TypeScript, apart from the React glue in
  `context.tsx`, `engine-context.ts` and `hooks.ts`. Per-frame work writes to the DOM directly. Do
  not put per-frame values in React state.
- Every visual of a flow is a pure function of time (`evaluateFlow`). Keep it that way: the video
  export depends on it.
- Canvas colours are CSS variables under `.dg-canvas[data-theme]` in `src/styles/canvas.css`.
  Node styles must not use `backdrop-filter`.
- UI primitives come from shadcn (Base UI) in `src/components/ui`.
- Write user-facing text in sentence case and plain words.
- `electron/` never touches the DOM, and the renderer never imports `electron`. Every `src` module
  that `electron/` imports (for example `src/desktop/contract.ts`, `src/desktop/constants.ts` and
  `src/agent/tool-definitions.ts`) stays free of DOM code; `tsconfig.electron.json` checks it
  without the DOM library.
- Every change to `diagramSchema` needs a new `DIAGRAM_VERSION`, a migration step and new format
  samples, so that diagrams from every earlier format keep opening. Follow "Change the diagram
  format" in `docs/ARCHITECTURE.md`; `src/persistence/formats.test.ts` checks it.
- Workflows pin each remote action by commit SHA. Call a composite action of this repository with `uses: $/…`,
  not `./…`. After a change to a `uses:` line, run `gh actions-lock --no-narrow` (extension
  `github/gh-actions-lock`) and commit `.github/workflows/actions.lock`. `--no-narrow` keeps the SHA pins.
- Agent tools change a diagram through `src/store/actions.ts` inside `oneStep`, so each call is one
  undo step. Skills live in `claude-plugin/skills`; a test fails when they name a missing tool.
