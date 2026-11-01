# Architecture

## Goal

A free, frontend-only tool for animated diagrams of software systems and user flows, for talks and READMEs. Traffic
moves along connections; a flow walks a user through the system while the camera follows.

## Stack and why

- **Build**: Vite 8 (Rolldown, Oxc), `@vitejs/plugin-react` 6, React Compiler 1.0. HMR; the compiler removes manual
  memoization.
- **Language**: TypeScript 7. Native compiler for `tsc -b`.
- **Canvas**: `@xyflow/react` 12 (MIT). Plain React and HTML nodes, full CSS control. Not tldraw (paid licence or
  watermark) or Excalidraw (hand-drawn).
- **UI**: Tailwind 4, shadcn CLI 4 with Base UI, lucide icons. Tokens in CSS variables.
- **State**: zustand 5 + immer 11. One central document store; immutable snapshots make undo cheap.
- **Validation**: zod 4 for stored and imported data, with versioned migrations.
- **Routing**: TanStack Router, hash history. Typed params; deep links work on any static host.
- **Motion**: own rAF engine for the canvas, `motionValue` from `motion` 14. The engine needs real elapsed time; export
  needs exact frames. Motion limits each step to 40 ms.
- **Layout**: elkjs 0.12 and an own grid and edge router, in a web worker. ELK layers flows. The grid places groups
  that ELK stacks badly. The router keeps edges out of groups that hold neither end.
- **Image export**: `@zumer/snapdom` 3.3. DOM capture that embeds fonts.
- **Video export**: mediabunny 1.61 (MP4 H.264, WebM VP9), a WebCodecs muxer.
- **GIF export**: modern-gif 2.1, a maintained encoder with a worker.
- **Mermaid import**: `mermaid` 12, which the app loads on demand. `getDiagramFromText` + `db.getData()` parse
  flowcharts without a render.
- **Lint and format**: oxlint (type-aware), oxfmt. create-vite default.
- **Packages**: pnpm 12. `pnpm-workspace.yaml` sets what pnpm accepts when it resolves a version. At each
  install, also with `--frozen-lockfile`, pnpm checks every lockfile entry against the age and trust rules again.
  - `minimumReleaseAge`: only versions that are at least one day old. Registries often remove a malicious version
    in that time.
  - `trustPolicy: no-downgrade`: pnpm stops when a version has less proof of origin than an earlier version, for
    example no provenance after releases with provenance.
  - `blockExoticSubdeps`: no git or tarball sources in sub-dependencies.
  - `strictDepBuilds`: pnpm stops at an install script that `allowBuilds` does not list.
  - `overrides`: minimatch 9 and 10 become 11 (GHSA-g3hv-75wg-m249). semver 5 and 6 become 7, because their last
    releases have no provenance and fail the trust check. Their callers use only functions that semver 7 keeps.
  - A Dependabot security update to a version that is less than one day old can fail. Wait one day, or add the
    package to `minimumReleaseAgeExclude`. A version that fails the trust check for a known reason goes in
    `trustPolicyExclude`.
  - `pmOnFail: ignore`: pnpm does not switch to the `packageManager` version. With any other value, pnpm writes
    that version as a first YAML document in `pnpm-lock.yaml`. The GitHub dependency graph reads only the first
    document, so Dependabot alerts and the dependency review see no packages. CI installs the `packageManager`
    version with `pnpm/action-setup`, and a CI step fails when the lockfile has more than one document.
- **Tests**: Vitest 5 (node and Chromium browser mode), Playwright. Real browser for Mermaid and export.
  - Fuzz tests (`*.fuzz.test.ts`, `*.fuzz.browser.test.ts`) use fast-check. They give random and changed input to
    each reader of untrusted data.
  - The readers are for diagram files and migrations, copied nodes, share links, trace files, images with a
    diagram, `diagrams://` links and release notes HTML.
  - Each test checks the contract of the reader: a valid result, or the error class of that reader. Any other error
    or unsafe output fails the test.
- **Desktop**: Electron 45. Vite builds main and preload. It uses the same Chromium as the tests, so export and capture
  match the browser. Node runs the agent server.
- **Agent server**: `@vitemcp/server` (MCP over HTTP), hono. Tools come from the zod schemas; the same loopback server
  also takes diagrams from the website.

Ruled out:

- **GSAP**: free licence forbids visual animation builders like this app that compete with Webflow; Webflow can end
  it.
- **Theatre.js**: no release since 2024; AGPL studio.
- **html-to-image**: no release in more than a year; React Flow pins an old version.
- **libavoid-js, MSAGL (edge routers)**: libavoid-js has no cluster API in JavaScript, so routes cross groups that hold
  neither end. MSAGL routes cross cards inside groups.
- **TALA (D2)**: 11.5 MB browser bundle; needs D2 text.
- **Tauri 2**: WebKit on macOS and Linux, so export and capture need tests on a second engine; the agent server needs
  Rust or a sidecar.

## Visual language

The visual system is in `DESIGN.md` at the repository root.

- Node kinds (card field `form`) show in the outline: service, data store, queue or stream, client, external system,
  function.
- Schema versions of the visual model (migration in parentheses):
  - 2: `form` on cards, not `variant` (`form` from the icon).
  - 3: default font pair `geist` renamed `atkinson`.
  - 4: `event`, `latencyMs`, `level` on flow steps, for log lines.
  - 5: `kind`, `detail`, `color` on groups; theme `boundaryColors`.
  - 6: default font pair `host` (Host Grotesk, Fragment Mono) (`atkinson` to `host`); `protocol` on edges; theme
    `protocolColors`.
  - 7: `request` and `response` bodies on edges; `bodies` on flows (on).
  - 8: `color` on cards and shapes, not `accent` (never drawn).
  - 9: `details` (description, owner, links) on cards, shapes, groups.
  - 10 to 13, optional: `pinned` on node data (10); `opens` (another diagram id) on cards and groups (11); `parallel`
    targets on flow steps and `paths` on flows (12); `sensitive` (`personal` or `secret`) on body fields (13).
  - 14: `cameraStyle` (`frame`, `follow`, `still`) and `cameraMotion` (`gentle`, `quick`, `slow`) on flows (`frame`,
    `gentle`).
  - 15: overview steps (`target` of kind `flow`, empty id); `stepNumbers` on flows (off).
  - 16: theme `routeAround`, default off (off); optional hand-drawn edge `bends`.
- Groups are boundaries. `kind` points into `src/model/boundaries.ts`: AWS, Azure, Google Cloud, Kubernetes, general
  and custom kinds.
  - Each kind has a family (scope, logical, location, zone, network, subnet, security, runtime) that sets the line
    pattern, a default colour, an icon and an example detail.
  - Canvas label: kind, name, detail (such as an account id or address range).
  - The boundary palette has no walkthrough blue; `boundaryColors` turns it off.
  - A boundary from the insert menu wraps the selected nodes.
- Black and white with one signal colour. App chrome and default canvas: Host Grotesk at 400 and 500, Fragment Mono for
  values that people copy.
- Signal blue is only the walkthrough colour, the focus ring and the app mark token. No other palette has a saturated
  blue.
- High contrast is a viewer setting, because the need belongs to the reader. `contrast` (settings store): `system`
  (follows `prefers-contrast: more`), `standard` or `high`.
  - `DiagramCanvas` sets `data-contrast="more"`; `src/styles/canvas.css` replaces the colour tokens under it. Export
    stages do not set it, so a file looks the same to all readers.
  - Text 7:1, lines 4.5:1; `src/styles/contrast.browser.test.ts` checks the token pairs.
- Nodes separate from the ground by fill; the outline is a quiet edge. Outlines alone put all elements on one plane.
- New edges: right angles with rounded corners (`smooth`); Bezier curves look like default React Flow edges.
  `routeAround` takes `smooth` and `step` edges around the nodes (see "Routing on the canvas").
- Edge protocol: HTTP, RPC, database or messaging. With `auto`, `detectProtocol` reads it from the label ("HTTPS",
  "gRPC", "SQL", "publish"); the properties panel can set it.
  - It colours the line, arrow, traffic and label; `protocolColors` turns this off.
  - In playback, visited and active edges are 2 px, in the brighter text colour of their protocol.
  - Token dot and label take the colour of the current hop, or the last hop while the token rests on a node.
  - Signal blue: edges without a protocol, the token before its first hop. In a spotlight flow, idle edges recede to
    the neutral line.
- The grid is an editing aid. Present and library previews do not draw it; exports draw it only when the user turns it on.
- Details on cards, shapes and boundaries: owner, plain-text description, links to code, docs or dashboards. The
  canvas does not draw them, so a diagram stays readable.
  - Present and exported web pages (`DiagramCanvas` with `details`): a dot marks nodes with details. A card shows on
    hover. A click pins it until Escape or a canvas click.
  - One canvas overlay shows the card. It uses the node position and the viewport transform, so it follows the
    camera at a fixed text size.
  - Hover state is outside React (`details-hover.ts`), so a hover renders only the card.
  - Links open only `http`, `https` or `mailto` (`safeLinkUrl`): exported pages give them to other readers. A bare host
    (`github.com/acme/api`) gets `https://`.
- `opens` on a card or boundary opens another diagram, for example the components of a container.
  - Zoom button where the canvas can open diagrams (`CanvasMode.openDiagram`) and the library has the diagram.
  - Editor: opens its editor. Present: the camera zooms into the node, the stage fades, and the inner Present opens
    with a way back (`from` in the address).
  - No zoom button on exported pages, share links and image exports: they carry no other diagrams. An empty `opens`
    opens nothing.
- `Template.inside` holds the diagrams that template nodes open, for example the C4 containers behind the C4 system
  context.
  - Fixed ids. `templateCopies` gives each copy new ids and points `opens` at them.
  - The template tests and `scripts/template-files.mjs` check them (`templateDiagrams`).
  - The template page has no zoom button: the inner diagram is in the library only after a copy.
- Cards and shapes can take a colour, to group nodes by team or kind across boundaries.
  - Boundary palette (`COLORS` in `src/model/colors.ts`), so a node and a boundary of one team share a hue. Neutral by
    default.
  - The hue mixes into fill, outline (`--dg-hue-fill`, `--dg-hue-line`, lower in the light theme) and line icon.
    Official cloud icons keep their colours.
  - Flow states win: an active node gets the signal ring; an idle node in a spotlight flow recedes.
  - `boundaryColors` does not turn node colours off: a node colour is always a user choice.
  - Several selected nodes take a colour in one undo step (properties panel or context menu).
