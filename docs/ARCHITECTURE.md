# Architecture

## Goal

A free, frontend-only tool for diagrams of software systems and user flows that look good enough
to put in a talk or a README, and that can move: traffic flows along connections, and a flow
walks a user through the system with a camera that follows them.

## Stack and why

| Area            | Choice                                                               | Reason                                                                                                                                          |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Build           | Vite 8 (Rolldown, Oxc), `@vitejs/plugin-react` 6, React Compiler 1.0 | Fast HMR; the compiler removes manual memoization in a heavy editor.                                                                            |
| Language        | TypeScript 7                                                         | Native compiler, fast `tsc -b`.                                                                                                                 |
| Canvas          | `@xyflow/react` 12 (MIT)                                             | Nodes are plain React and HTML, so cards get full CSS control. tldraw needs a paid licence or a watermark. Excalidraw has a hand-drawn look.    |
| UI              | Tailwind 4, shadcn CLI 4 with Base UI, lucide icons                  | Owned, accessible components with tokens in CSS variables.                                                                                      |
| State           | zustand 5 + immer 11                                                 | One central document store. Immutable snapshots make undo cheap.                                                                                |
| Validation      | zod 4                                                                | Validates stored and imported data, with versioned migrations.                                                                                  |
| Routing         | TanStack Router, hash history                                        | Typed params, and deep links work on any static host.                                                                                           |
| Motion          | Own rAF engine for the canvas, `motionValue` from `motion` 14        | The canvas engine needs real elapsed time and frame-exact control for export. Motion's frame loop limits each step to 40 ms.                    |
| Layout          | elkjs 0.12 and an own grid and edge router, in a web worker          | ELK layers suit flows. Groups that ELK stacks badly go in a grid, and the router keeps edges out of groups that do not hold their ends.         |
| Image export    | `@zumer/snapdom` 3.3                                                 | Best maintained DOM capture; embeds fonts.                                                                                                      |
| Video export    | mediabunny 1.61 (MP4 H.264, WebM VP9)                                | WebCodecs muxer that replaces `mp4-muxer` and `webm-muxer`.                                                                                     |
| GIF export      | modern-gif 2.1                                                       | Maintained encoder with a worker.                                                                                                               |
| Mermaid import  | `mermaid` 12, loaded on demand                                       | `getDiagramFromText` + `db.getData()` parse flowcharts without a render.                                                                        |
| Lint and format | oxlint (type-aware), oxfmt                                           | Rust speed, create-vite default.                                                                                                                |
| Tests           | Vitest 5 (node and Chromium browser mode), Playwright                | Real browser for Mermaid and export.                                                                                                            |
| Desktop         | Electron 45, main and preload built with Vite                        | The same Chromium as the tests on every platform, so WebCodecs export and snapdom capture behave as in the browser. Node runs the agent server. |
| Agent server    | `@vitemcp/server` (MCP over HTTP), hono                              | Tools come from the zod schemas. The same loopback server also takes diagrams that the website hands over.                                      |

Ruled out:

- **GSAP**: its free licence forbids products that compete with Webflow as visual animation
  builders, and Webflow can end the licence. This app is a visual animation builder.
- **Theatre.js**: no release since 2024, and the studio is AGPL.
- **html-to-image**: no release in more than a year; React Flow pins an old version.
- **dagre**: a second layout engine is not worth the tuning cost next to ELK.
- **libavoid-js and MSAGL as edge routers**: both were tried on the grid layouts. libavoid-js (LGPL WASM) has no
  cluster API in its JavaScript build, so its routes crossed groups that held neither end. MSAGL's rectilinear
  router sent routes through cards inside groups once a diagram had several groups.
- **TALA (D2)**: the only open engine made for architecture containers, but its browser bundle is 11.5 MB and it
  needs the diagram as D2 text.
- **Tauri 2**: it uses the web view of the system, which is WebKit on macOS and Linux. Video export and
  capture would need a second engine to test, and the agent server would need Rust or a sidecar.

## Visual language

The visual system lives in `DESIGN.md` at the repository root.

