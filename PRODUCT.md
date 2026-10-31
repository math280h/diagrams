# Product

<!-- impeccable:product-schema 1 -->

## Platform

web and desktop (Windows, macOS, Linux)

## Users

- **Engineers explaining systems.** Developers and architects; diagrams of applications, architecture and request
  paths for docs, READMEs, PRs, RFCs, talks.
- **Educators and content creators.** Animated software explainers for courses, blogs, videos, social media.

Both need a finished look without a design tool, often with motion.

## Product Purpose

Good-looking diagrams and flows of applications and architecture, animated: traffic along connections, a user followed
step by step. Success: no retouching before a talk, README or video; animations export as publishable files.

## Positioning

Free, no account; other tools charge or look dated. Modern by default, motion-first: living edges, user flows with a
camera that follows the token, frame-exact video and GIF export, in the browser.

## Operating Context

- Desktop browser, beside docs, slides, video edits, pull requests.
- Imports Mermaid flowcharts, where existing diagrams often start.
- Full-screen present mode for talks and walkthroughs.

## Capabilities and Constraints

- No account or diagram server. Website: static files; desktop app: 127.0.0.1 only, for AI agents and the website
  handoff.
- Privacy: diagrams stay on the user's computer (stated on landing page and README). "Network connections" in
  `docs/ARCHITECTURE.md` lists what the app sends.
- Local-first: browser `localStorage` (about 5 MB) or desktop files in `Documents/Diagrams`. Optional sync may follow;
  never a required account.
- Desktop: AI agents (such as Claude Code) read, change and render diagrams via MCP and bundled skills. Each change
  call is one undo step, shown live.
- Node shape shows kind: service, datastore, queue or stream, client, external system, function. Boundaries group by
  tier: account or subscription, network, subnet, runtime (such as a cluster). Metrics, meters, status: off by
  default.
- Canvas-first: diagram largest on screen, panels on demand.
- Edges: labels, animated traffic (dots, comets, dashes, pulse).
- Flows: steps recorded by clicking nodes, captions, camera modes, keyframe timeline for camera, opacity, traffic.
- Connection request and response bodies: JSON fields with types, examples, notes; filled from pasted JSON, copied as
  example JSON, shown in flow log lines.
- Export: PNG, SVG (docs, slides); MP4, WebM, GIF (videos, posts); JSON (between browsers); Mermaid flowcharts.
  Import: JSON, Mermaid flowcharts.
- Local version history (saves by the user, an agent or outside edits); any version previews on the canvas, restores
  as one undo step.
- Dark and light themes required.
- Open decision: product name; "Diagrams" is a working name.

## Brand Commitments

- Free.
- Not dated; not a generic AI-generated dark dev tool.
- For engineers and technical educators.

## Evidence on Hand

- Five starter templates in `src/templates/`: Multi-cloud platform, Collaborative editor, Order system, Event pipeline,
  Checkout flow. Sample content, not real data.
- No users, testimonials, customers, usage numbers, press or benchmarks yet. Do not invent them.

## Product Principles

1. **Beautiful by default.** New diagrams are presentation-ready without styling.
2. **Motion explains.** Animation shows how requests, data and users move; never decoration.
3. **Free and local-first.** No account, no paywall; the browser holds the data; export is how work leaves.
4. **What you see is what you export.** Images and videos match the canvas exactly.
5. **Versatile, without lock-in.** One set of parts for architecture and user flows; JSON and Mermaid keep work
   portable.