- A flow plays as a log: one line for each step (offset, element, event, latency, caption).
  - Warn and error levels colour the event. The line under the pointer marks its node or edge.
  - No latency column when no step has a latency (user flows).
  - Present and video exports show the current line in a bottom strip; engine insets keep the camera target clear of
    it.
- Flow panel views: log, sequence, timeline. `SequenceView` draws a lifeline for each node the flow reaches, in that
  order. Each step is a row: solid arrow for a call, dashed arrow for a response (`reversed`), note for a step on a
  node. Rows follow playback. `flowSequence` (`src/export/sequence.ts`) builds them for the view and the Mermaid
  export.
- The token label lifts above a node while the token moves along its top edge. It fades near edge ends, so it never
  covers a node title. Both come from `evaluateFlow`, so exports stay frame exact.
  - Between two edge steps at different points of one node, the token moves along the outline (`perimeterPath`).
  - Edge labels hide while the token dot or label passes over them.
- Library cards: read-only canvases that fit the whole diagram, with level of detail, so titles stay legible.
  - Featured stage (`readableViewport`): a diagram that fits at zoom 0.5 shows whole; a larger one crops around its
    node with the most connections.
  - A template too large for a card shows a `cover`: a smaller diagram from its parts, with a flow.
  - The template page opens on the whole diagram with text nodes (`withText`): the system and title show first.
  - The first flow plays on hover and focus.
- First visit, under the featured stage: what Diagrams does (`Features`), then the other templates.
  - Six headline features have a picture from the featured template at page load, so the pictures stay in step with it:
    - first flow steps
    - operations with latency
    - first connection with sensitive data across a trust boundary
    - sequence start (`flowToMermaidSequence`)
  - "Show on the diagram" highlights those connections on the stage, like the Sensitive data view.
  - Other features: one short line each, so none hides in the editor.
  - Section heading one size under the headline; picture first on each card.
- From 1280 px, the first visit puts the agent introduction (with the desktop download) beside the headline. It adds
  about 5 px of height, so the stage still fits.
- `src/library/feature-list.ts` holds feature titles and summaries for the library and README.
  - `node scripts/readme-features.ts` writes them between the README `features` markers.
  - A test fails when the README is out of date.
- First visit: the Order system flow loops in a full-width stage with a Pause button (WCAG 2.2.2), which holds the
  frame. With reduced motion, the stage waits for Play.
- A card preview mounts within one screen height of the visible library. The scroll container is the observer root,
  so the margin works.
  - Previews mount one at each idle moment (`useIdleMount`) and stay mounted. A React Flow mount takes up to about
    100 ms, and drops frames in a scroll.
  - A preview engine runs its frame loop only during playback; otherwise it pauses after one last render
    (`EngineProvider running`).
- Frame loops pause while nobody can see the page (`usePageVisible`): a background tab, or a minimized or hidden
  desktop window.
  - Browsers stop `requestAnimationFrame` in background tabs.
  - The desktop window turns background throttling off, so `render_image` works in a minimized window. The page then
    stays visible to the Page Visibility API.
  - The main process reports `window.visibility` on minimize, restore, hide, show and each page load.
  - A loop restart resets its frame clock, so a flow continues where it stopped.
  - Agent renders use an export stage for each frame, not the frame loop.
- The canvas comes first. Panels open on demand: insert menu on `N` or double-click, properties panel for a selection,
  style menu in the top bar.
- Panels dock next to the canvas, so the canvas, its fit and the flow camera get only the free area.
  - Side panels (`SidePanel`: properties, version history, sensitive data) share one width; the flow panel has its own
    height.
  - Handles (`ResizeHandle`, a `separator`) also take arrow keys, Home, End, and Enter or a double-click for the
    default. Settings keep the sizes.
  - Below 768 px, side panels stack above and below the canvas.
- Flow toolbar (`useElementWidth`):
  - Below 1180 px: the view switch, Record and Add the selected node go into a More menu.
  - Below 720 px: the step count and time readout hide.
- Phone (below 640 px): the top bar keeps the name, Present and Export; editing controls go into a More menu, so the
  name stays readable.
- **Level of detail.** The editor, template page and library cards set `data-lod` on the canvas root
  (`LevelOfDetail`): `far` below zoom 0.55, `farther` below 0.3.
  - Hidden: card lines, meters, badges, edge labels, traffic. Dashes stay: templates use them for meaning.
  - Scale: card titles and boundary labels grow 1.35x (`far`) or 1.8x (`farther`). `visibility` and `scale`
    keep node sizes, edge anchors and saved sizes.
  - Read-only canvas: boundary labels drop the detail, and the kind when a name exists, so the name fits.
  - Present, the stage and exports keep full detail, so a flow does not pop between levels. Library cards do not move
    their camera.
- **Minimap.** In the editor for 20 nodes or more; the zoom controls hide it; settings keep that choice.
  Groups show as outlines; text nodes do not show.
- **Go to.** A search in the command menu lists the nodes; a node opens selected, centred in the view.
- **Explore in Present** (`useExplore`, E key).
  - Start: the flow stops; the node with the most connections gets the focus.
  - Camera: frames the focus and its neighbours above the bottom strip; the rest dims.
  - A click on a node or its strip button moves the focus.
  - Esc ends Explore; the flow loads again at its start, paused.
- Metrics, meters, status dots and badges are optional; templates use them only for data, such as a connection pool
  size or a port.
- Cards, shapes and text always draw above boundaries (`ELEMENT_Z`). React Flow puts a child node one step above its
  parent, so without a common base a deeper sibling boundary covers an outer card.
- Runtime tier boundaries (cluster, node pool, Auto Scaling group, application) are solid.
  - They fill with the ground colour and redraw the canvas grid at the same positions.
  - `layerNodes` puts them above other boundaries at render time; the z-index is not stored.
  - A cluster across two zones hides the zone and subnet lines under it.
- A drag on empty canvas pans; Shift plus drag selects; the right mouse button only opens the context menu.
- Nodes move freely in a drag and snap to the 16 px grid (the canvas dots) on drop. A snap in the drag made visible
  jumps.
- Letter shortcuts match the character of the active keyboard layout, or the physical key on layouts without Latin
  letters. The insert key is `N`: `/` needs a modifier on many European layouts.
- Nodes and edges do not use `backdrop-filter`: image capture cannot reproduce it.
- Card and boundary icons keep a minimum size on screen: CSS `scale` from `--dg-zoom`. The transform keeps the node
  size, so edges and handles stay; only a margin moves the title.
  - Each icon is in a `dg-zoom-scope` element (`display: contents`) that takes the zoom on mount (`useZoomScopeRef`).
    `ZoomProperty` writes the zoom on the scopes in 5 % steps, without a React render.
  - Not on the canvas root: a custom property change there restyles the whole canvas.
  - The scope stays when the loaded icon replaces the placeholder.
  - The zoom comes from the camera, so a flow frame depends only on time; the video export shows the same icons.

### Icons

Icon names are Lucide names (`database`) or prefixed set icons: `aws:`, `azure:`, `gcp:`, `k8s:`, `logo:` or
`salesforce:`.

- Sources: AWS Architecture Icons, Azure architecture icons, Google Cloud product icons, Kubernetes icon set, Simple
  Icons (logos), Salesforce Lightning Design System icons. Licences: `THIRD-PARTY-NOTICES.md`.
- `salesforce:` uses `@salesforce-ux/icons` (CC BY-ND 4.0). Simple Icons 16 has no Salesforce brands.
  - Products: Salesforce cloud, Slack, Tableau, MuleSoft, Data Cloud. Platform parts: Apex, Flow, connected app, bot.
    CRM objects: Account to Contract.
  - The licence forbids changed artwork, so the build only optimizes the SVG files. CSS draws the white glyph on a
    rounded square in the icon colour (`.dg-art-tile`, glyph as background image; `tile` from `.slds-icon-standard-*`).
  - The Salesforce cloud glyph has no margin, so it fills 64 % of its square (`glyph`).
  - The Mermaid import matches these objects only by names like "Salesforce account", so a node named "Order" gets no
    Salesforce icon.
  - `pnpm icons salesforce` builds only this set.
- `node scripts/template-icons.mjs` writes about 50 template set icons to `src/canvas/icons/data/templates.json`. A unit
  test fails when the file no longer matches the templates or the sets.
- `loadSetOfIcon` reads that file before the full set. Library previews load about 35 KB gzip, not 270 KB. The editor
  loads full sets for search.
- `scripts/icons/catalog.mjs` lists curated entries: product name, source image, card form, import aliases, search
  keywords.
- `pnpm icons` downloads the packages to `node_modules/.cache` and optimizes them with SVGO. It writes one JSON file per
  set to `src/canvas/icons/data`.
- `scripts/icons/sources.ts` holds the download URL, version, website and terms of each set. `pnpm icons` and the
  SBOM read it. For a new AWS or Azure release, change its URL and version there and run `pnpm icons`.
- Google Cloud products without a unique icon use their category icon.
- Set files are separate assets (`?url` imports), fetched on first use, outside the main bundle.
- Cloud icons are `<img>` data URLs with their own colours and gradient ids. The terms forbid changed artwork, so an
  idle flow node fades them with `opacity`, not a colour filter. Logos are single paths in `currentColor`.
- AWS general icons have a dark variant that CSS selects by the canvas theme, or the app theme outside it.
- Boundary kinds use provider group icons: AWS account, region, VPC, subnets; Azure subscription, resource group,
  virtual network; Kubernetes cluster.
- The insert menu searches the sets from two characters and inserts a card with product name, icon and card form.
  `insertResults` ranks nodes and products in one list: full name, name start, name word, keyword. Each search word
  must start a word.