- Node kinds carry meaning through their outline: service, data store, queue or stream, client,
  external system and function. Groups mark boundaries. The `form` field on a card holds the kind.
  Version 2 of the schema added `form` and removed the card `variant`; the migration infers `form`
  from the icon of version 1 cards. Version 3 renamed the default font pair from `geist` to
  `atkinson`. Version 4 added `event`, `latencyMs` and `level` to flow steps, so that a step reads
  as a log line. Version 6 made Host Grotesk with Fragment Mono (`host`) the default pair and moved
  diagrams on `atkinson` to it, and added `protocol` to edges and `protocolColors` to the theme.
- Groups are boundaries. A group's `kind` points into the catalogue in `src/model/boundaries.ts`:
  AWS, Azure, Google Cloud, Kubernetes and general kinds, plus the custom group. Each kind has a
  family (scope, logical, location, zone, network, subnet, security, runtime) that sets its line
  pattern, a default colour, an icon and an example detail. The canvas label names the kind, the
  user's name and a detail such as an account id or an address range. Boundary colours come from a
  separate palette without the walkthrough blue; the diagram setting `boundaryColors` turns them
  off. Version 5 of the schema added `kind`, `detail` and `color` to groups and `boundaryColors` to
  the theme. Choosing a boundary in the insert menu wraps the selected nodes.
- The look is black and white with one signal colour. The app chrome and the default canvas use
  Host Grotesk at weights 400 and 500, with Fragment Mono for values that people copy. The palette
  was GitHub Primer before; it read as a GitHub feature, not as a product of its own.
- Signal blue is the walkthrough colour, the focus ring and the token in the app mark. Nothing else
  uses it, so a boundary palette or protocol palette never has a saturated blue.
- Nodes separate from the ground by their fill; the outline is only a quiet edge. Outlines that
  carried all of the separation made every element sit on one plane.
- New edges route at right angles with rounded corners (`smooth`). Bezier curves read as a React
  Flow demo.
- An edge has a protocol: HTTP, RPC, database or messaging. With `auto`, `detectProtocol` reads it
  from the label ("HTTPS", "gRPC", "SQL", "publish"); the properties panel can set it. Each protocol
  colours the line, the arrow, the traffic and the label. The diagram setting `protocolColors`
  turns this off. While a flow plays, visited and active edges draw at 2 px in the brighter text
  colour of their protocol, and the token dot and label take the colour of the hop they are on, or
  of the last hop while the token rests on a node. Edges without a protocol, and the token before
  its first hop, use signal blue. In a spotlight flow, idle edges recede to the neutral line.
- The grid is an editing aid. Present, the library previews and exports (unless the user turns it
  on) do not draw it.
- Node accent colours are no longer offered in the editor. The schema keeps the `accent` field for
  older diagrams, and the canvas draws every accent in the neutral tone.
- A flow plays as a log: the flow panel lists each step as a line (offset, element, event,
  latency, caption; warn and error levels colour the event), and the line under the pointer marks
  its node or edge on the canvas. The latency column hides when no step has a latency, as in user
  flows. Present
  and video exports show the current line in a strip at the bottom of the frame; the camera keeps
  its target clear of that strip through the engine insets.
- The token label lifts above a node while the token moves along the node's top edge, and fades
  out near the ends of an edge, so that it never covers a node title. Both values come from
  `evaluateFlow`, so exports stay frame exact. When one edge step follows another at a different
  point of the same node, the token moves along the node outline (`perimeterPath`) instead of a
  jump. Edge labels hide while the token dot or the token label passes over them.
- The library shows the product working. Cards are read-only canvases fitted to the whole
  diagram, at any zoom. The featured stage and the template page frame the diagram so that text
  stays readable (`readableViewport`): a diagram that fits at zoom 0.5 or more shows whole, a
  larger one crops around its node with the most connections. The first flow plays on hover and
  focus. On the first visit, the Order system flow plays in a loop in a full-width stage. Static
  wireframe thumbnails hid the motion. Cards that cropped around one node showed a fragment with
  lines that ran off the edge, so people did not recognise their own diagrams.
