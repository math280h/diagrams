---
name: Diagrams
description: Architecture diagrams that play a request through the system, hop by hop.
colors:
  signal: '#226cff'
  signal-ink: '#ffffff'
  ground: '#000000'
  chrome: '#0a0a0a'
  raised: '#141414'
  node-fill: '#1f1f1f'
  node-fill-active: '#292929'
  hairline: '#232323'
  node-line: '#2e2e2e'
  line-strong: '#5a5a5a'
  edge: '#5e5e5e'
  edge-strong: '#8f8f8f'
  grid-dot: '#1c1c1c'
  grid-dot-active: '#3a3a3a'
  grid-line: 'rgb(255 255 255 / 0.05)'
  canvas-raised: '#2b2b2b'
  line-dim: '#161616'
  particle: '#b0b0b0'
  text: '#fafafa'
  muted: '#a0a0a0'
  faint: '#7a7a7a'
  primary-hover: '#dcdcdc'
  ok: '#56d57b'
  warn: '#f7b83d'
  error: '#fc5855'
  wire-http: '#808f31'
  wire-rpc: '#009b97'
  wire-data: '#9076be'
  wire-messaging: '#b7698f'
  wire-text-http: '#bcd060'
  wire-text-rpc: '#3dcfcb'
  wire-text-data: '#c3a5f9'
  wire-text-messaging: '#f197c2'
  wire-ink: '#000000'
  zone-orange: '#f49752'
  zone-yellow: '#d3ac41'
  zone-green: '#68ca80'
  zone-teal: '#47c7c7'
  zone-blue: '#7cbbdb'
  zone-pink: '#f38abe'
  zone-red: '#fe8b83'
  ground-light: '#ffffff'
  chrome-light: '#ffffff'
  raised-light: '#f6f6f6'
  node-fill-light: '#f3f3f3'
  node-fill-active-light: '#e9e9e9'
  hairline-light: '#e6e6e6'
  node-line-light: '#dadada'
  line-strong-light: '#9a9a9a'
  edge-light: '#8c8c8c'
  edge-strong-light: '#555555'
  grid-dot-light: '#e4e4e4'
  grid-dot-active-light: '#b8b8b8'
  grid-line-light: 'rgb(0 0 0 / 0.06)'
  canvas-raised-light: '#e6e6e6'
  line-dim-light: '#efefef'
  particle-light: '#555555'
  text-light: '#0a0a0a'
  muted-light: '#5e5e5e'
  faint-light: '#767676'
  primary-hover-light: '#2e2e2e'
  ok-light: '#0a7e3a'
  warn-light: '#a16100'
  error-light: '#cc2827'
  wire-http-light: '#748410'
  wire-rpc-light: '#009e9a'
  wire-data-light: '#9372c8'
  wire-messaging-light: '#bf6291'
  wire-text-http-light: '#586600'
  wire-text-rpc-light: '#007b79'
  wire-text-data-light: '#724aab'
  wire-text-messaging-light: '#9e366f'
  wire-ink-light: '#ffffff'
  zone-orange-light: '#aa4d00'
  zone-yellow-light: '#8f6c00'
  zone-green-light: '#008238'
  zone-teal-light: '#008486'
  zone-blue-light: '#297497'
  zone-pink-light: '#a84078'
  zone-red-light: '#b2403d'
typography:
  display:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '48px'
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: '-0.03em'
  headline:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 500
    lineHeight: '32px'
    letterSpacing: '-0.02em'
  title:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '20px'
    fontWeight: 500
    lineHeight: '28px'
    letterSpacing: '-0.015em'
  card-name:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 500
    lineHeight: '22px'
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: '20px'
  caption:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: '22px'
  node-title:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 500
    lineHeight: '18px'
    letterSpacing: '-0.005em'
  label:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: '16px'
  canvas-text-lg:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '20px'
    fontWeight: 500
    lineHeight: '26px'
    letterSpacing: '-0.015em'
  canvas-text-xl:
    fontFamily: 'Host Grotesk Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '28px'
    fontWeight: 500
    lineHeight: '32px'
    letterSpacing: '-0.03em'
  mono:
    fontFamily: 'Fragment Mono, ui-monospace, monospace'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: '16px'
    fontFeature: "'zero', 'tnum'"
  mono-label:
    fontFamily: 'Fragment Mono, ui-monospace, monospace'
    fontSize: '11px'
    fontWeight: 400
    lineHeight: '16px'
    fontFeature: "'zero', 'tnum'"