- The Mermaid import gives a card an icon only when its label is an entry alias, alone or with one role word ("Redis
  cache", "Postgres DB"), not "Go to checkout".

## Architecture

```
actions/render/ GitHub Action that renders diagram files and comments on pull requests
electron/       desktop main process: window, app protocol, IPC, diagram files, agent server, deep links
claude-plugin/  agent skills and the Claude Code plugin manifest, bundled into the main process
src/
  main.tsx, router.tsx, RootLayout.tsx   start-up, routes, app chrome, route and start-up errors
  agent/        agent tool definitions, handlers, references, placement, compact diagram form
  desktop/      IPC contract and bridge, title bar, agent and handoff dialogs, desktop runtime
  model/        zod schema (version 6), boundary kinds, protocols, defaults, presets, graph and rect helpers
  store/        doc store, actions, undo history, version history, persistence hook, UI and settings stores
  persistence/  localStorage repository, version store (IndexedDB), serialize, migrations, library actions
  canvas/       React Flow canvas, canvas theme, node and edge components, icon sets and cache, flow overlay
  engine/       clock, path sampler, traffic, flow compile/evaluate, camera, engine, React glue
  editor/       editor page, insert menu, properties panel, flow panel and timeline, version history, menus, shortcuts
  export/       export stage, capture, image and video/GIF export dialog
  import/       Mermaid import, trace import
  io/           import dialog (diagram file, Mermaid and trace)
  layout/       ELK layers, group grid and edge router, run in a worker
  library/      library page, live previews and their framing
  releases/     What’s new page from the GitHub releases
  share/        share links and the page that plays them
  player/       presentation page and the player stage that it shares with the web page export
  standalone/   entry of the standalone player that a web page export carries
  templates/    starter diagrams
  components/   shadcn (Base UI) primitives in ui/
  lib/          small shared helpers: errors, queues, idle mount, reduced motion
  styles/       canvas CSS and its theme variables
e2e/            Playwright tests for the website, and for the desktop app in e2e/desktop
scripts/        icon catalog and build (icons/), app icon, README image, desktop dev runner, third-party licence and release notes plugins
build/          app icon sources and renders
```

### Data model

A `Diagram` holds nodes (`card`, `shape`, `text`, `group`), edges (`flow`), flows, a theme and the viewport.

- Web: `dg:diagram:<id>` per diagram, plus `dg:index`.
- Desktop: `Documents/Diagrams/<id>.diagram.json`.
- `rev` detects edits from another tab or program.
- `repository()` returns the store of the build; callers do not know which.

A `Flow` is an ordered list of steps (node or edge, caption, duration, camera mode) plus optional keyframe tracks
(camera, opacity, traffic). The app computes the timeline from the steps and never stores it.

### Parallel steps and paths

One flow shows fan-out and failure branches; there is no second kind of flow.

- **Parallel targets.** A step has a main `target` and optional `parallel` targets. `compileFlow` gives each segment
  one `Lane` per target that exists. An edge lane goes backward when the previous step left a token on its target and
  none on its source. Segment fields repeat the first lane, so code for one token still works.
- `evaluateFlow` returns the main token and one `ParallelToken` per other lane. A node lane enters from the previous
  edge lane that ends on its node and goes around its outline like the main token. Parallel tokens copy the token
  element, in their edge protocol colours. The camera frames all lanes.
- **Overview steps.** Target: the whole flow (`kind: 'flow'`). Introduction first, Conclusion last, Overview between.
  No lanes, so no token moves; `evaluateFlow` marks the whole path active and the camera frames it (`pathRect`).
  Recording adds steps before a Conclusion and continues from the last step that moves the token. The sequence view
  and Mermaid sequence omit them (no message).
- **Step numbers.** `stepNumbers` numbers the previous, current and next step (`StepNumbers`). Position: top-left of a
  node, middle of an edge. Numbers follow the engine caption, so videos show them. Walkthrough tools default to the
  current and adjacent steps, so busy diagrams stay clear.
- **Timeline.** Each step block ends in a handle (`separator`; arrow keys or drag). A time change moves all later
  steps; with Alt the next step takes the difference, so later steps keep their start.
- In record mode, Shift-click adds a node to the last node step. Its edge from the same source joins the last edge
  step.
- Parallel candidates (switches in step properties): other edges from the same node in the token direction, or nodes
  that the previous step's parallel edges reach.
- Log lines, the caption and the sequence name all lanes: `Kafka → Enricher, Fraud scoring`.
- **Paths.** Optional `paths`, for example "Card declined". A path starts after a main step (`fromStep`) and replaces
  the later main steps with its own. It then ends the flow or rejoins a later main step (`rejoinStep`). `pathSteps`
  gives its steps. `compileFlow` takes one path, so the timeline stays one line and each frame stays a function of time.
- The viewer selects the path: flow panel, Present, web page export, video export, `render_image` and `--path` (CLI).
- No path starts from another path. `removeStep` moves a path start to the previous main step, or removes the path
  when none exists. It moves a rejoin to the next main step.
- Mermaid export: a parallel step is `par`, a branch point is `alt`, or a nested `alt` inside a main section. The
  first section has the main steps up to the furthest rejoin; each path section has its steps and the main steps from
  its rejoin.

### Change the diagram format

Every earlier format must still open.

- Each diagram stores its format in `version`; this build writes `DIAGRAM_VERSION`.
- `src/persistence/migrations.ts` migrates older data (one step per version) before the schema parses it. All inputs use
  it: browser storage, diagram files, imports, website handoff, version history, pasted nodes (the clipboard carries
  the `version` of the source app).
- A diagram keeps its format until the app saves a change (also a pan or zoom), so older apps elsewhere can still open
  it.

A format on `main` can reach a browser: the preview website deploys from `main`. Every `diagramSchema` change needs a
new version, also for an optional field or enum value:

1. Raise `DIAGRAM_VERSION` and add `toVersion<N>` to `MIGRATIONS`. The step fills new fields with defaults, maps
   changed values and removes old fields. It must not fail on data that already has the change.
2. Test the step in `src/persistence/serialize.test.ts`. Add the version to "Visual language" above.
3. Run `node scripts/format-sample.mjs`. It writes `src/persistence/formats/v<N>.schema.json` (JSON Schema) and
   `v<N>.json` (Order system and Checkout flow templates; from format 12 also Event pipeline: parallel step, path).

- `src/persistence/formats.test.ts` fails when:
  - the schema differs from the current version file.
  - the migrations change the nodes, edges or flows of a format 6+ sample.
- Files of a format that reached `main` never change; a diff in one means a missing version.
- `node scripts/format-sample.mjs <git ref>` writes an earlier release's files, in a repository worktree with the same
  `node_modules`.
- Format 6 and 7 samples come from v0.1.2 and v0.1.3. Formats 1 to 5 are older than the first release; only
  `serialize.test.ts` tests them.

An older app refuses a newer format and asks the user to update, because its next save would drop unknown fields.

### Request and response bodies

An edge can carry a `request` body (what the source sends) and a `response` body (what comes back). Rules:
`src/model/payload.ts`.

- A body is a flat list of fields. The path shows nesting with dots and array items with `[]` (`customer.email`,
  `items[].sku`; `[]` first for an array body). A name cannot hold a dot or `[]`. A list fits the 288 px properties
  panel, keeps the key order and gives each field an id for undo.
- Example values are text; the type sets the JSON value in the example body. The editor keeps the typed text, also an
  incomplete number. Defaults: `"string"`, `0`, `true`, `null`; one array item.
- Edit as JSON reads fields, types and examples from a pasted body. Array items share their fields; a key in only some
  items is optional. A field with the same path keeps its id and description.
- `fieldIssues` reports paths that the body cannot hold (a field inside a string), for the panel and agent calls.
- Edge labels show `{n}` for request fields and `→ {n}` for response fields, so a reader sees a body without a table on
  the canvas.
- In playback, the log line of an edge step shows the request body as compact JSON, or the response body when the
  token goes back (`reversed` in the timeline). The flow setting `bodies` turns this off.
- The strip and the log table read the body from the edge at render. The timeline and `evaluateFlow` do not change,
  so a video export shows the same text.
- The strip truncates the body and hides it on narrow frames, like the event text.

### Sensitive data

A body field can carry a mark, `personal` or `secret` (`sensitive`). For a threat model, the diagram shows where such
data goes and which trust boundaries it crosses.

- `dataCrossings` (`src/model/threats.ts`) lists each edge with a marked body field and the trust boundaries around
  only one of its ends.
- Trust boundaries: the tiers scope, network, subnet and security (`TRUST_TIERS`), for example an account, VPC, subnet
  or trust boundary. Regions, zones, clusters and custom groups do not separate trust and do not count.
- An edge with a client or external card at one end crosses "the edge of the system" when no trust boundary is
  between its ends. So a diagram without boundaries also shows data that leaves the system.
- The Sensitive data button in the top bar turns on an editor canvas view, not a diagram setting. The canvas gets the
  crossings through `CanvasMode.threats`, because edge labels render in a portal outside the edge.
- Marked edges take the warning colour (personal) or the error colour (secret); other edges dim. A trust boundary
  crossing gets a thicker line and a filled label chip.
- A panel docked on the left lists the marked edges, crossings first; a click selects one. It takes canvas width, so
  it never covers a node. The edge properties show its fields and boundaries.
- A pasted JSON example keeps the mark and description of a field with the same path.
- Agents set `sensitive`; `get_diagram` with full detail returns `dataCrossings`. The `threat-model` skill marks fields
  and checks each crossing with STRIDE; the app does not judge threats.

### Trace import

A trace becomes a flow (`src/import/trace.ts`, `trace-flow.ts`, `trace-apply.ts`) with its real operations, latencies
and statuses.

- Formats: OTLP JSON (`resourceSpans`, Tempo `batches`, Jaeger v3 API `result`), Jaeger UI and API JSON, Zipkin v2. A
  shared Zipkin span has the id of its client span, so the importer gives its server half a new id below the client half. Of several traces,
  the one with the most spans imports.
- `walkTrace` turns spans into calls between peers: services, databases (`db.system`), topics (`messaging.system`),
  peer services and outside hosts. Spans inside one service add no steps. A client span above a span of another
  service calls that service: protocol from the client, operation and status from the server.
- A call is a request step, its nested calls and a response step on the same edge. The token comes back before the
  next call. A message goes to its topic and back. Consumers run after the other calls of the root span, so response
  steps keep their direction.
- Equal calls in a row with the same outcome merge into one step (`SELECT products ×3`), from first start to last end.
  A retry with another status stays a separate step (part of the story).
- A peer uses a diagram card with an equal `matchKey` (`order-service`, `orderservice` and `Orders` give `order`).
  Order: a card of the peer's form, a card line (the namespace of a database), the product icon. A database never
  matches a service card by namespace, because `orders` names both.
- New cards and edges go next to their neighbours (agent placement). The import is one undo step.
- Step durations keep the defaults, so the flow stays readable; the real time goes in the latency column.

### Animation engine

- `path-sampler` turns the SVG path data from React Flow into an arc-length table: a point is one array lookup.
- Each edge registers its table and particles with its canvas engine.
- One `requestAnimationFrame` loop advances the ambient clock (traffic) and the playback clock (active flow). It
  writes particle positions (SVG attributes) and flow state (`data-flow` attributes) without React.
- A frame writes the flow state of nodes, edges and labels only when the step, spotlight or an emphasis value changes
  (`flowStateKey`).
- Edge labels under the token hide. Live play reads the token and label boxes before the DOM writes, so the browser
  computes style and layout once per frame. Labels lag one frame.
- Exports read after the writes, for exact frames.
- A still flow rereads the boxes in an idle frame: once after a token move, then every 100 ms while the token shows.
  Labels can change size after a camera cut or a font load.
- The React Flow viewport has no `will-change: transform`; it slows pinch zoom.
- `usePlaybackState` returns a new snapshot for each change, because the React Compiler memoizes JSX on value
  identity.
- `evaluateFlow(timeline, t, geometry, view)` is pure: token position, node and edge state, caption and camera depend
  only on `t`. Seek and export use it.
- A flow chooses its camera (`cameraStyle`): `frame` (default, a calm explainer), `follow` (rides along with the
  request) or `still` (a fixed overview for a slide).
- `follow` (`src/engine/flow/follow-camera.ts`, the camera of format 13 and earlier) takes a weighted mean of step targets. The
  window around `t` is 1 s for position and 1.6 s for zoom. The camera moves before a step, without jumps. A step
  zooms in at most 1.35× over the step before.
- The frame camera does not follow the token. `stepFrames` (`src/engine/flow/framing.ts`) gives each step one frame,
  in step order:
  - A follow step (Auto in the step properties) holds the overview while the whole diagram is legible: overview zoom
    ≥ 0.7 × the median step zoom. Step zoom is the reading zoom. On views narrower than 1000 px it can fall to 0.7 ×
    the reading zoom.
  - Otherwise the frame keeps its zoom while the step fits at 0.7–1.25 × the step zoom. It moves only when step nodes
    leave the safe area (12 % of the view at each side). Then it moves as little as possible, to include the step and
    as many next steps as fit, so the camera makes a few large moves, not one per step.
  - An edge whose ends do not fit at a legible zoom gets the frame of the node that the token goes to.
  - A frame shows a text node whole or not at all; if no move can, it zooms out, not below the legible zoom.
  - Fit (Frame) centres on the step at the step zoom. Hold keeps the previous frame.
- `framedCameraAt` moves into each step frame around the step start, over the flow's `cameraMotion` span (frame camera
  only): gentle (1 s, sine ease), quick (550 ms, cubic ease) or slow (1.6 s, sine ease). The spans do not overlap. A
  move at the same zoom is a straight pan; a zoom change uses `interpolateZoom`.