- A card preview mounts when it comes within one screen height of the visible part of the library
  (the scroll container is the observer root, so the margin works), one preview for each idle
  moment (`useIdleMount`), and stays mounted. A React Flow mount takes up to about 100 ms, so a
  mount during a scroll drops frames. The engine of a preview runs its frame loop only while the
  preview plays; otherwise it pauses after one last render (`EngineProvider running`).
- The canvas comes first. Panels open on demand: the insert menu on `N` or a double-click, the
  properties panel only for a selection, and the style menu in the top bar.
- Metrics, meters, status dots and badges are optional. Templates use them only where they carry
  data, such as a connection pool size or a port.
- Cards, shapes and text always draw above boundaries (`ELEMENT_Z`). React Flow puts a child node
  one step above its parent, so without a common base a card in an outer boundary drew under a
  more deeply nested sibling boundary and its border cut through the card.
- Boundaries of the runtime tier (cluster, node pool, Auto Scaling group, application) are solid:
  they fill with the ground colour, draw the canvas grid again at the same positions, and sit
  above the other boundaries (`layerNodes` gives them a higher z-index at render time, without a
  change to the stored data). A cluster that spans two availability zones therefore hides the
  zone and subnet lines under it, instead of letting them run through the services inside it.
- A drag on empty canvas pans and Shift plus drag selects, so the right mouse button only opens the
  context menu. Nodes follow the pointer freely during a drag and snap to the 16 px grid on drop;
  the canvas dots show that grid. Snapping during the drag moved nodes in visible jumps.
- Letter shortcuts match the character of the active keyboard layout, and fall back to the
  physical key on layouts without Latin letters. The insert key is `N` because `/` needs a
  modifier on many European layouts.
- Nodes and edges do not use `backdrop-filter`, because image capture cannot reproduce it.
- Card and boundary icons keep a minimum size on screen. CSS scales them with `scale`, from
  `--dg-zoom`. A transform does not change the node size, so edges and handles stay where they are;
  only a margin moves the title. `ZoomProperty` writes the zoom on each icon while it changes, in
  steps of 5 %, without a React render. A changed custom property on the canvas root restyles every
  element of the canvas, which took about 4 ms per zoom frame in the multi-cloud template, so the
  root gets the zoom only after the zoom stops, for icons that mount later. The zoom comes from the
  camera, so a flow frame still depends only on the time, and the video export shows the same
  icons.

### Icons

An icon name is either a Lucide name (`database`) or a set icon with a prefix: `aws:`, `azure:`,
`gcp:`, `k8s:` or `logo:`.

- The sets come from the official sources: the AWS Architecture Icons package, the Azure
  architecture icons, the Google Cloud product icons, the Kubernetes icon set and Simple Icons for
  software logos. The licences and usage terms are in `THIRD-PARTY-NOTICES.md`.
- `scripts/icons/catalog.mjs` lists the curated entries: product name, source image, card form,
  aliases for import matching and search keywords. `pnpm icons` downloads the packages into
  `node_modules/.cache`, optimizes the SVG files with SVGO and writes one JSON file per set to
  `src/canvas/icons/data`. To take a new AWS or Azure release, change its URL in
  `scripts/icons/build.mjs` and run the script again.
- Google Cloud uses unique icons only for core products; every other product uses the icon of its
  category, and the older per-product icons are retired. The catalog follows that rule, so
  Pub/Sub and Datastream both show the Data Analytics icon.
- The JSON files are separate assets (`?url` imports). The icon cache fetches a set the first time
  a diagram, the picker or the insert menu needs it, so the main bundle does not grow.
- Cloud icons draw as `<img>` elements with a data URL. They keep their own colours and gradient
  ids, and the providers' terms do not allow changes to the artwork, so an idle node in a flow
  fades its icon with `opacity` and never with a colour filter. Logos are single paths and
  draw in `currentColor`, like the Lucide icons. AWS general icons have a variant for dark
  backgrounds; CSS shows the variant that matches the canvas theme, or the app theme outside the
  canvas.
