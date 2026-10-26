# Product

<!-- impeccable:product-schema 1 -->

## Platform

web and desktop (Windows, macOS, Linux)

## Users

- **Engineers explaining systems.** Developers and architects who need diagrams of applications,
  architecture and request paths for docs, READMEs, pull requests, RFCs and talks.
- **Educators and content creators.** People who make animated explainers of how software works
  for courses, blog posts, videos and social media.

Both groups need the result to look finished without a design tool, and often need it to move.

## Product Purpose

Make very pretty diagrams and flows that explain applications and architecture, and animate
them: traffic flows along connections, and a flow follows a user through the system step by step.
Success means a diagram that goes straight into a talk, a README or a video without retouching,
and an animation that exports as a file the user can publish.

## Positioning

Free, with no account. Tools in this space either charge for it or look dated; this one looks
modern by default and makes motion a core feature: living edges, recorded user flows with a camera
that follows the token, and frame-exact video and GIF export, all in the browser.

## Operating Context

- Desktop browser, usually next to the material the diagram explains: docs, slides, a video edit,
  a pull request.
- Outputs leave the app: PNG and SVG for docs and slides, MP4, WebM and GIF for videos and posts,
  JSON files to move a diagram between browsers.
- Existing diagrams often start as Mermaid flowcharts in docs; the app imports them.
- Full-screen present mode for live talks and walkthroughs.

## Capabilities and Constraints

- No server and no account. The desktop app listens on 127.0.0.1 only, for AI agents and for the
  handoff from the website.
- Local-first is a principle: diagrams live in the browser (`localStorage`, about 5 MB), or as
  files in `Documents/Diagrams` in the desktop app. Optional sync may come later; an account must
  never be required.
- AI agents such as Claude Code can read, change and render diagrams in the desktop app through
  MCP, guided by bundled skills. Each agent call that changes a diagram is one undo step, and the
  user watches the change happen.
- Node kinds carry meaning through their shape (service, datastore, queue or stream, client,
  external system, function). Boundaries group nodes by tier, from an account or
  subscription down to a network, a subnet and a runtime such as a cluster.
  Metrics, meters and status are optional extras, off by default.
- Canvas-first editing: the diagram is the largest thing on screen; panels appear on demand.
- Edges with animated traffic (dots, comets, dashes, pulse) and labels.
- Flows: steps recorded by clicking nodes, captions, camera modes, and a keyframe timeline for
  camera, opacity and traffic.
- Request and response bodies on connections: JSON fields with types, examples and notes, filled
  from a pasted example, copied out as example JSON, and shown in the log line of a flow.
- Export: PNG, SVG, MP4, WebM, GIF, JSON, Mermaid flowcharts. Import: JSON, Mermaid flowcharts.
- Version history: saved versions of each diagram, by the user, by an agent or from outside the
  editor, kept locally. Any version shows on the canvas and restores as one undo step.
- Dark and light themes are both required.
- Open decision: the product name. "Diagrams" is a working name only.

## Brand Commitments

- Free to use.
- The product must not look dated, and it must not look like a generic AI-generated dark dev
  tool.
- Developer-focused: the audience is engineers and technical educators.

## Evidence on Hand

- Five starter templates in `src/templates/` (Multi-cloud platform, Collaborative editor, Order
  system, Event pipeline, Checkout flow). Their numbers and names are illustrative sample content,
  not real data.
- No users, testimonials, customers, usage numbers, press or benchmarks exist yet. Do not invent
  them.

## Product Principles

1. **Beautiful by default.** A new diagram looks presentation-ready before the user styles anything.
2. **Motion explains.** Animation shows how requests, data and users move; it is never decoration.
3. **Free and local-first.** No account and no paywall; the browser holds the data and export is
   how work leaves the app.
4. **What you see is what you export.** Images and videos match the canvas exactly.
5. **Versatile, without lock-in.** Architecture and user flows from one set of parts; JSON export
   and Mermaid import and export keep the work portable.