- With `prefers-reduced-motion`, the camera cuts to each step frame. The canvas fades to 15 % and back in 360 ms
  around each cut (`viewOpacity`, `--dg-view-opacity`). Present does not start on its own. Exports always use full
  motion.
- Present counts its top bar and caption strip as insets, so no frame puts the diagram title under the top bar.
- In the editor, the preview and Present, play and seek glide from the current viewport to the flow camera in 700 ms
  of wall time. This glide is outside `evaluateFlow` and the export. In the editor the camera centres in the area free
  of panels.

### Layout

`layoutDiagram` (`src/layout/diagram-layout.ts`) sends nodes, sizes and edges to `layout.worker.ts`, which runs
`computeLayout` (`engine.ts`). ELK runs in a nested worker, because `elk.bundled.js` has no in-thread fallback in a web
worker.

`computeLayout` first runs ELK layered with `INCLUDE_CHILDREN` (`hierarchy.ts`):

- Groups get the root spacing options, because ELK reads spacing from the parent graph.
- The layer gap fits the longest edge label (120 to 280 px), so labels do not cover nodes.
- A group is at least as wide as its label.
- Edge labels are not ELK labels: label dummy nodes made the diagram too wide.

One layering for all groups suits flows, but turns a chain or hub of many groups into a diagonal staircase. ELK
compaction does not work with `INCLUDE_CHILDREN`. For each level with two or more groups, `arrange.ts` lays out each
container alone, deepest first, and compares the ELK layers with a grid:

- Grid: a band of sources (a gateway), then boxes in a grid of the target aspect; cells swap while the score improves.
- Score: real edge lengths inside groups, costs for edges against or across the layout direction and for
  crossings, and the extent.
- The grid wins only below 85 % of the layer cost. If no level uses a grid, the ELK result stays.

Pinned nodes keep their places in all layouts (`keepPinned` in `src/layout/pinned.ts`, at the end of `layoutDiagram`).
ELK layered has no fixed positions, so:

1. The result moves by the median offset of the pinned nodes.
2. Pinned nodes and the contents of pinned groups go back.
3. From the deepest group up, other nodes move the shorter way clear of pinned nodes and each other. A group with
   a pinned node stays and grows around it.
4. An edge keeps its new route if both nodes moved equally, its old route if both are pinned, else the
   facing-sides path.

The editor shows a pin mark; exports and the player do not.

ELK routes only the graphs that it lays out, so `router.ts` routes grid layouts. It uses a sparse orthogonal grid:
lines at a clearance from each node, node centres, and gap middles.

- A* search routes each edge, nearest first, with costs for length, bends and segments of earlier routes.
- A group blocks all routes except those with an end inside it.
- Then parallel segments that overlap move apart, in the order with the fewest crossings, as far as nearby nodes
  allow.

Both kinds of routes go in `edge.data.route` (canvas coordinates). Edges with automatic sides and a `smooth` or `step`
path follow their route while its ends touch their nodes (`routeFits`), else the facing-sides path. No action has to
clear routes. Agent placement snaps a new block's origin, not each node, to the grid, so its routes stay valid.

### Layout styles

`layout_diagram` takes a `layout` (`LAYOUT_STYLES` in `src/layout/types.ts`). Tidy up and Mermaid import use `flow`.

| Style                                            | Use                                                  | Engine                                       |
| ------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------- |
| `flow`                                           | Request paths and layered architectures              | ELK `layered`, as in the section above       |
| `tree`                                           | A hierarchy from one root                            | ELK `mrtree`                                 |
| `hub`                                            | One central node, such as an event bus or a gateway  | ELK `radial`                                 |
| `network`                                        | A mesh with many connections and no main direction   | ELK `sporeOverlap` over `stress`             |
| `grid`                                           | An inventory with few connections                    | ELK `rectpacking`, with the aspect ratio 1.6 |
| `lanes`                                          | Swimlanes: one top-level group for each team or tier | Own (`src/layout/lanes.ts`)                  |
| `dot`, `neato`, `fdp`, `circo`, `twopi`, `osage` | The Graphviz engines of the same names               | Graphviz 16 (`src/layout/graphviz.ts`)       |

- Only ELK `layered` lays out nested groups in one run. The other styles, except `lanes`, use the recursion of
  `arrangeLevels` and place each level with `placeLevel` (`src/layout/styles.ts`). `flow` and `lanes` align nodes
  across groups.
- `router.ts` routes the edges of all styles except `flow`.
- ELK `radial` accepts only a tree with edges away from the root. Without it, ELK throws, overflows the stack, or
  overlaps nodes. `hubTree` gives ELK a breadth-first tree from the hub. The hub is the node in `center`, or else the
  box with the most links. A box that no link reaches gets a link from the hub. `twopi` uses the same hub as its root.
- `stress` took about 4 s for 150 cards in a test. So a level with more than 80 boxes gets `grid` instead of `network`.
- `lanes` uses a `flow` layout for the inside of each box. Then each top-level group becomes a lane, in the order of the
  diagram, with the same length for all lanes. Each box in a lane gets a column from the longest path in the edges
  (`laneColumns`); the columns are the same in all lanes. Top-level nodes outside every group get a band before the
  first lane. With `RIGHT` or `LEFT` the lanes are rows; with `DOWN` or `UP` they are columns.
- Graphviz comes from `@hpcc-js/wasm-graphviz`, with the WebAssembly module inline. Each level is a flat graph with
  fixed node sizes in points; `neato` and `fdp` get `start=1` for the same result each time.
- The desktop renderer allows only `script-src 'self'`, and Chromium compiles WebAssembly only with
  `'wasm-unsafe-eval'`. So in the desktop app the layout worker does not run Graphviz. It sends each DOT text to its
  page, and the page sends it to the main process (`layout.graphviz`, `electron/graphviz.ts`), where Node runs Graphviz.
  The website has no such policy; its worker loads the Graphviz chunk (about 820 kB) only for a Graphviz layout.
- Graphviz is EPL-2.0, so `third-party-licenses.txt` and `third-party-licenses.main.txt` list it with the licence text.
- The style is a parameter of the request. The diagram does not store it.
- Rejected engines: ELK `force` gave worse results than `stress`; dagre repeats `layered` and has open bugs with
  nested groups; cytoscape fCoSE is not deterministic; WebCola has no maintenance; MSAGL and libavoid failed earlier
  (see "Stack and why").

### Routing on the canvas

The setting "Route connections around nodes" (`theme.routeAround`) makes the canvas route `smooth` and `step` edges
(`EdgeRouter` in `src/canvas/edges/routing.ts`) in the editor, Present, previews and exports. It ignores layout
routes. Fixed sides stay fixed.

- Off by default and for diagrams before version 16, so diagrams and templates keep their arranged routes.
- Runs when a node, its size, a parent or a routed edge changes, not on pan or zoom.
- During a drag: once per animation frame, only edges of nodes that move, and edges whose route comes within
  24 px of them. All edges after the drop.
- Each edge reads its route from `RouteStore` with `useSyncExternalStore`. An unchanged route keeps its array, so a
  drag renders only edges with changed routes.
- Manual routes (setting on): a selected `smooth` or `step` edge shows a handle on each segment that touches no node.
  A drag moves the segment across its direction (to the grid when snap is on).
  - The corners go in `bends`, and the router leaves the edge out.
  - The ends attach at right angles to the node sides that face the first and last corner (`manualRoute`), so the
    route follows its nodes when they move.
  - When both ends move equally (a drag of both or their group, an arrow-key nudge), the corners move too
    (`followBends`).
  - Tidy up and agent layouts keep the corners only when the ends stayed or moved together. Reset route in the
    properties panel removes them.
  - Setting off: the canvas keeps the corners but does not draw them.

### Portals

Edge labels, ports and the flow token render through `EdgeLabelPortal` and `ViewportLayerPortal`. React Flow's
`EdgeLabelRenderer` and `ViewportPortal` run `querySelector` in a store selector per labelled edge on each pan and zoom
frame.

### Undo

History stores immutable document snapshots (immer shares unchanged parts).