- Boundary kinds use the provider's group icon where one exists (AWS account, region, VPC and
  subnets; Azure subscription, resource group and virtual network; the Kubernetes logo for a
  cluster).
- The insert menu searches the sets from two characters and inserts a card with the product name,
  the icon and the card form of the product. The Mermaid import gives a card an icon when its
  label is an alias of an entry, alone or with one role word ("Redis cache", "Postgres DB"). A
  looser match gave icons to user flow steps such as "Go to checkout".

## Architecture

```
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
  import/       Mermaid import
  io/           import dialog (diagram file and Mermaid)
  layout/       ELK layers, group grid and edge router, run in a worker
  library/      library page, live previews and their framing
  player/       presentation page
  templates/    starter diagrams
  components/   shadcn (Base UI) primitives in ui/
  lib/          small shared helpers: errors, queues, idle mount, reduced motion
  styles/       canvas CSS and its theme variables
e2e/            Playwright tests for the website, and for the desktop app in e2e/desktop
scripts/        icon catalog and build (icons/), app icon, desktop dev runner, third-party licence plugin
build/          app icon sources and renders
```

### Data model

A `Diagram` holds nodes (`card`, `shape`, `text`, `group`), edges (`flow`), flows, a theme and the
viewport. On the web, each diagram is stored under its own key (`dg:diagram:<id>`) next to an index
(`dg:index`). On the desktop, each diagram is a file `<id>.diagram.json` in `Documents/Diagrams`, and
the file name is the id. The `rev` counter detects edits from another tab or another program.
`repository()` returns the store of the build; the rest of the app does not know which one it is.

A `Flow` is an ordered list of steps (a node or an edge, a caption, a duration, a camera mode) plus
optional keyframe tracks (camera, opacity, traffic). The timeline is computed from the steps and
never stored.

### Animation engine

- `path-sampler` parses the SVG path data that React Flow writes and builds an arc-length table,
  so a point at a fraction of the length costs one array lookup.
- Each edge registers its table and its particle elements with the engine of its canvas.
- One `requestAnimationFrame` loop advances two clocks: the ambient clock for traffic and the
  playback clock for the active flow. It writes particle positions as SVG attributes and flow state
  as `data-flow` attributes. React does not render per frame.
- `evaluateFlow(timeline, t, geometry, view)` is pure. Token position, node and edge state,
  caption and camera depend only on `t`. Scrubbing and export use the same function.
- The step camera is a weighted mean of the step targets over a time window around `t` (1 s for
  the position, 1.6 s for the zoom). Constant targets add their exact share of the window weight,
  and follow targets add samples, so the camera starts to move before a step starts and has no
  jumps. Explicit blends of 300 to 700 ms with `interpolateZoom` made the zoom pump on short steps.
- A step zooms in by at most 1.35 times over the step before it; a follow step also zooms out by at
  most that ratio. The flow opens from the overview with `interpolateZoom` over 1.5 s.
- With `prefers-reduced-motion`, the camera cuts to each step and Present does not start on its
  own. Exports always use the full motion.
- In the editor, the preview and Present, play and seek glide from the current viewport to the
  flow camera over 700 ms of wall time. This handoff is outside `evaluateFlow` and the export
  engine does not use it. In the editor the camera centres inside the area that the panels leave
  free.

### Layout

`layoutDiagram` (`src/layout/diagram-layout.ts`) sends the nodes, sizes and edges to
`layout.worker.ts`, which runs `computeLayout` (`engine.ts`). ELK runs in its own worker inside that
worker: `elk.bundled.js` takes any web worker for the ELK worker and does not export its in-thread
fallback there.

`computeLayout` first runs ELK layered with `INCLUDE_CHILDREN` (`hierarchy.ts`). ELK reads spacing
from the parent graph of each node, so every group gets the same spacing options as the root;
without them, the nodes in a group were 20 px apart. The gap between layers fits the longest edge
label, from 120 to 280 px, so labels do not cover nodes. A group is at least as wide as its label.
Edge labels are not ELK labels: label dummy nodes made each labelled edge a layer of its own and the
diagram far too wide.

