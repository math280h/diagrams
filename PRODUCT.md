# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web (desktop, tablet and phone browsers; a tablet or a phone can install the website as an app) and desktop app
(Windows, macOS, Linux).

## Users

- **Engineers explaining systems.** Developers and architects; diagrams of applications, architecture and request
  paths for docs, READMEs, PRs, RFCs, talks.
- **Educators and content creators.** Animated software explainers for courses, blogs, videos, social media.

Both need a finished look without a design tool, often with motion.

## Product Purpose

Good-looking diagrams and flows of applications and architecture, animated. Traffic moves along connections, and a
flow follows a request or a user step by step. Success means no retouching before a talk, README or video, and
animations that export as publishable files.

## Positioning

Free, with no account. Modern by default. Connections carry animated traffic, flows have a camera that follows the
token, and video and GIF exports are frame exact and render on the user's own device.

## Operating Context

- **Website in a desktop browser**, beside docs, slides, video edits and pull requests. Diagrams stay in browser
  storage. In Chrome and Edge, the website can also keep them in a folder that the user picks, and an AI agent can
  work on them through that folder. Firefox and Safari open a folder read-only.
- **Website on a tablet**, installed as an app from the home screen; the library offers the install on tablets. It
  works offline. Folders work as in the desktop browsers, where the browser has the folder API. The MCP server needs
  the desktop app, so a tablet has no agent connection.
- **Website on a phone**: the library, the editor with a reduced top bar, and Present. The browser menu can install
  the website as an app, which also works offline.
- **Desktop app** on Windows, macOS and Linux. Diagrams are files in `Documents/Diagrams`, or any diagram file that the
  user opens, for example in `docs/` of a repository. It runs an MCP server for AI agents and updates itself from
  GitHub Releases. By default it keeps running in the background after its window closes, and starts at sign-in.
- **Command line and CI.** The desktop app renders diagram files to images and video without a window. The GitHub
  Action `actions/render` keeps README images up to date and comments on pull requests with before and after images.
- **Talks and walkthroughs**: Present in full screen.
- **Existing diagrams**: Mermaid flowcharts and OpenTelemetry, Jaeger or Zipkin traces import as diagrams and flows.

## Capabilities and Constraints

- No account and no diagram server. The website is static files. The desktop app listens on 127.0.0.1 only, for AI
  agents and the handoff from the website.
- Privacy: diagrams stay on the user's computer (stated on the landing page and in the README). "Network connections"
  in `docs/ARCHITECTURE.md` lists what the app sends.
- Storage: browser `localStorage` (about 5 MB), a folder on the website, or files on the desktop. The library in
  browser storage offers a zip backup of all diagrams.
- Canvas first: the diagram is the largest thing on screen; panels open on demand.
- Nodes: the outline of a node shows its kind (service, data store, queue or stream, client, external system,
  function). The app has the official AWS, Azure, Google Cloud, Kubernetes and Salesforce icons, and about 220 software
  logos. Present shows the owner, description and links of a node on hover. A node can open another diagram
  (drill-down). Metrics, meters and status dots are off by default.
- Boundaries group by tier: account or subscription, network, subnet, runtime (such as a cluster), and custom groups
  such as a team. The line pattern shows the tier.
- Connections: labels, a protocol colour, animated traffic (dots, comets, dashes, pulse), and JSON request and response
  bodies with types, examples and notes. Body fields can be marked as personal data or secrets. The Sensitive data view
  shows which connections carry them across a trust boundary.
- Flows: the user records steps by clicking nodes. Each step has a caption, an event, a latency and a level for its
  log line. A flow also reads as a log, a sequence diagram or a timeline.
- Flow structure: one step can send tokens to several nodes at once, and their replies come back to one node. A flow
  can branch into paths, such as a failed payment, and a side path plays at the same time as the main steps.
- Captions and camera: the flow sets a caption style, and a step can choose another. The styles are a callout next to
  the step, a subtitle, a bar at the bottom or the top, or no caption. The camera follows the token, frames each step,
  or stays still. A keyframe timeline adds camera, opacity and traffic changes.
- Playback: Present, share links and web page exports play a flow at 0.5× to 2× speed. Explore in Present moves the
  focus from node to node.
- Export: PNG, SVG (optionally with the diagram inside, to import again), MP4, WebM, GIF, a web page that plays the
  flows, README images for dark and light themes, Mermaid flowcharts and sequence diagrams, a text description, and the
  diagram file. The app also copies an image to the clipboard, and makes a share link that carries the whole diagram.
- Import: diagram files, backups, images that hold a diagram, Mermaid flowcharts, traces.
- Layout: Tidy up lays out the whole diagram; pinned nodes stay. Agents can choose other layout styles.
- Version history on the user's computer: saves by the user, an agent or outside edits. Any version previews on the
  canvas and restores as one undo step. A diagram file in git compares with its last commit.
- Outside changes: when another tab, a git pull or a sync tool changes the open diagram, the app never writes over the
  change. It merges the two versions field by field and lets the user choose each conflict.
- AI agents (Claude Code and other MCP clients) read, change, check and render diagrams with 21 tools, while the user
  watches. Each change call is one undo step and one version. The Claude Code plugin adds five skills: architecture,
  flows, infrastructure (from Terraform, Compose or Kubernetes files), review and threat model.
- Themes belong to the viewer, not the diagram. The built-in themes are Light, Dark, Light high contrast, Dark high
  contrast, Graphite, Blueprint, Circuit, Dusk, Graph paper and Fog. Users can add theme files. The two high contrast
  themes follow the system setting.
- Problem reports: the user reads the full report and sends it, or copies it into a GitHub issue. The report has no
  diagram content and is encrypted on the device. The app sends a report only when the user presses "Send report" in
  the dialog that shows the full text. A build without a report server only copies the report text.
- Open decision: product name; "Diagrams" is a working name.

## Brand Commitments

- Free.
- Not dated; not a generic AI-generated dark dev tool.
- For engineers and technical educators.

## Evidence on Hand

- Thirteen templates in `src/templates/`: Multi-cloud platform, Collaborative editor, Order system, Event pipeline,
  Checkout flow, Sign in with OpenID Connect, Serverless photo upload, Webhook delivery, Deploy pipeline, RAG
  assistant, Agent with MCP tools, C4 system context, C4 containers. Sample content, not real data.
- No users, testimonials, customers, usage numbers, press or benchmarks yet. Do not invent them.

## Product Principles

1. **Beautiful by default.** New diagrams are presentation-ready without styling.
2. **Motion explains.** Animation shows how requests, data and users move; never decoration.
3. **Free and local-first.** No account, no paywall; the browser or the user's disk holds the data; export and share
   links are how work leaves.
4. **What you see is what you export.** Images and videos match the canvas exactly.
5. **Versatile, without lock-in.** One set of parts for architecture and user flows; JSON files, Mermaid and the
   published JSON Schema keep work portable.