- Discrete actions record before they change state.
- Drags and resizes record one step per gesture, only if a node moved.
- Edits with the same key within 500 ms merge into one step.
- History never records selection and measurement changes.

### Version history

Versions keep saved states of each diagram across sessions; undo ends with the tab.

- Storage: IndexedDB (`src/persistence/version-store.ts`) in the browser and desktop app. It has more room than
  the 5 MB of `localStorage`, and keeps diagram files small with clean git diffs.
- A version: gzip-compressed diagram JSON plus a record with author, time and summary.
- Each diagram keeps its newest 200 versions; a diagram delete deletes them.
- `src/store/versions.ts` records a version after each editor save, also when the storage write fails. Saves that
  change only the viewport or measured sizes make no version.
- User edits join the newest version for five minutes after its first edit, so the list stays short.
- Agent calls and restores make their own versions. They change and save inside `asVersionAuthor`, which names the
  author and the tool title or the restored time. All other saves are user edits, also while an agent call waits for a
  layout.
- Records of the open diagram stay in memory, so a save writes one record and its content.
- On open, a diagram with no version gets a "First opened" version. A diagram that differs from the newest version
  gets "Changed outside the editor" (another tab, git, file sync).
- Summary (`describeChange`) against the previous version: added, removed, changed and moved nodes by name (counts
  above three), connections and flows by count, renames, style changes.
- A selected version covers the editor canvas with a read-only React Flow instance that starts at the editor viewport,
  so people compare the same area at two times.
  Meanwhile the editor canvas, flow panel and top-bar edit controls are `inert`. The editor canvas is also read-only,
  because React Flow listens for Delete on the whole document. The editor engine pauses; window key and
  clipboard handlers do nothing.
- A new version (also from an agent call) ends the preview.
- Restore replaces the content as one undo step (`restoreContent`) and saves at once.

### Export

Export renders a second, read-only React Flow instance at a fixed size (the export stage), with its own engine in
manual mode. Per video frame, the exporter:

1. Sets the time.
2. Waits for the React commit.
3. Captures the stage with snapdom.
4. Passes the capture to mediabunny or modern-gif.

The browser frame rate has no effect.

- CSS transitions are off on the export stage (`data-export`): they run on wall-clock time.
- The canvas grid is off in exports unless the user turns it on: it is an editing aid.
- The animation tab shows a preview strip of five export-stage frames (the real camera path and framing) and, during a render, the time left from the
  frame times so far.

The image tab:

- **Selection.** Only selected nodes, their child nodes and the edges between them (`detachedSelection`, as in copy
  and paste). A node without its parent takes its absolute position. On by default; the label counts the nodes.
- **Copy.** Copy PNG and Copy SVG use `writeImageToClipboard`. The image goes as a promise, so the click keeps its user
  activation during the render. An SVG goes as text, and as `image/svg+xml` where `ClipboardItem.supports` accepts it.
  Alt+Shift+C copies the selection or diagram as a PNG from the editor (`copyDiagramAsPng`), because the browser keeps
  Ctrl+Shift+C.
- **Editable images.** "Keep the diagram in the file" embeds the diagram (or the selection without flows) for Import
  (`src/export/embed.ts`):
  - PNG: an `iTXt` chunk before `IEND`, keyword `application/vnd.diagrams+json`, zlib-compressed JSON.
  - SVG: a `metadata` element with the same JSON, compressed, in base64.
  - Off by default, because anyone with the file can read the diagram, sensitive fields too. The settings keep the
    choice.
- **Preview.** Renders at the scale of its box. Size estimate: from the preview for a PNG, from the real file for an
  SVG.

The Mermaid tab writes the diagram as flowchart text for GitHub Markdown (`diagramToMermaid` in
`src/export/mermaid.ts`), without the export stage.

- Cards, shapes and boundaries become nodes and nested subgraphs. Text nodes, flows, icons and positions stay out;
  Mermaid has no place for them and does its own layout.
- Each node colour becomes a `classDef` and a `class` line. A class sets only the stroke, in a middle tone, because
  GitHub draws on a light or a dark page with fill and text colours from its theme. Boundaries with their kind colour get no class. The import finds
  the kind again.
- Import reads the fill (the stroke for a grey fill) from `classDef`, `class`, `:::` and `style`, and takes the
  nearest palette colour (`nearestColor`). A canvas 2D context turns CSS colour names into numbers.
- Classic bracket shapes, not `@{ shape: … }`, for older Mermaid versions. Data store cards become cylinders, other
  cards rectangles.
- Node ids come from titles (`api_gateway`), so the text is easy to edit by hand; ids that are Mermaid syntax, such as `end`, get a `node_` prefix.
- Direction `LR`, or `TD` when most edges run down; nodes and edges in position order along it.
- A boundary title starts with the canvas name of its kind (`Kubernetes namespace`). The import matches it before
  keywords and ignores the detail on line two.
- Mermaid rejects two different end markers on a link, so such an edge keeps only its end marker. The export
  reverses an edge with only a start marker.
- A browser test exports, draws and imports each template.

The Mermaid tab also writes a flow as a sequence diagram (`flowToMermaidSequence`). Calls are solid arrows, responses
dashed, and `error` steps end in a cross. Node steps and captions become notes. The latency follows the event. `;`
and `#` become entities, because Mermaid reads them as syntax.

### Text description

`describeDiagram` (`src/export/describe.ts`) writes the diagram as text for screen readers and image alt text. It
lists canvas text, boundaries with parts, parts with kind and lines, and connections. Flows and paths become
numbered steps: nodes in travel order (as in the log), event, latency, level and caption.

- Editor and player: a visually hidden canvas region, "Description of the diagram". The export stage has none, so
  captures do not change.
- Export dialog, Description tab: text to copy or download. An SVG export (also `render_image` and the CLI) puts
  the name in `title` and the text in `desc`.
- Order: `readingOrder` (`src/model/graph.ts`), along the main edge direction, as in the Mermaid flowchart.
- `ariaLabel` (`src/canvas/aria.ts`) names a node by title and kind ("Postgres, data store").
- `ariaLabel` names an edge by its ends and label ("Browser to API gateway, HTTPS"). Without it, React Flow uses node
  ids. A focused edge draws wider, in the selection colour.
- Page content below the top bar is the `main` landmark, so the top bar stays the `banner`.
- `useDocumentTitle` sets the tab title ("Order system – Diagrams").
- Properties row controls take the row label as their name (`aria-labelledby`): "Name", not only "edit text".

### README export

The README tab saves a dark and a light image and writes a `picture` element for the reader's colour scheme
(`src/export/readme.ts`). GitHub supports `prefers-color-scheme` in a `source` element.

- Images: `renderDiagramImage` (PNG) and `renderDiagramVideo` (GIF of a flow or the traffic), as in `render_image`.
  Dark renders first.
- Alt text: the description as one paragraph (`descriptionParagraph`), because an empty line ends an HTML block in
  Markdown.
- The export URL encodes paths, because `srcset` splits its value at spaces.

### Web page export

The Web page tab saves one HTML file that plays the diagram without other files or network
(`src/export/html-export.ts`). It plays from a drive, GitHub Pages or a pull request; an image or video cannot.

- A second Vite build (`scripts/standalone-player.ts`) bundles `src/standalone/main.tsx` into one IIFE script, one
  style sheet and the package licence texts in `standalone/`. The dev server builds them on first request and after
  each change. The export fetches them, so the app bundle has no player.
- Player: `PlayerStage` as in Present, with a flow picker, no exit button, and the viewer's colour scheme.
- Only what the diagram needs: its icons from the icon sets, Lucide icons outside the player bundle as icon data for
  `createLucideIcon`, and the `latin` and `latin-ext` app and diagram fonts as data URLs.
- The player build replaces `lucide-react/dynamic` and the icon set files with empty modules (the real ones add
  several megabytes).
- Diagram and icons go in `application/json` script elements, with `<` as `\u003c`. In script and licences, `</script`
  becomes `<\/script`, because an HTML parser ends a script element there.
- At the end: licence texts of the player packages and fonts, because MIT and OFL ask for them in every copy.

### README image

`pnpm readme-gif` (`scripts/readme-gif.mjs`) records the README GIF of the editor. It starts the dev server, copies
the Order system template in Chromium with Playwright, opens the flow panel and plays the flow.

- The Playwright fake clock (`page.clock`) controls `requestAnimationFrame`, timers and `performance.now`. The script
  moves one frame per screenshot, so no frame drops at any computer speed.
- `modern-gif` (the GIF export encoder) also runs in Node and writes only the changed area of each frame, unchanged
  pixels transparent.
- `node:zlib` reads the PNG screenshots; no image package.

### Release notes

The What’s new page (`#/releases`) lists published releases and notes. They come from the GitHub releases API in the
HTML media type, so GitHub renders mentions and pull request links. Drafts stay out.

- Live site (deploys only full releases): no pre-releases.
- Preview site (`VITE_RELEASE_CHANNEL=preview`, deploys `main`) also lists these, with a Preview mark:
  - pre-releases newer than the newest full release. A new full release replaces older pre-releases.
  - a Next release entry: commits on `main` after the newest release (GitHub compare API), no merge commits. Each
    shows its first line and links its pull request (`(#23)` of a squash merge) or commit. Without new commits, the
    page shows no entry. The entry needs no pre-release.
- The build embeds the fields that the page reads (`scripts/release-notes.ts`, `virtual:release-notes`), so visitors
  do not call GitHub (limit: 60 calls an hour per address). A build makes one call (two on preview), with no token.
  Changed notes show after the next deploy.
- Dev server or failed build fetch: the page fetches the releases itself and shows no Next release entry.
- The Next release entry links the installers of the newest `main` build: the published pre-release with the newest
  `preview-<run>` tag. The Preview app workflow publishes one at each push (`docs/RELEASING.md`). An immutable
  release keeps its files and tag. The release list and the compare call exclude these pre-releases. Links
  point only into `releases/download/<tag>/` of that build.
- `cleanReleaseHtml` rebuilds the notes from an allowlist of text elements, with only `http`, `https` and `mailto` link
  targets as attributes. Scripts, frames and non-HTML-namespace elements go, with their content. The page inserts the
  rebuilt nodes, never an HTML string.
- Only the website links to the page. The desktop window connects only to the app and has the updater.

### Share links

The Share link tab makes a link with the whole diagram, to play with no account, server or file
(`src/share/share-link.ts`). Own link code: no dependency, no licence.