With `INCLUDE_CHILDREN`, all groups share one layering. That is right for flows (client, edge, app,
data), but a chain or a hub of many groups became a diagonal staircase with about 5 % of the area
used, and the ELK maintainers say that compaction does not work in this mode. So when a level holds
two or more groups, `arrange.ts` also lays out each container on its own, from the deepest up, the way
yFiles `RecursiveGroupLayout`, MSAGL and TALA do. For each such level it compares ELK layers with a
grid: a band of sources (a gateway) and then the boxes in a grid of the target aspect, with cells
swapped while the score improves. The score adds the real edge lengths between nodes inside the
groups, costs for edges against or across the layout direction and for crossings, and the extent.
The grid replaces the layers only when it costs less than 85 % of them. If no level uses a grid, the
ELK result stays as it is.

A grid layout needs its own edge routes, because ELK only routes the graphs that it lays out.
`router.ts` routes on a sparse orthogonal grid: the lines at a clearance from each node, the node
centres, and the middle of each gap. A* search with costs for length, bends and segments that
earlier routes use finds each route, from the nearest edge to the farthest. A group blocks every
route except those with an end inside it. Then nudging moves overlapping parallel segments apart,
in the order with the fewest crossings, as far as the nearby nodes allow.

Both kinds of routes go in `edge.data.route` as canvas coordinates. An edge with automatic sides and
a `smooth` or `step` path follows its route while the first and last points still touch its two
nodes (`routeFits`). After a node moves, its edges go back to the facing-sides path, so no action
has to clear routes. Without routes, edges ran behind the nodes between their ends, and every edge
met a node at the middle of its side. Agent placement keeps the routes inside a block of new nodes;
it snaps the block origin to the grid, not each node, because a snapped node would no longer touch
its route.

### Portals

Edge labels, ports and the flow token render through `EdgeLabelPortal` and `ViewportLayerPortal`,
not React Flow's `EdgeLabelRenderer` and `ViewportPortal`. Those run `querySelector` in a store
selector, so each labelled edge queried the DOM on every pan and zoom frame. In a diagram with
340 edges, that was the largest JavaScript cost of a pan.

### Undo

History stores immutable document snapshots (immer keeps unchanged parts shared). Discrete actions
record before they change state. Drags and resizes record one step per gesture, and only if a node
moved. Edits with the same key within 500 ms merge into one step. Selection and measurement changes
are never recorded.

### Version history

Undo lives in memory and ends with the tab. The version history keeps saved states of each diagram
across sessions, so people can see how a diagram looked earlier and go back to it.

- Versions live in IndexedDB (`src/persistence/version-store.ts`), in the browser and in the
  desktop app alike. Each version is the diagram JSON compressed with gzip, beside a small record
  with the author, the time and a summary. IndexedDB has far more room than the 5 MB of
  `localStorage`, and keeping versions out of the diagram files keeps the files small and their
  git diffs clean. The newest 200 versions of each diagram stay; deleting a diagram deletes them.
- `src/store/versions.ts` records a version after each save of the editor session, also when the
  write to storage fails, so the history keeps work that storage could not. Saves that change only
  the viewport or measured sizes make no version. User edits join the newest version for five
  minutes after its first edit, so the list stays short; finer steps are what undo is for.
- An agent call and a restore each make their own version. They run their change and its save
  inside `asVersionAuthor`, which names the author (and the tool title or the restored time) for
  the version that the save records. Any other save counts as an edit by the user, also one that
  happens while an agent call waits for a layout.
- The store keeps the version records of the open diagram in memory, so a save writes one record
  and its content and reads nothing.
- When the editor opens a diagram, the history compares it with the newest version. A diagram
  that the history has not seen gets a "First opened" version; a diagram that changed outside the
  editor (another tab, git, a file sync) gets a "Changed outside the editor" version. People can
  always go back to the state before a session.
- The summary of a version (`describeChange`) compares it with the version before it: added,
  removed, changed and moved nodes by name (counts above three), connections and flows by count,
  renames and style changes.