rounded:
  status: '1px'
  handle: '2px'
  edge-label: '3px'
  badge: '4px'
  token-chip: '5px'
  node: '6px'
  control: '8px'
  card: '12px'
  stage: '16px'
  runtime: '16px'
  queue: '14px'
  function: '28px'
  pill: '999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
components:
  button-primary:
    backgroundColor: '{colors.text}'
    textColor: '{colors.ground}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '32px'
  button-primary-hover:
    backgroundColor: '{colors.primary-hover}'
    textColor: '{colors.ground}'
  button-secondary:
    backgroundColor: '{colors.node-fill}'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '28px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 10px'
    height: '32px'
  input-field:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '4px 10px'
    height: '32px'
  top-bar:
    backgroundColor: '{colors.chrome}'
    textColor: '{colors.text}'
    height: '44px'
    padding: '0 6px'
  library-card:
    backgroundColor: '{colors.chrome}'
    textColor: '{colors.text}'
    typography: '{typography.card-name}'
    rounded: '{rounded.card}'
    padding: '12px 16px'
  featured-stage:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.text}'
    rounded: '{rounded.stage}'
    height: 'clamp(420px, 62vh, 620px)'
  log-row:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.mono}'
    height: '24px'
    padding: '0 12px'
  log-row-active:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.text}'
  node-card:
    backgroundColor: '{colors.node-fill}'
    textColor: '{colors.text}'
    typography: '{typography.node-title}'
    rounded: '{rounded.node}'
    padding: '10px 12px 11px'
  node-card-active:
    backgroundColor: '{colors.node-fill-active}'
    textColor: '{colors.text}'
  node-card-idle:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.faint}'
  edge-label:
    backgroundColor: '{colors.ground}'
    textColor: '{colors.muted}'
    typography: '{typography.mono-label}'
    rounded: '{rounded.edge-label}'
    padding: '0 4px'
  token-chip:
    backgroundColor: '{colors.signal}'
    textColor: '{colors.signal-ink}'
    typography: '{typography.mono-label}'
    rounded: '{rounded.token-chip}'
    padding: '2px 7px'
  caption-strip:
    backgroundColor: '{colors.chrome}'
    textColor: '{colors.text}'
    typography: '{typography.caption}'
    padding: '13px 20px'
    height: '48px'
  caption-step:
    backgroundColor: '{colors.signal}'
    textColor: '{colors.signal-ink}'
    typography: '{typography.mono}'
    rounded: '{rounded.badge}'
    padding: '0 6px'
---

# Design System: Diagrams

## Overview

**Creative North Star: "The Signal on Black"**

The app is black and white, and one blue signal moves through it. The ground is pure black (pure white in light), the docked chrome sits one step above it, and nodes are filled silhouettes that separate from the ground by their fill, not by their outline. Everything structural is a grey. The signal blue marks the walkthrough, keyboard focus and the token in the mark; when a request crosses a wire with a known protocol, the wire and the token take that protocol's colour instead.

The product is shown working. The library opens on a live canvas that plays a flow in a loop, template cards are read-only live canvases, and a flow reads as structured log lines in the pane under the canvas. Edges route at right angles with rounded corners. Motion is camera and token motion along the diagram, and it stops for people who ask for reduced motion.

Type is one grotesque, Host Grotesk, at weights 400 and 500, with tighter tracking as sizes grow. Fragment Mono is kept for values people copy: hosts, paths, address ranges, offsets, events and edge labels. Interface text is sentence case.

**Key Characteristics:**

- Black and white neutrals; one signal blue; four protocol hues only on wires.
- Nodes separate by fill; outlines are quiet hairlines.
- Right-angled rounded edge routing by default.
- Docked chrome on a 44 px bar; panels on demand.
- Live, read-only canvases as previews; never static wireframes.
- Status colours appear only on levels and statuses.
- Boundary tier is told by line pattern first, hue second.

## Colors