- A format letter starts the data after `#/s/`. `y` is current. `z` (raw deflate, `CompressionStream`) still opens
  (test: `samples/z-checkout-flow.txt`).
- A `y` link carries the diagram JSON without id, timestamps and save counter (`linkJson`), in four steps:
  - **Implicit ids** (`link-ids.ts`). Random ids (`n_4k2j9x0q7a`) repeat and do not compress. The id keys are `id`,
    `source`, `target`, `parentId`, `fromStep` and `rejoinStep`. In them, each id becomes its prefix and a number in
    order of first `id` (`n_3`). The first `id` keeps only `n_`. Text outside the id keys is unchanged. Other id-like
    values there get an escape `~`. A test checks
    that templates and the newest format sample have ids only there, so the list misses no new id field.
  - **A context model** (`link-model.ts`) predicts each JSON bit from the last 1, 2, 3, 4 and 6 bytes, the word, the
    JSON key, the key with the word, and the longest earlier match. A mixer combines them. Two refinement stages
    correct the result. A binary arithmetic coder writes the bits. Integers and a curve table only, so every engine
    gives the same bytes.
  - **A dictionary** (`link-dictionary.txt`, about 158 KB, from `node scripts/link-dictionary.mjs`). Both ends first
    train the model on all template JSON. A template link takes a few hundred characters. A hash test pins the dictionary. A change to the dictionary or model breaks old links, so use
    a new format letter.
  - **A frame**: JSON length (varint), a 16-bit FNV-1a checksum and the coded bytes, in base64url, then `x`. A cut or
    damaged link gives an error. No link ends in a character such as `_` that Markdown and chat apps leave out.
- The model trains on the dictionary slowly, so the browser runs it in a module worker (`link-worker.ts`). Node and tests run it in the same thread.
- `MAX_LINK_JSON_BYTES` limits link JSON, and so the work of a damaged link.
- `samples/y-checkout-flow.json` and `.txt` pin the format: the test expects exactly that link on all CI systems.
- Above `LONG_LINK_CHARS`, the tab warns that some chat and mail apps cut the link. `share-link.test.ts` keeps the
  Order system, with its text, below an eighth of that limit.
- The data is in the fragment, which browsers never send to the site. The shared page decodes, migrates and plays it
  in `PlayerStage`. Save a copy stores it as a new diagram.
- The desktop app links to `WEBSITE_ORIGIN`. The website links to its own address, so preview shares preview links.

### Installable website

A tablet cannot run the desktop app, so the library offers to install the website (`src/install`). The installed app
opens from the home screen in its own window and works offline. Agents and diagram folders are desktop only.

- `public/manifest.webmanifest` and `public/icons` (from `pnpm app-icon`; the maskable and Apple touch icons fill the
  square) make the website installable. Chrome needs no service worker for that.
- Chromium fires `beforeinstallprompt`, and the offer shows an Install button. On tablets the website keeps the event,
  so Chrome on Android adds no install bar. Other browsers get one line of steps.
- iPad: the offer also says the Home Screen app keeps its own diagrams (iPadOS gives it separate storage).
- Only on tablets, not phones or the installed app; hidden once closed.

#### Service worker

Only the installed app registers the service worker (`src/sw/service-worker.ts`, own `tsconfig.sw.json` with the
WebWorker library).

- `scripts/service-worker.ts` writes the file plan of each build (`planAssetList`) to `assets/sw-assets-<hash>.json`
  (the hash names the build). Then it builds `sw.js` at the site root, one script with that path.
- At install, the worker fetches the page, public files and precache (about 4 MB). Precache: the entry, its
  on-demand chunks (editor, Present, template and share pages), their static imports and WOFF2 fonts.
- Then the installed app asks the worker to fetch the rest (icon sets, layout engine, Mermaid, video export; about
  13 MB in total), unless the browser saves data.
- `assets/` files have a content hash: cache first. The worker ignores `Vary`, because a server can vary on `Origin`
  and module script requests send one.
- Pages and other files (standalone player, licence texts) keep their names: network first, cache only
  offline. A navigation waits 4 s for the network, so a new version shows at once when online.
- A new worker waits until no old page is open and the old worker ends its work. Then it deletes the old page cache
  and hashed files outside the new build.
- `e2e/offline.spec.ts` builds and serves the website, then checks:
  - a tab without a worker;
  - the installed app without internet, also Tidy up after the full fetch;
  - a new version while online;
  - the clean-up after an update.

## Desktop app

The React app in Electron, plus file storage, agent control, the website handoff and GitHub Releases updates.

### Processes

- Main process (`electron/`): window, diagram files, agent server. No DOM.
- Preload: a typed API on `window.desktop` (`src/desktop/contract.ts`).
- Renderer: sandboxed, context isolation, never imports `electron`. Loads `app://diagrams` with a CSP in production,
  the Vite dev server in development (hot reload).
- Main-to-renderer requests: one correlated RPC with timeouts and cancellation (`electron/renderer-rpc.ts`).
- `new URL('app://diagrams/').origin` is "null" in Node. Origin checks compare scheme and host (`originOf`).

### Window

- No system frame; the page header is the title bar. System buttons: an overlay in the header colour (Windows, Linux)
  or traffic lights (macOS). `titlebar-area` CSS variables keep headers clear.
- A fixed 44 px drag strip tops every page, also without a header. Interactive elements and dialogs do not drag.
- Back and forward: app buttons, Alt with arrow keys (Command with brackets on macOS), mouse side buttons (no browser
  buttons).
- `pnpm app-icon` renders `build/icon.svg` to `build/icon.png` (1024 px) and `build/icon.ico` (16 to 256 px).
  - Unpackaged app: shows the icon on the window and macOS dock (Electron otherwise shows its own).
  - Packaged app: uses the executable or bundle icon.
- The window restores position, size and maximized state on a connected screen, shrunk to fit if the saved one is gone.
- `DIAGRAMS_HIDE_WINDOW` (desktop e2e tests, package smoke test): no visible window, taskbar button or focus.
  `offscreen` renders at full frame rate without a native window. Chromium throttles hidden native windows, so only the
  minimized-window test uses `native`.

### Storage

- The renderer keeps every diagram in memory (`cached-repository.ts`) for synchronous reads. Writes go to main in the
  background.
- Main writes atomically (temporary file, then rename) and retries the rename: Windows antivirus and OneDrive can hold
  a file.
- A file list waits for queued writes, so a reload after a change cannot read the old file.
- A folder watcher and a focus rescan report outside changes. A digest, size and change time per file tell outside
  changes from app writes. A known size and change time skip the read.
- That record changes only after a write or remove succeeds, so a failed write never looks like an outside change.
  A check that overlaps an app write counts for nothing.
- Repositories send `saved`, `save-failed`, `removed` or `remove-failed` when a save or remove ends (desktop: after the
  write). The library list refreshes on them. `watchSaveOutcomes` shows a run of failed saves once, again after a save
  reaches storage, and each failed remove.
- `openDiagramSession` (`src/store/document.ts`) owns the open diagram's saves: 400 ms delay, save on page hide,
  `flushPendingSave`. Unchanged content, as after a selection, writes nothing. A delete closes the session without the
  due save, so the file stays deleted.
- "New diagram" stores the diagram at once, so Present, a reload and agent tools see it.
  - When the library shows again, `discardUnusedBlankDiagrams` deletes this window's empty new diagrams with the default
    name and no editor. The desktop skips the trash.
  - The marks live in window memory, so a reload keeps the diagram.