- Selecting a version covers the editor canvas with a separate read-only React Flow instance that
  starts at the editor viewport, so people compare the same area at two times. While a version
  shows, the editor canvas, the flow panel and the editing controls of the top bar are `inert`, the
  editor canvas is read-only (React Flow listens for the Delete key on the whole document), the
  editor engine pauses, and the window key and clipboard handlers do nothing. A new version from
  any source, such as an agent call, ends the preview, because the diagram under it changed.
  Restore replaces the content as one undo step (`restoreContent`) and saves at once.

### Export

Export renders a second, read-only React Flow instance at a fixed size (the export stage) with its
own engine in manual mode. For each video frame the exporter sets the time, waits for the React
commit, captures the stage with snapdom and passes the canvas to mediabunny or modern-gif. The
result does not depend on the frame rate of the browser.

CSS transitions are off on the export stage (`data-export`), because a transition runs on
wall-clock time and the captured frame would show it part way.

The canvas grid is off in exports unless the user turns it on: it is an editing aid. The animation
tab captures five frames from the export stage as a preview strip, so the preview shows the real
camera path and framing.

## Desktop app

The desktop app is the same React app in an Electron window. It adds file storage, agent control,
the handoff from the website, and updates from GitHub Releases.

### Processes

- The main process (`electron/`) owns the window, the diagram files and the agent server. It never
  touches the DOM.
- The preload script puts a small typed API on `window.desktop` (`src/desktop/contract.ts`). The
  renderer runs sandboxed with context isolation and never imports `electron`.
- In production the renderer loads from `app://diagrams` with a content security policy. In
  development it loads the Vite dev server, so hot reload works in the window.
- Requests from main to the renderer go through one correlated RPC with timeouts and cancellation
  (`electron/renderer-rpc.ts`).
- Node gives `new URL('app://diagrams/').origin` as the string "null", so origin checks compare the
  scheme and the host (`originOf`).

### Window

- The window has no system frame. The header of each page is the title bar. On Windows and Linux
  the system buttons draw as an overlay in the header colour; on macOS the traffic lights sit in the
  header. Headers keep clear of the buttons with the `titlebar-area` CSS variables.
- A fixed drag strip covers the top 44 px of every page, so pages without a header still move.
  Interactive elements and dialogs are excluded from dragging.
- Back and forward work with buttons, Alt with the arrow keys (Command with the brackets on macOS)
  and the mouse side buttons, because the app has no browser buttons.
- The app icon comes from `build/icon.svg`; `pnpm app-icon` renders `build/icon.png` (1024 px) and
  `build/icon.ico` (16 to 256 px). An app without a package shows them on the window and, on macOS,
  in the dock, because Electron otherwise shows its own icon. A package takes its icon from the
  executable or the bundle.
- The window saves its position, size and maximized state. It opens on a connected screen and
  shrinks to fit when the saved screen is gone.

### Storage

- The renderer keeps every diagram in memory (`cached-repository.ts`), so reads stay synchronous
  and the existing order "save, navigate, load" keeps working. Writes go to the main process in the
  background.
- Main writes each file atomically: a temporary file, then a rename. Windows antivirus and OneDrive
  can hold a file for a moment, so the rename retries.
- A folder watcher reports changes from other programs. What the app knows of each file (content
  digest, size and change time) separates them from the writes of the app; a file with the known
  size and change time counts as unchanged without a read. A rescan runs when the window gets the
  focus. That knowledge changes only after a write or remove succeeds, so a failed write never
  makes the old content look like an outside change, and a check that overlaps a write of the app
  counts for nothing.
- Every repository reports the end of each save and remove as an event (`saved`, `save-failed`,
  `removed`, `remove-failed`): the browser at once, the desktop after the write. One listener for
  the whole app (`watchSaveOutcomes`) shows a run of failed saves once, and again only after a save
  reaches storage, and shows each failed remove. The library list refreshes from the same events.
- The editor session (`openDiagramSession` in `src/store/document.ts`) owns the saves of the open
  diagram: the 400 ms delay, the save when the page hides, and `flushPendingSave`. A save writes
  nothing when the content is as the last save left it, for example after a selection change.
  Deleting a diagram closes its session without the due save, so the save when the editor closes
  cannot write the file again.