A black, grey and white ramp carries all structure; one signal blue and four protocol hues carry motion and traffic; three state colours carry levels; seven boundary hues name boundary kinds and the groups that people mark on nodes.

### Primary

- **Signal Blue** (signal): the walkthrough on edges without a protocol, the token dot and chip before the first protocol hop, the active node ring (border plus a 1 px ring), the active and hovered boundary outline at 2 px, the active log dot, the caption step badge, the flow dot in the library stage header, the focus outline, the caret, the text selection tint (34% mix) and the token in the app mark and favicon. Text on it uses Signal Ink.
- **Signal Ink** (signal-ink): white text on Signal Blue in both themes.

### Secondary

The protocol palette. Each protocol has a wire value (line, arrowhead) and a brighter text value (label, traffic, visited and active stroke, token), with a light-theme counterpart (`-light` keys). An edge's `protocol` field is HTTP, RPC, database or messaging; `auto` reads it from the label. The diagram switch "protocol colours" turns the palette off and every wire falls back to the neutral edge grey.

- **Lime** (wire-http, wire-text-http): HTTP, REST, GraphQL, WebSocket, OAuth.
- **Teal** (wire-rpc, wire-text-rpc): gRPC, tRPC, Thrift, SOAP.
- **Violet** (wire-data, wire-text-data): SQL, queries, caches, replication.
- **Pink** (wire-messaging, wire-text-messaging): publish, consume, queues, streams, events.
- **Wire Ink** (wire-ink): the text on a protocol-coloured token chip; black in dark, white in light.

### Tertiary

- **State colours** (ok, warn, error): ok and warn status markers, warn and error event levels in the log and the caption, destructive actions. Info-level events are plain text colour.
- **Boundary palette** (zone-orange, zone-yellow, zone-green, zone-teal, zone-blue, zone-pink, zone-red): boundary outlines, label icons and kind tags. A kind sets its default hue; the user can pick another or Neutral (Strong Line). Cards and shapes take the same hues when the user gives them a colour, so a team can have one hue on its boundary and on its nodes. Zone Blue is a pale steel, not a saturated blue, so it never reads as the signal.

### Neutral

- **Ground** (ground): the page and canvas floor, the knockout behind edge labels, boundary labels, tokens and ports, the fill of external and idle nodes, the featured stage.
- **Chrome** (chrome): top bar, log pane, properties panel, library cards, caption strip.
- **Raised** (raised): popovers and menus, the active log row.
- **Node Fill** (node-fill): card and shape fill; also the secondary button fill.
- **Node Fill Active** (node-fill-active): an active or hovered node.
- **Hairline** (hairline): every 1 px border and divider in the app chrome.
- **Node Line** (node-line): node outlines, idle edges in a flow, input borders.
- **Strong Line** (line-strong): dashed external outlines, neutral boundary outlines, handle borders, queue ribs.
- **Edge** (edge) and **Edge Strong** (edge-strong): the default edge stroke and its arrowheads, meter fill and ports.
- **Grid Dot** (grid-dot) and **Grid Dot Active** (grid-dot-active): the quiet canvas dot grid; it brightens while a node is dragged. **Grid Line** (grid-line) draws the Lines background.
- **Canvas Raised** (canvas-raised): datastore caps, the client title strip, queue end caps, badges and the meter track. It is lighter than Raised because it sits on Node Fill.
- **Dim Line** (line-dim): the outline of an idle node in a flow.
- **Particle** (particle): traffic particles on edges.
- **Text** (text): primary text, the primary button fill, the dashed selection outline.
- **Muted** (muted): secondary text, node detail lines, edge labels, pending log lines, icons.
- **Faint** (faint): idle node text in a flow, least important metadata.

### Named Rules

**The One Signal Rule.** Signal Blue means the walkthrough or the keyboard. No button, link, badge, chart, node kind or boundary style uses it, and neither the boundary nor the protocol palette has a saturated blue.

**The Protocol Owns the Wire Rule.** A protocol hue colours only its wire: line, arrowhead, traffic, label, and the token while it is on or has just left that wire. Visited and active edges draw at 2 px in the protocol text colour. HTTP is lime, never amber, so it is never read as the warn level.

**The State Only Rule.** Ok, warn and error appear only where something has a level or a status. They never decorate and never tell node kinds apart.

