---
name: flows
description: Adds animated flows to a Diagrams diagram, in which a token moves a request or a user journey through the nodes while a log line and a caption show for each step. Use when the user asks to animate, trace, walk through or present a request path, a user flow or a sequence.
---

# Animate a flow

A flow plays like a log. A token moves from node to node, the camera follows it, and each step shows a log line and a caption.

For a recorded request, call `import_trace` with the text of an OpenTelemetry (OTLP JSON), Jaeger or Zipkin trace file instead of writing the steps. It matches services to cards by name, adds missing cards and edges, and writes each call as a request and a response step with the operation, latency and status. Then check the flow, and add captions with `update_flow`.

1. **Read the diagram.** Call `get_diagram` to learn the node labels and the edges. The token moves along edges, so first add any missing edges with `add_elements`.
2. **Add the flow.** Call `add_flow` with the nodes in the order the request visits them. With `connect` (the default), the app puts in the edge steps between two nodes on the shortest path. To make the token take one particular edge, name the edge as `"A -> B"`.
3. **Write each step as a log line.**
   - `event`: what the system does, for example "POST /orders", "INSERT orders", "publish order.created" or "200 OK".
   - `latencyMs`: the time of the hop, for edge steps.
   - `level`: `warn` for a retry or a slow path, `error` for a failure. Leave `info` for the rest.
   - `caption`: one short sentence in the present tense about what happens for the person, for example "The shopper presses Pay."
   - Bodies: an edge step shows the `request` body of its edge after the event, or the `response` body when the token moves back along the edge. To show the data of a call, give the edge a body with `update_elements` instead of putting JSON in the event. Set `bodies: false` on the flow to hide them.
   - `parallel`: other nodes or edges that the step reaches at the same time, each with its own token. Use it when one event reaches several consumers, or one request calls several services at once. A node step with `parallel` nodes and `connect` gets one edge step that reaches all of them.
4. **Set the camera.** The flow opens on the whole diagram, and the default camera keeps each step in view: it holds the whole diagram while it is legible and otherwise moves only when the step leaves the view. Use `camera: "fit"` only for a step that needs a close look, because it centres and zooms in. On the flow, `cameraStyle: "follow"` makes the camera ride along with the token and `cameraStyle: "still"` keeps the whole diagram in view; `cameraMotion` (`quick` or `slow`) changes how fast the default camera moves. Keep the default durations unless a step needs more time to read.
5. **Frame the story.** For a walkthrough, start with an introduction and end with a conclusion: a step with `overview: true` and no `target` shows the whole path, with a caption such as "A checkout becomes an order in four services." Set `stepNumbers: true` on the flow when people follow along by number.
6. **Name the token.** Set the `token` label to what moves, for example "Order", "Request" or "User", and give it an icon.
7. **Check it.** Call `render_image` with the `flow` and a `step` to see a moment of the flow. Add `path` to see a step of a path.

## Good flows

- Tell one story in each flow, in about 7 to 12 steps, with the introduction and the conclusion as extra steps. A longer story reads better as chapters: one flow for each part, named in order, for example "1. Place an order" and "2. Ship it".
- Show a failure as a path of the flow: give `add_flow` or `update_flow` a `paths` entry with a `name` such as "Card declined", the index of the main step after which it starts (`from`), its own `steps`, and a `rejoin` index when the flow goes on afterwards. The viewer picks the path, and the main steps stay the happy path. A path with no `rejoin` ends the flow.
- Show a short recovery as its own steps on the main path instead: a `warn` retry, then the success.
- Keep `spotlight` on for walkthroughs, so that the parts the flow has not reached yet look dim.
- To change steps later, call `update_flow`. It can replace all steps, append steps, change a step by index or remove steps by index.