- If the diagrams folder cannot be read at start, the window shows the reason and a "Try again"
  button, and agent calls fail at once with that reason.
- A `changed` event for the open diagram means that another tab or another program changed it, so
  the editor offers "Load newer". If the diagram is gone from storage, the editor says so instead;
  the diagram stays open, and the next change saves it again. The `rev` of a diagram stays its own
  save counter.
- Before the window closes, it saves the open diagram and waits for the writes in the queue. The
  time limit of that save also covers the wait for the renderer to start, so a renderer that
  crashed delays the close by at most 3 seconds.
- Electron cancels a quit when a window prevents its close, so after the save the window starts
  the quit again. The agent server and the folder watcher stop on `will-quit`, when the quit is
  sure; on macOS, a window closed without a quit keeps both running.

### Agent tools

- The MCP server runs in the main process on `127.0.0.1:27419`. Each tool call goes to the renderer,
  because layout (ELK worker), Mermaid import, the icon catalogue and rendering need the browser.
- Tool definitions (`src/agent/tool-definitions.ts`) are shared by main and the renderer and have
  no DOM code. A missing handler fails the type check.
- Calls run one after another in the renderer (`runAgentTool`), which owns their time limits. The
  limit of a call starts when the call leaves the queue. At the limit the call answers with an
  error, and the next call waits until the handler really ends, so that it does not spend its own
  limit on the earlier call. A call that the client cancels while it waits never starts. The main
  process keeps only a long safety limit for a window that stops answering.
- Each call that changes a diagram opens it in the editor, so the user sees the change, and commits
  it as one undo step (`oneStep`) that saves at once. Just before the commit, `commitEdit` checks
  that the call is not cancelled and that the editor still shows the diagram. Otherwise the tool
  makes no change and says why, because a change to a diagram that no editor shows would not save.
- A tool that saves, removes or changes a diagram waits until the write reaches storage
  (`untilStored`): at once in the browser, after the file write on the desktop. A failed write
  becomes a tool error, so the agent can tell the user; the change stays in the editor. The
  handoff from the website waits the same way before it answers.
- `layout_diagram` and Tidy up lay out a copy in the worker, then apply the positions, group sizes
  and routes to the diagram as it is then (`applyLayoutResult`). Changes made meanwhile stay.
- The groups that get new nodes grow around their children when the change commits
  (`fitGroupsToChildren`), from the diagram as it is then. Everything in a group keeps its place on
  the canvas, also when the group grows to the left or up and its origin moves.
- One group padding (`GROUP_PADDING_PX` in `src/model/graph.ts`: 56 px at the top for the label, 32 px
  on the other sides) serves the layout, agent placement and grouping in the editor.
- Agents name nodes by id, by a ref from the same call, or by a unique label. An unknown or
  ambiguous name returns an error that lists the candidates.
- New nodes without a position go through ELK as a block, then next to the node they connect to,
  to the right of the content, or in a new row inside their group. Positions that an agent gives
  stay exact.
- `render_image` mounts a separate export stage. The stage applies its own node measurements,
  because the nodes of a diagram that just opened have no measured size yet.

### Security

- `/mcp` accepts only the loopback host name, no browser Origin, and a bearer token from the user
  data folder. The "Connect an agent" dialog shows the token and can reset it.
- `/handoff/:code` accepts only the website origin (and the dev server in development), and only a
  code that arrived through a deep link in the last 60 seconds, once.
- The renderer may ask only for clipboard writes and full screen. Handed-over diagrams always
  become new diagrams.

### Packaging and updates

- electron-builder (`electron-builder.ts`) makes an NSIS installer for Windows, a dmg and a zip for
  each Mac architecture, and an AppImage and a deb for Linux. Vite bundles every dependency of the
  main process, so the package holds only `dist/` and three files of `dist-electron/`, without
  `node_modules`.
- The Electron fuses turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, the inspect flags and extra
  `file://` rights, and load the app only from its checked asar archive.