**The Two Themes, One Structure Rule.** Each dark token has a light counterpart with the same role; light mirrors dark on white.

## Typography

**Display Font:** Host Grotesk Variable (with ui-sans-serif, system-ui)
**Body Font:** Host Grotesk Variable (with ui-sans-serif, system-ui)
**Label/Mono Font:** Fragment Mono (with ui-monospace), slashed zero and tabular figures

**Character:** A plain contemporary grotesque at two weights, tightened as it grows, with a narrow mono for anything a person would select and paste.

Diagram canvases default to the `host` pair. A diagram may switch its canvas pair to Atkinson Hyperlegible, Inter with JetBrains Mono, or IBM Plex; the app chrome stays on Host Grotesk.

### Hierarchy

- **Display** (500, 48px, 36px below 640px, 1.04, -0.03em, balanced wrap): the first-run library headline only.
- **Headline** (500, 24px, -0.02em): "Your diagrams" on the returning library.
- **Title** (500, 20px, -0.015em): library section headings.
- **Card name** (500, 15px, -0.01em): library card names and the wordmark (-0.02em).
- **Body** (400 to 500, 14px, 20px line): buttons, menus, panel text. Support copy under the display sets 16px muted.
- **Caption** (400, 15px, 22px line): the caption strip; pretty wrap, at most 72px tall.
- **Node title** (500, 13px, 18px line): card titles and shape labels on the canvas.
- **Label** (400, 12px to 13px): field labels, card meta lines, log element and caption columns (13px sans).
- **Canvas text lg and xl** (500, 20/26 at -0.015em and 28/32 at -0.03em): diagram titles and notes on the canvas. Small and medium text nodes are 12/17 and 14/21 at 400.
- **Mono** (400, 12px): log rows, offsets, latencies, caption step and event.
- **Mono label** (400, 11px to 11.5px): edge labels, token chip, card badges, meter text, boundary detail, identifier card lines.

### Named Rules

**The Copyable Value Rule.** Hosts, paths, address ranges, ports, offsets, events and edge labels are set in Fragment Mono. A card detail line is mono only when it reads as an identifier (no spaces and a non-letter, a path, or a port); prose lines such as "Go, 3 replicas" stay in sans.

**The Tight From Twenty Rule.** From 20px up, text sets at weight 500 with negative tracking (-0.015em at 20px, -0.03em at 28px and above). Nothing goes above 500.

**The Sentence Case Rule.** All interface text is sentence case in plain words. No uppercase labels and no letter-spaced headings.

## Layout

- **Top bar:** 44px, chrome fill, hairline below, 6px side padding in the editor and Present, 12px in the library. Library: mark, wordmark, the agent button (desktop app only), a GitHub link, theme, Import (ghost), New diagram (primary).
- **Library, first run:** a centred column up to 1152px. The display headline and one line of support, then a full-width stage (clamp 420px to 620px tall, 16px corners) where the Order system flow plays in a loop with its caption strip, then the other four templates as live cards, two in a row from 640px.
- **Library, returning:** the agent introduction, "Your diagrams" with a count and a 256px search, a 1, 2 or 3 column card grid, a storage line, then the live template cards (1, 2 or 3 columns) under a "Templates" title with the same hint as the first run. Grid gaps are 16px. On the first run the agent introduction sits between the support line and the templates.
- **Previews:** read-only canvases at 16:10, with the grid off. Cards fit the whole diagram with 16px padding at any zoom, so nothing is cropped. The stage and the template page use `readableViewport`: the whole diagram if it fits at zoom 0.5, else a crop around the node with the most connections and its neighbours. A card plays its first flow on hover or focus.
- **Editor:** the canvas fills everything under the bar. The log pane docks under the canvas when Flows is open: a transport row, a sticky 28px column header and 24px rows. Floating chrome on the canvas (zoom, hints, the selection tools) uses the chrome fill, a hairline and 8px corners, inset 12px.
- **Present:** the canvas fills the screen. The top bar docks to the top and fades out after idle while playing; the caption strip docks to the bottom. Playback starts after 700ms unless the user prefers reduced motion. Previous and Next (and the arrow keys) move one step at a time, also onto connection steps, where the paused token shows partway along the connection; "Step n of N" sits beside the scrubber from 640px.