- Linked files sit outside the diagrams folder (for example a repository's `docs/`), so a diagram can change in the
  same commit as its code.
  - Open file links one (`electron/storage/linked-files.ts`); Save as a file links a copy.
  - Id: `link-` and a path hash; list in `linked-files.json` in the user data folder. Remove from the library only
    unlinks.
  - `file-queue.ts` serves both kinds. Watchers on linked folders and the focus rescan report git or editor changes.
- Files use indented JSON with numbers to two decimals, for small diffs.
- A linked file is not written when only the viewport, save counter, time or measured sizes change: a pan or zoom must
  not alter the repository file.
- Version history shows the last git commit of a linked file over the canvas, with a change summary (`git show
  HEAD:./<file>` through `files.committed`). Restore is one undo step. Git must be on the PATH.
- An unreadable diagrams folder at start shows the reason and "Try again"; agent calls fail at once with it.
- A `changed` event for the open diagram (another tab or program) offers "Load newer". A diagram gone from storage stays
  open with a notice; the next change saves it. `rev` stays the diagram's save counter.
- On close, the window saves the open diagram and waits for queued writes. A crashed renderer delays the close by at
  most 3 seconds (the save limit includes the renderer start).
- Electron cancels a quit when a window prevents its close, so the window quits again after the save. The agent server
  and folder watcher stop on `will-quit`; on macOS they continue after a window closes without a quit.

### Agent tools

- The MCP server runs in main on `127.0.0.1:27419`. Calls go to the renderer for the ELK worker, Mermaid import, icon
  catalogue and rendering.
- Main and the renderer share `src/agent/tool-definitions.ts` (no DOM code). A tool without a handler fails the type
  check.
- `runAgentTool` runs calls one at a time in the renderer and owns their time limits:
  - A limit starts when the call leaves the queue.
  - At the limit the call returns an error. The next call waits for the handler to end, so it keeps its full limit.
  - A queued call that the client cancels never starts.
  - Main keeps only a long safety limit for a window that does not answer.
- A call that changes a diagram opens it in the editor, so the user sees the change. It commits one undo step
  (`oneStep`) that saves at once.
- Before the commit, `commitEdit` checks that the call is active and the editor shows the diagram. If not, the tool
  changes nothing and gives the reason. A diagram without an editor does not save.
- `commitEdit` describes the change in version history words (`describeChange`). The runtime adds it to the result as a
  `Changes:` line ("Added 4 nodes and 2 connections.").
- Checks without a full read (`src/agent/graph-checks.ts`):
  - `query_graph`: incomers, outgoers or neighbours of a node with their edges, or the shortest edge chain between two
    nodes (`findEdgePath`, the route of flows).
  - `lint_diagram`: issues with the nodes and edges they name.
    - `warning`: overlaps; nodes outside their group; nodes without edges; service, data and queue cards without a
      technology line; flow steps without a target; C4 diagrams (a card with a C4 type badge) with an element without
      a badge or key.
    - `info`: edges without a label, empty boundaries, cards with the same label (templates can have them on purpose).
  - A unit test keeps templates free of warnings.
- Tools that save, remove or change a diagram wait for storage (`untilStored`; desktop: after the file write). A failed
  write is a tool error, so the agent can tell the user; the change stays in the editor. The website handoff waits too.
- `layout_diagram` and Tidy up lay out a copy in the worker. `applyLayoutResult` applies positions, group sizes and
  routes to the current diagram. Changes made meanwhile stay.
- On commit, `fitGroupsToChildren` grows each group with new nodes around its children. Contents keep their canvas
  place when the group origin moves.
- `GROUP_PADDING_PX` (`src/model/graph.ts`: 56 px top for the label, 32 px other sides) serves layout, agent placement
  and editor grouping.
- Agents name nodes by id, same-call ref or unique label. An unknown or ambiguous name returns an error with the
  candidates.
- Unplaced new nodes go through ELK as a block, then next to their connected node, right of the content, or in a new
  row in their group. Agent positions stay exact.
- `render_image` mounts a separate export stage that measures its own nodes: a newly opened diagram has no node sizes
  yet.

### Security

- `/mcp`: only the loopback host name, no browser Origin, and the bearer token from the user data folder. "Connect an
  agent" shows and can reset the token.
- `/handoff/:code`: only the website origin (and the dev server in development), and a deep-link code from the last
  60 seconds, once.
- Renderer permissions: clipboard writes and full screen only. Handed-over diagrams always become new diagrams.

### Packaging and updates

- electron-builder (`electron-builder.ts`): Windows NSIS; Mac dmg and zip per architecture; Linux AppImage and deb.
  Vite bundles all main-process dependencies, so the package holds only `dist/` and three `dist-electron/` files.
  - Toolsets: `nsis` 1.2.1 (NSIS 3.12) and `appimage` 1.0.3 (the static runtime of type2-runtime). electron-builder
    marks them as beta.
  - The default toolsets have NSIS 3.04, which has CVE-2023-37378. Their AppImage runtime needs libfuse2, which
    Ubuntu 22.04 and later do not install.
- Fuses turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, inspect flags and extra `file://` rights, and allow only the
  checked asar archive.
- Release (`docs/RELEASING.md`): a `v*` tag starts `.github/workflows/release.yml` and sets the version
  (`-c.extraMetadata.version`); a release needs no commit. `pnpm release:tag` calculates the tag. One job creates
  the draft, because parallel electron-builder jobs could each create one. Platform jobs package, drive the app
  through the agent server (`scripts/smoke-package.mjs`) and upload. The maintainer publishes the draft.
- Release and `main` builds do not restore the Actions cache. Other workflow runs can write that cache. If a
  build restores that cache, a changed package in it goes into the installers.
- Each platform job attests the build provenance of its installers (`actions/attest`, SLSA provenance signed with
  Sigstore) after the test and before the upload. The attestation names the workflow file and the tag, so
  `gh attestation verify --signer-workflow --source-ref` rejects a file from another workflow or branch. Only an
  admin can create a tag, but any branch can change a workflow file. electron-updater does not check attestations.
- SBOM: the "Write the SBOM" job builds the bundles and runs `pnpm sbom --prod` (CycloneDX 1.6) once per release.
  `scripts/sbom.ts` completes that SBOM. Each platform job attests the same SBOM for its installers.
  - The production packages of pnpm include some that the bundles leave out, such as `@types` packages.
  - Some bundled packages are not in the list of pnpm, for example dev dependencies whose CSS ships (tailwindcss,
    shadcn). The script adds each one from its `package.json` and the lockfile hash, without its dependencies. As a
    result, shadcn stays a dev dependency, and its CLI dependencies stay out of the SBOM.
  - The script fails when a bundled package gets no component. CI runs the same check on each pull request.
  - The script adds each program in `EMBEDDED_SOFTWARE` inside the package version that holds it, with a purl and a
    CPE. `EMBEDDED_VERSIONS` finds the program versions: Graphviz from the loaded module, llhttp from
    `deps/llhttp/include/llhttp.h` at the undici release tag on GitHub.
  - Electron is a dev dependency, so the script adds it. The script starts the Electron binary with
    `ELECTRON_RUN_AS_NODE` and reads `process.versions`. Chromium, V8 and Node.js go inside Electron. The projects of
    Node.js, such as c-ares, nghttp2, SQLite and libuv, go inside Node.js.
  - The projects of Chromium come from `LICENSES.chromium.html` next to the binary. That file does not give versions.
  - Each Fontsource package gets its font as a `data` component, from the `metadata.json` of the package.
  - Each icon set in `src/canvas/icons/data` becomes a `data` component, from `scripts/icons/sources.ts`, with the
    SHA-256 of its data file. Simple Icons holds a component for each bundled logo that has its own licence.
  - app-builder-lib (electron-builder) holds the code that the installers add next to the app:
    - NSIS 3.12 for the Windows installer and uninstaller, with the plugins that their scripts call.
    - Elevate 1.3.0, which the Windows installer puts in `resources\elevate.exe`.
    - The AppImage runtime (type2-runtime 20251108). It is a static program with libfuse 3, squashfuse, Zstandard,
      zlib, mimalloc and musl.
    - Six libraries in `usr/lib` of the AppImage.
  - `INSTALLER_TOOLSETS` names the toolsets and their bundles with the SHA-256. A test fails when
    `electron-builder.ts` selects other toolsets, or when app-builder-lib downloads other bundles for the selected
    toolsets.
  - `NSIS_PLUGINS`, `APPIMAGE_RUNTIME_SHA256` and `APPIMAGE_LIBRARIES` give the SHA-256 of each file from the
    bundles. CI runs `scripts/installer-contents.ts` on the built installers. The script fails when an installer
    holds a file that the SBOM does not list. It also fails when the SBOM lists a file that no installer holds.
  - The app gets a `pkg:github` purl, because the npm purl of the private package names another package.
- Preview tags (`v0.2.0-beta.1`) build in the `preview` environment without approval and publish as GitHub
  pre-releases.
- Channels: a normal version reads `/releases/latest` (never a pre-release); a beta or alpha takes the newest release
  of its channel or a more stable one. electron-builder writes only `latest*.yml` for GitHub; no channel files.
- `electron/updates.ts` policy per build (public releases; no token):
  - Windows, signed Mac build, AppImage: download; install on quit, or at once on Restart.
  - deb, other Linux packages: install only on Restart (the install asks for a password).
  - Mac without Developer ID signature (`macSigned` in the packaged `package.json`): a link to the new version.
  - Build from source, or no `app-update.yml`: none.
  - `main` builds from `preview-<run>` pre-releases (`x.y.z-preview.n`): none. electron-updater cannot compare these
    tags and offers pre-releases to any pre-release version, so beta and alpha apps skip them too.
- Website download button: the latest release's installer (GitHub API) for the visitor's system (client hints, then
  user agent). Safari and Firefox report Apple silicon Macs as Intel, so a Mac without the architecture hint, other
  systems and failed lookups get the release page. It links only this repository's release files.
- The app registers `diagrams://` at each start. The Windows uninstaller removes it if it points at the installed app
  (`build/installer.nsh`); an update keeps it.
- Before an update Restart, main saves the open diagram and waits for the writes (`prepareQuit`): on macOS, the
  update quit skips the window close step.
- Signing waits for secrets in the release environment. Mac builds without a certificate get an ad-hoc signature,
  which Apple Silicon needs after the fuses change the binary. Windows checks update publishers only after a signed
  release.

### Handoff from the website

"Open in desktop app" opens `diagrams://receive?code=...`, which starts the app or reaches the running one. The
website then posts the diagram to the loopback server, with retries for 15 seconds. Chrome asks once before a website
reaches local devices.

The agent card and "Open in desktop app" show only on a computer. `deviceKind` (`src/lib/device.ts`) returns
`computer`, `tablet` or `phone`:

- User agent names a phone or tablet: that kind.
- Mac or Linux user agent with touch as primary pointer (iPadOS Safari, Chrome on large Android tablets):
  `tablet`. A touch-screen MacBook or Linux laptop stays `computer` (trackpad as primary pointer).
- Linux user agent with `window.orientation` (Chrome and Firefox: Android only, in every mode): `tablet`. This finds
  Android computers (Samsung DeX, Android PC builds), where the mouse is primary. The touch test is a second check.
- Windows: always `computer`; Windows tablets run the app.
- A keyboard with a trackpad changes nothing: Chromium on Android and WebKit on iPadOS keep touch primary; the
  trackpad adds only to `any-pointer`.

### Command-line render

`--render <file> --out <file>` renders a diagram file to PNG, SVG, GIF, MP4 or WebM and quits, for scripts and CI.
It uses `renderDiagramImage` (as the agent tool `render_image` does) and `renderDiagramVideo`.

- `electron/render-args.ts` reads the options before the single-instance lock, so a render runs next to an open app.
  Exit codes: 2 (usage) for bad arguments, 1 (message) for a failed render.
- `electron/render-cli.ts` opens a hidden window on the empty page `#/render`, with background throttling off, and
  calls `render.file` (`src/export/render-file.ts`).
- The window gets no diagram files, agent server, updates or file writes. The macOS dock icon hides.
- A new temporary user data folder keeps the app settings, diagrams folder and agent token unchanged. Chromium on
  Windows locks the folder until exit, so each render deletes folders older than one hour.
- Chromium needs a display: on Linux CI, use `xvfb-run`.

### Render action

`actions/render` is a composite GitHub Action that keeps diagram images current with the command-line render.
`main.mjs` runs in Node; `lib.mjs` holds the tested parts (file patterns, image paths, the comment).

- App: the action downloads the Linux AppImage of a release with `gh` and the job token. Runners have no libfuse2,
  which the AppImageKit runtime of older releases needs, so the action unpacks the AppImage. The app runs under
  `xvfb-run` without a display, and with `--no-sandbox` without unprivileged user namespaces. The `app` input replaces the download (this CI: the build from source).
- Files: only tracked files (`git ls-files` with glob pathspecs), so no `node_modules` or build output.
- Write mode renders each file next to it and outputs the image paths. The workflow commits them with its own branch
  and message.
- Compare mode diffs the base commit of the pull request with the checkout and renders each added, changed or removed
  diagram before and after.
  - Images go to the `diagram-previews` branch under `pr-<number>/<commit>/`; GitHub has no API for comment images.
  - `?raw=true` links work in private repositories for people who can read them.
  - One comment, found by a marker, updates at each push.
  - The token goes to git through `GIT_CONFIG_*` variables, not the command line; the log masks it.
- `base-app`: both apps render every matched diagram, also untracked files. Only diagrams with different images stay.
  One runner and a fixed render time make an exact byte compare enough. A diagram that the base app cannot open gets a
  note in place of its old image. With no difference, the comment says so, to show that the check ran.
- `base-root`: the base app renders the files at the same paths in that folder. Files on one side only show as new or
  removed. An app refuses a newer format, so without this input a format change gets no old images.
- `.github/workflows/display-previews.yml` runs the action for a pull request from this repository that changes drawing
  code, templates or dependencies. It builds the app of both commits. `scripts/template-files.mjs` of each commit writes
  each template as a dark and a light diagram file in `.diagram-previews/` and `base/.diagram-previews/`. Template
  changes then show. A template gets new random ids at each build, so the script numbers the ids in order. Particle
  times depend on a hash of the edge id, so the script sets the times to 0.
- App screens show what an export does not draw. `scripts/app-screens.mjs` of each commit serves its web build and
  takes them with Playwright in both themes:
  - library, template page, editor with a node selected and with the flow panel, image export, Present at its first
    step and five steps later;
  - empty diagram at 1440 × 900;
  - editor with properties and flow panel at 1280 × 720;
  - phone library, editor and Present at 390 × 844.

  Reduced motion and no CSS animations keep the screens still. Library screens show the whole page, after every card
  preview frames its diagram.

- `e2e/accessibility-scan.spec.ts` runs axe (`@axe-core/playwright`, WCAG 2.2 A and AA) in both themes.
  - Scope: library, template page, editor (selection, flow panel), command and insert menus, shortcut sheet, image
    export, minimap, Present with Explore, phone library and editor.
  - A violation fails the run.
  - The scan leaves out what Explore dims (text at 16 %): WCAG 1.4.3 excludes inactive parts.
  - Every node has the `group` role.
  - The zoom readout, Insert, the path pickers and the log rows take their name from their text.
- `samePixels` (`actions/render/png.mjs`) compares the screens: at most 16 pixels with a colour channel more than 8 of
  255 off. Builds of the same code differ a little at text edges and rounded corners; a real change moves hundreds of
  pixels.
- Red boxes mark the changes of a changed PNG on both images (`changedRegions` and `drawBoxes` in `png.mjs`):
  - Rows pair first, as in a line diff. Each row gets a hash of its colours at 16 levels.
  - Rows that occur once in both images are anchors. Anchors use the longest run in order. Equal rows next to an anchor
    pair too. Content that only moved up or down counts as unchanged.
  - In a run of unpaired rows, rows on both sides compare pixel by pixel. A row on one side only counts where it
    differs from its first pixel, the background.
  - Changed pixels group in 16 px squares. Changes less than 32 px apart share a box.
  - Groups of 16 or fewer pixels are noise (the `samePixels` limit). The nearest boxes merge down to 8 on each image.
  - A change on one side gives the other image a box with no height, which moves its cut-out there.
  - Outlines stay inside the image, so a page-wide box shows its sides.
- A comment image taller than 1000 px shows a cut-out of at most 800 px. The cut-out starts at the first change and
  ends at the last whole box that fits, before the next outline. The action cuts only a taller first box. The link
  under it opens the whole image and counts the changes outside. The action cuts each side around its own boxes; the
  heights can differ.
- The featured stage and the template cards frame their diagram after the fonts load and after node sizes change.

### Continuous integration

`.github/workflows/ci.yml` runs on each pull request and on `main`.

- "Typecheck, lint and unit tests": static checks and Vitest, with browser tests in Chromium.
- "Web tests 1 of 4" to "4 of 4": the end-to-end tests, split with Playwright `--shard`. A 4-core runner gets 2
  workers; four shards give the 8 of a developer computer. The matrix sets the number (`strategy.job-total`).
- "Checks and web tests": the required check of the "Protect main" ruleset. It fails unless each job above passed. It
  has `if: always()`, because GitHub counts a required job skipped after a failed dependency as passed.
- "Desktop app on …": unit tests, desktop end-to-end tests and the render action on Windows, macOS and Linux.
  - Each job builds the installers of its system for its own architecture: NSIS on Windows, dmg on macOS, AppImage
    and deb on Linux.
  - The job installs or mounts each installer and runs `scripts/smoke-package.mjs` on the installed app. On Windows,
    the job then runs the uninstaller and checks that the uninstaller removed `Diagrams.exe`.
  - The Windows and Linux jobs run `scripts/installer-contents.ts`. The script compares the NSIS plugins, the
    AppImage runtime and the libraries in `usr/lib` of the AppImage with the SBOM. The script unpacks the Windows
    installer and uninstaller with 7-Zip.
  - Each job uploads its installers as the workflow artifact `installers-<runner>`. GitHub keeps them for 7 days. A
    reviewer can install the app from the installers of a pull request before the merge.
- `.github/actions/playwright-chromium` caches Chromium by Playwright version. Linux still installs the system
  libraries, which a cache cannot hold.
- Playwright keeps a trace of each failed CI test (`trace: 'retain-on-failure'`); the failed job uploads it in
  `test-results`. No retries, so a test that fails only sometimes stays visible.
- `.github/workflows/dependency-review.yml` compares the dependency graph of a pull request with its base. It fails
  when the pull request adds or changes a package with a high or critical advisory, in runtime or development scope.
  It also fails for a licence outside `allow-licenses`, which holds the licences of the lockfile. A package with no
  licence only shows in the summary.
- `.github/workflows/scorecard.yml` runs OpenSSF Scorecard on each push to `main`, each Monday and after a change to
  branch protection. It publishes the result to the Scorecard API for the README badge, and it uploads the findings
  to code scanning. The Scorecard API accepts a result only from a job with approved actions and no `run` steps.

### Skills

`claude-plugin/` holds the skills and the Claude Code plugin manifest. The main process bundles it and offers the text
as:

- server instructions that point to the skills (Claude Code shows 4,096 characters);
- `skill://diagrams/<skill>/<file>` resources, in the file layout of the MCP skills extension;
- the prompts `draw-architecture`, `animate-flow`, `diagram-from-code`, `threat-model` and `review-diagram`;
- a local plugin marketplace in the user data folder, written at start with the app version, for
  `claude plugin install`.

The `infrastructure` skill builds or checks a diagram from Terraform, Compose or Kubernetes files. The agent reads the
files with its client tools. The app has no parser, because the formats change often. Each node keeps its source as a
link (`Source: <resource address>` to the file on the code host), so a later check matches by address, not by name.

The `skills/list` and `skills/get` methods (MCP skills extension, SEP-2640) wait until ViteMCP can declare extensions.
Tests fail when a skill names a missing tool or icon.

## Network connections

The landing page (`src/library/PrivacySection.tsx`), its first line (`storageCopy().promise`) and the README promise
that the app stores no diagram outside the user's computer. The table lists every connection; a new one updates it and
those texts.

| Connection                                        | When                                                                                     | Data                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The website files, from its host                  | A visit; a feature that loads its code or an icon set                                    | Fixed paths. Hash routing keeps diagram ids and share data out of requests. |
| `api.github.com`, the latest release              | On a computer, once: while the agent introduction shows, and in "Could not open the app" | No diagram. Picks the installer for the system.                             |
| `api.github.com`, release notes                   | Build time. At run time only on the dev server, or when the build could not load them    | No diagram                                                                  |
| `github.com` releases, through `electron-updater` | Desktop app: at start, every 6 hours, "Check for updates"                                | No diagram. A random install id.                                            |
| `127.0.0.1:27419` handoff                         | "Open in desktop app"                                                                    | The diagram, loopback interface only                                        |
| `127.0.0.1:27419/mcp`                             | While the desktop app runs and an agent calls it                                         | Diagrams and images, to the connected agent                                 |

- Share links carry the diagram in the fragment, which a browser never sends. Links and exports use no network.
- The desktop renderer connects only to `'self'`, `data:` and `blob:`. `https:` links open in the system browser.
- `src/content-security-policy.ts` holds the renderer policy. `electron/app-protocol.ts` sends it as a header. The
  website build puts it in a meta element at the start of the page (`scripts/content-security-policy.ts`), with
  `connect-src` for `api.github.com` and `127.0.0.1:27419` from the table. A meta element cannot set
  `frame-ancestors`, so other sites can show the website in a frame, unless the host sets `frame-ancestors` in a
  header.
- zod tests for eval when it creates an object schema, and the policy reports that test as a violation. App code
  imports `z` from `@/lib/zod`, which turns the test off (`jitless`). A lint rule blocks direct `zod` imports.
- `e2e/content-security-policy.spec.ts` builds the website and fails on each violation while it uses the main
  features. These features are release lookups, Tidy up, image and GIF export, Present, Mermaid import, share links
  and the handoff.
- Fonts, icons and Mermaid ship in the bundle.
- A connected agent sends what it reads to its model. The "Connect an agent" dialog says so.

## Third-party licences

`scripts/third-party-licenses.ts`, a Vite plugin, collects the package of each module in the web and worker builds and
writes `third-party-licenses.txt` with each licence text. The desktop main build writes
`third-party-licenses.main.txt`. The fonts (OFL), elkjs (EPL) and mediabunny (MPL) need a licence text or source
statement in each copy. A list that people keep by hand can become different from the lockfile. Tailwind resolves the `@import` and
`@plugin` rules of the style sheets itself, so the module graph does not hold the packages that these rules name.
The plugin reads the rules of each style sheet in the bundle and adds those packages: tailwindcss, tw-animate-css
and shadcn.

Some packages hold another program in compiled form, with its own licence: Graphviz in `@hpcc-js/wasm-graphviz`
(web worker and main), llhttp in undici (main). `EMBEDDED_SOFTWARE` names each one with its licence text. The build
fails when a bundled module loads WebAssembly or holds a base64 WebAssembly module, and its package has no entry.

The standalone player build writes `dist/standalone/licenses.txt`, which each web page export holds. The preload
build writes no licence file, so `withoutPackages` fails the preload build when that build bundles a package. The SBOM check reads the
licence files of the web, player and main builds.

`THIRD-PARTY-NOTICES.md` covers icons and logos (data, not packages). A test checks that it lists every bundled Simple
Icons logo that has its own licence.

## Limits

- `localStorage` holds about 5 MB per site; versions in IndexedDB do not count. The desktop app has no such limit. A
  typical diagram uses 20 to 80 KB. When storage is full, the app keeps the diagram in memory and asks the user to
  export JSON.
- SVG export embeds HTML in `foreignObject`. Browsers show it; design tools can show it as one image.
- Performance budget: about 150 nodes, 200 edges and 600 particles at 60 fps.