- A `v*` tag starts `.github/workflows/release.yml`, and the tag gives the version of the build
  (`-c.extraMetadata.version`), so a release needs no commit. `pnpm release:tag` works out the next
  tag. One job creates a draft release, because
  parallel jobs of electron-builder could each create their own. Each platform job then packages,
  starts the packaged app and drives it through the agent server (`scripts/smoke-package.mjs`), and
  uploads its files. The maintainer publishes the draft. `docs/RELEASING.md` has the steps.
- A tag such as `v0.2.0-beta.1` is a preview. It builds with the version of the tag, in the `preview`
  environment without approval, and publishes itself as a GitHub pre-release. electron-updater
  reads `/releases/latest`, which never returns a pre-release, for an app with a normal version.
  For an app with a beta or alpha version it takes the newest release of the same or a more stable
  channel. electron-builder writes only `latest*.yml` for GitHub, so no channel files are needed.
- electron-updater reads the published releases of the public repository, so the app needs no
  token. `electron/updates.ts` picks a policy for each build:
  - Windows, a signed Mac build and an AppImage download an update and install it on quit, or at
    once on Restart.
  - A deb or other Linux package installs only on Restart, because the install asks for a password.
  - macOS installs an update only into an app with a Developer ID signature. Until the build has a
    certificate, the app only says that a version is out and links to it (`macSigned` in the
    packaged `package.json`).
  - A build from source, or a package without `app-update.yml`, does not update itself.
- The download button on the website asks the GitHub API for the latest release and links the
  installer for the system of the visitor (client hints, then the user agent). Safari and Firefox
  report an Intel Mac also on Apple silicon, so a Mac without the architecture hint, other systems
  and a failed lookup open the release page instead. The link accepts only files from the releases
  of this repository.
- Before Restart installs an update, main saves the open diagram and waits for the writes
  (`prepareQuit`), because the quit for an update closes the windows without the usual close step
  on macOS.
- Signing is off until the release environment has the secrets. Without a Mac certificate the app
  gets an ad-hoc signature, which Apple Silicon needs after the fuses change the binary. Windows
  checks the publisher of an update only after a signed release.

### Handoff from the website

"Open in desktop app" on the website opens `diagrams://receive?code=...`, which starts the app or
passes the link to the running app. The website then posts the diagram to the loopback server and
tries again for 15 seconds while the app starts. Chrome asks once before a website reaches the
local device.

### Skills

`claude-plugin/` holds the skills and the Claude Code plugin manifest. The main process bundles it
and offers the same text in four ways:

- the server instructions, which point to the skills (Claude Code shows 4,096 characters);
- `skill://diagrams/<skill>/<file>` resources, in the file layout of the MCP skills extension;
- the prompts `draw-architecture`, `animate-flow` and `review-diagram`;
- a local plugin marketplace in the user data folder, written at start with the app version, for
  `claude plugin install`.

The `skills/list` and `skills/get` methods of the MCP skills extension (SEP-2640) wait until
ViteMCP can declare extensions. Tests fail when a skill names a tool or an icon that does not exist.

## Third-party licences

`scripts/third-party-licenses.ts` is a Vite plugin. It collects the package of every module in
the web build and its worker builds, and writes `third-party-licenses.txt` with the licence text of
each package. The main build of the desktop app writes `third-party-licenses.main.txt`. The fonts
(OFL), elkjs (EPL) and mediabunny (MPL) need their licence or a source statement in each copy, and
a list kept by hand drifts from the lockfile.

`THIRD-PARTY-NOTICES.md` covers the icons and logos, which are data and not packages. A test
checks that it lists every bundled Simple Icons logo that has its own licence.

## Limits

- `localStorage` holds about 5 MB per site. Versions in IndexedDB do not count against it. The desktop app has no such limit. A typical diagram uses 20 to 80 KB. When storage is
  full, the app keeps the diagram in memory and asks the user to export JSON.
- SVG export embeds HTML in `foreignObject`. Browsers show it correctly; design tools can show it
  as one image.
- Performance budget: about 150 nodes, 200 edges and 600 particles at 60 fps.