Spacing runs on a 4px step: 4px between toolbar items, 8px and 12px inside panels and cards, 16px grid gaps and card side padding, 24px page side padding from 640px.

### Motion

The flow camera moves in windows (1000ms for position, 1600ms for zoom), never more than a 1.35 zoom ratio per step, and stays inside the diagram bounds plus 48px. With reduced motion the camera cuts to each step and the library stage waits for a Play button. Between edges at different points of one node, the token travels along the node outline. After manual pan or zoom, the camera hands back over 700ms. Node drops glide to the 16px grid in 140ms; colour changes ease over 160ms to 200ms.

## Elevation & Depth

The system is flat. Depth is tone: ground, chrome, raised, node fill. Docked panels and canvas nodes have no shadow, and canvas nodes never use backdrop-filter.

### Shadow Vocabulary

- **Menu lift** (`box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.45)` on the insert menu; the shadcn popovers and menus use a medium shadow with a 1px ring at 10% text colour): floating menus, popovers and dialogs only. The only ambient shadow.
- **Knockout ring** (`box-shadow: 0 0 0 2px <ground>`): token dots, token chips and ports, so they cut cleanly through lines. A ring, not a shadow.
- **Active ring** (`box-shadow: 0 0 0 1px <signal>`): doubles the border of an active or hovered node. A ring, not a shadow.

### Named Rules

**The Fill Not Outline Rule.** A node separates from the ground by its fill. Its outline is a quiet hairline and never carries the separation alone.

**The Tone Not Opacity Rule.** An element the flow has not reached recedes to the ground fill, a dim outline and faint text; official icons turn grey. It does not fade.

**The One Focus Rule.** Keyboard focus is one 2px Signal Blue outline offset 2px (6px on canvas nodes). Text fields show focus by turning their border Signal Blue.

## Shapes

Corners grow with the size of the object: 1px status squares, 2px handles, 3px edge-label knockouts, 4px badges and the caption step, 5px token chip, 6px cards, 8px buttons, inputs, menus and floating chrome (the `0.5rem` radius token), 12px library cards and dialogs, 16px the featured stage and runtime boundaries.

Node kind is a silhouette:

- **Service:** a 6px rectangle.
- **Datastore:** a cylinder with a raised elliptical cap of 9px.
- **Queue or stream:** a capsule (14px / 50%) with ruled ribs and a raised end cap.
- **Client:** a rectangle with a 6px raised title strip.
- **External system:** a dashed Strong Line outline on the ground fill.
- **Function:** a 28px pill.

Status markers differ by shape as well as colour: ok is a square, warn a diamond, error a circle.

Boundaries are SVG outlines with the label knocked out of the top edge. The line pattern tells the tier: scope solid 1.25px at 6px corners; runtime solid 1.25px at 16px corners, filled with the ground and the grid; logical dashed 8 5; location 16 6; zone round dots 2px at 5px pitch; network dash-dot 14 4 2 4; subnet 4 3; security 10 3 2 3 2 3 at 1.25px; custom dashed 6 4, solid or none. Other boundaries use 8px corners. A tinted area is a 5% wash of the hue (4% in light).

The app mark is a 6px-cornered square in text colour with a right-angled rounded wire in ground colour and a Signal Blue token at its start.

## Components

### Buttons

Quiet and compact.

- **Shape:** 8px corners, 32px tall (28px small, 24px extra small), 10px side padding, 14px medium text, 16px icons.
- **Primary:** text-colour fill with ground text (white on black in dark, black on white in light); hover steps one grey. At most one per bar: New diagram, Export.
- **Secondary:** Node Fill with text colour; used for "Open" on the library stage.
- **Ghost:** transparent, muted fill on hover and while a menu is open. Most bar actions.
- **Destructive:** error text on a 10% to 20% error tint.
- **Focus:** the One Focus Rule.

### Inputs / Fields

- **Style:** transparent fill (30% input grey in dark), 1px Node Line border, 8px corners, 32px tall, 10px side padding.
- **Focus:** the border turns Signal Blue; the caret is Signal Blue. No outer ring.
- **Error / Disabled:** error border with a 3px error ring at 20%; disabled at 50% opacity.

### Cards / Containers

- **Library card:** chrome fill, hairline, 12px corners, a 16:10 live preview over a hairline, then the name (card name type) and a 13px muted meta line with tabular figures. The meta line leaves out the flow count when there are no flows. Hover and focus raise the border to 25% text colour.
- **Agent introduction:** chrome fill, hairline, 12px corners, 16px by 20px padding; a card-name title "Let an AI agent draw with you", one 13px muted line with an example request, a secondary action and a ghost close button in the top right. In the desktop app the action opens the agent setup, and the strip shows until the first agent call; the bar's agent button then shows its "Connect an agent" label. On the website the action is "Download for Windows" (or macOS or Linux), which starts the installer of the latest release, next to a 13px muted "All downloads" link; when the system is unknown it is "Get the desktop app" and opens the release page. The strip does not show on phones. Closing it hides it permanently.
- **Featured stage:** ground fill, hairline, 16px corners; a 48px chrome header with the template name, a Signal Blue dot and the flow name, and a small secondary button "Open {template name}" with an arrow; the live canvas with its caption strip fills the rest.
- **Dialogs:** popover fill, 12px corners, 16px padding, a 1px ring at 10% text colour.

### Navigation

The top bar is the navigation. The mark returns to the library. On phones labels drop and icons stay.

### Version history

- **Panel:** takes the place of the properties panel on the right (288px, chrome fill, hairline left; a bottom sheet at 55% height below 768px). A 40px header "Version history" with a close button, a listbox of versions, and a 12px muted footer that says where versions stay and how many.
- **Row:** 8px corners, 8px by 10px padding; a 16px muted icon for the author (pen for you, robot for an agent, rotate for a restore, file plus for the first state, file diff for a change outside the editor), the author at 13px medium, the time at 12px muted with tabular figures, then the summary at 12px muted, at most two lines. The first row is "Current version". Day headings ("Today", "Yesterday", a date) at 12px muted. The selected row takes the accent fill; arrow keys, Home and End move the selection.
- **Preview:** the selected version covers the canvas as a read-only canvas at the same viewport. A floating chrome bar at the top centre names the author and the time, with "Restore this version" (primary) and "Back to current" (ghost). Esc returns to the current diagram.

### Log row (signature)

- 24px row, 12px side padding, mono 12px with tabular figures; element and caption in 13px sans; the caption column hides below 1024px.
- **Played:** a filled muted dot.
- **Active:** Raised row, a 9px Signal Blue dot, caption in text colour.
- **Pending or skipped:** muted text and a hollow faint dot.
- **Levels:** warn and error colour the event; info stays text colour.
- **Selected:** a 1px dashed text-colour outline.

### Node card (signature)

- Node Fill, 1px Node Line outline, 6px corners, 10px 12px 11px padding, at least 120px wide.
- A 14px muted line icon (16px for official cloud icons, in their own colours), the node title, then optional muted detail lines; `{braces}` lift a word to text colour.
- **Zoomed out:** an icon keeps at least 10px on screen. It grows around its centre, up to 36px, and the title moves right to make space. The card keeps its size.
- **Active or hovered:** Node Fill Active, Signal Blue border plus a 1px Signal Blue ring.
- **Idle in a flow:** ground fill, dim outline, faint text, grey icons.
- **Selected:** a 1px dashed text-colour outline offset 4px; 8px handles with 2px corners appear on hover.
- **Coloured:** neutral by default. A hue from the boundary palette mixes 12% into Node Fill (8% in light) and 50% into the outline (45% in light); caps mix 18% into Canvas Raised. The line icon and the meter fill take the hue; the title stays in text colour. External cards mix 6% into the ground. Active, hovered and idle states replace the colour. Shapes use the same mixes, and a Line shape draws its outline in the full hue.

### Edges and labels

- Right-angled rounded routing (`smooth`) by default, 1.25px round-capped stroke in Edge grey or the protocol wire colour; dashed 5 4 and dotted variants.
- Labels are 11px mono knockouts on the ground, 4px side padding, in muted or the protocol text colour.
- Visited and active edges draw 2px in the protocol text colour, or Signal Blue without a protocol. Idle edges in a flow recede to Node Line.
- A label hides while the token passes over it.

### Walkthrough token (signature)

A 10px dot, or an 11px mono chip with 5px corners and 2px 7px padding, ringed in ground colour. It is Signal Blue until the first protocol hop, then takes the protocol text colour of its current or last hop, with Wire Ink text. The chip lifts above a node while the token rests on it and fades near edge ends.

### Boundary (signature)

A group is a boundary with a kind: AWS, Azure, Google Cloud, Kubernetes, general kinds (system boundary, environment, trust boundary, data center, on-premises, team, application) or a custom group.

- **Line per tier** (SVG stroke in the boundary hue, 1px unless noted):
  - Scope (organisation, account, subscription, project, tenant, system): solid, 1.25px, 6px corners.
  - Runtime (cluster, node pool, Auto Scaling group, application): solid, 1.25px, 16px corners. Runtime boundaries fill with the ground colour, repeat the canvas grid and cover the lines of the boundaries under them.
  - Logical (resource group, namespace, environment, team): dashed 8 5.
  - Location (region, data center, on-premises): long dash 16 6.
  - Zone (availability zone): round dots, 2px, 5px pitch.
  - Network (VPC, virtual network): dash-dot 14 4 2 4.
  - Subnet: short dash 4 3.
  - Security (security group, trust boundary): dash-dot-dot 10 3 2 3 2 3, 1.25px.
  - Custom: dashed 6 4, solid or none, chosen in the Line field. Other tiers use 8px corners.
- **Tinted area:** a 5% wash of the hue (4% in light). On by default for scope, network, subnet, runtime and custom; off for the others.
- **Label:** knocked out of the top edge on the ground colour, 12px from the left, 6px side padding, 6px gaps. Order: a 12px line icon in the hue (or a 14px official group icon or logo), the kind tag in the hue at 500, the name in text colour at 500, then an optional mono detail in muted text ("10.0.0.0/16", "eu-west-1"). A custom group has no kind tag. While its name is empty, the editor shows the placeholder "Group"; previews and exports show no name.
- **Zoomed out:** the label icon keeps at least 10px on screen, up to 30px, as on cards.
- **Kind tag text:** the provider prefix (AWS, Azure, GCP, Kubernetes) and the kind name in sentence case; acronyms and proper names keep their case ("AWS VPC", "AWS Auto Scaling group").
- **Colours off:** every outline uses Strong Line; kind tags and icons use muted text. Line patterns stay.
- **Selected:** the 1px dashed text-colour outline offset 4px, as for nodes.
- **Active in a flow or hovered from the log:** the outline turns Signal Blue at 2px.

### Caption strip

Present, the library stage and video export only. Docked to the bottom of the canvas, 48px to 72px, chrome fill, Node Line on top: a Signal Blue mono step badge, the element at 500, the event in mono (warn and error in their level colour), then the caption in muted text.

## Do's and Don'ts

### Do:

- **Do** separate nodes from the ground by fill (#1F1F1F on #000 in dark) and keep outlines quiet.
- **Do** route new edges at right angles with rounded corners (`smooth`).
- **Do** keep Signal Blue for the walkthrough, focus, caret, selection tint and the mark.
- **Do** colour a wire by its protocol, and let the token take the colour of its current or last hop.
- **Do** set values people copy in Fragment Mono with slashed zero and tabular figures.
- **Do** tell boundary tiers apart by line pattern so a diagram reads the same with boundary colours off.
- **Do** leave nodes neutral unless a colour marks a group, such as a team or a kind of part.
- **Do** show previews as read-only live canvases with the grid off: cards fit the whole diagram, the stage frames by `readableViewport`.
- **Do** give every new token a light-theme counterpart with the same role.
- **Do** stop autoplay and cut the camera when the user prefers reduced motion.

### Don't:

- **Don't** use `backdrop-filter` on canvas nodes or edges.
- **Don't** add a saturated blue to the boundary or protocol palettes, or use amber for HTTP.
- **Don't** use ok, warn or error colours for info-level events, decoration or node kinds.
- **Don't** add shadows to docked panels or canvas nodes; the menu lift is the only ambient shadow.
- **Don't** fade idle elements with opacity; recede them by tone.
- **Don't** set text above weight 500 or interface labels in uppercase.
- **Don't** draw library previews as static wireframes.
- **Don't** make bezier curves the default edge path.
