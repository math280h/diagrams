---
name: architecture
description: Draws or extends a software architecture diagram in the Diagrams app, with product icons, cloud boundaries and edges coloured by protocol. Use when the user asks for a system, architecture, infrastructure or cloud diagram, or asks to add services, databases or queues to one.
---

# Draw an architecture diagram

The Diagrams app shows every change while you make it, and each call that changes a diagram is one undo step for the user. Work in this order.

1. **Find the diagram.** Call `get_editor_state`. If no diagram is open, call `list_diagrams`. For a new diagram, call `create_diagram`.
2. **Read it first.** Before you change a diagram, call `get_diagram`. Reuse the nodes that are there. Do not add a second "Orders DB".
3. **Choose icons and boundaries.** Call `search_icons` once for each product the user names, for example "postgres", "lambda" or "kafka". If the system runs in a cloud account, a network or a cluster, call `list_boundary_kinds`.
4. **Add everything in one call.** Send all nodes and edges in one `add_elements` call. Give each node a `ref` and use the refs in `from`, `to` and `parent`. Do not give `x` and `y`. The app places new nodes.
5. **Lay it out.** After you add more than four nodes, call `layout_diagram`. Use `RIGHT` for request paths and `DOWN` for layered stacks.
6. **Check your work.** Call `render_image` and look at the image. Fix overlaps, nodes outside their boundary and long labels with `update_elements`. Then render again.

## Nodes

- Use a card for each part that runs or stores data. Set `form` to the kind of part: `service`, `datastore`, `queue`, `client`, `external` or `function`. The outline shows the kind, so the label does not say "service".
- Write short labels in sentence case: "Order service", "Payments DB", "Shopper".
- Put facts that people copy in `lines`: an engine and version, a port, a runtime, a region. Use one to three lines.
- Use the icon names from `search_icons`. A product icon also gives the card its form if you do not set `form`.
- Use `badge` and `status` only for real data, such as a version or a health state. Never use them as decoration.
- Use shapes and text only for notes and titles, not for parts of the system.
- When you know the owner of a part, what it does, or where its code, docs or dashboards are, set `owner`, `description` and `links`. Readers see them on hover in Present and on an exported page, so the canvas stays clean. Use only real addresses that the user or the code gives you.
- Leave cards neutral, unless the user asks for colours or the nodes fall into groups that cross boundaries, such as the teams that own them. Then set `color` on the cards of each group, with one colour for each group, and tell the user what each colour means. When the nodes of a group run in one place, such as an account, a network or a cluster, use a boundary instead.

## Edges

- Draw one edge for each call or data path, from the caller to the receiver.
- Label each edge with its protocol or its call: "HTTPS", "gRPC", "SQL", "publish order.created". The label sets the colour. HTTP, RPC, database and messaging each have their own colour.
- Use `style: "dashed"` for asynchronous or optional paths. Use `bidirectional` only for real two-way traffic, such as a WebSocket.
- Turn on `traffic` only for the main paths.
- Do not connect an edge to a group. Connect the nodes in the group.
- When the user asks about the data of a call, or gives an API or a message format, add the body to the edge. Set `request` to what the caller sends and `response` to what comes back. The easiest way is `example`: a short, realistic JSON body. Add `fields` with a `description` for fields whose meaning is not clear from the name. The edge label then shows `{n}`, the number of fields.

## Boundaries

Groups are boundaries, for example an account, a region, a network, a subnet or a cluster. In `nodes`, put the outer boundary first, then the inner boundaries with `parent`, then the cards with `parent`. For the nesting order and the kinds, see [references/boundaries.md](references/boundaries.md).

## Icons

For icon names, see [references/icons.md](references/icons.md).

## Change a diagram

- For a large system, keep one overview diagram and one diagram for the inside of each big part. Set `opens` on the card or boundary to the id of the inner diagram, so readers can zoom in.
- `layout_diagram` keeps pinned nodes in their places. When the user has placed nodes by hand, pin them with `pinned: true` before a layout, or ask first.
- To rename, change an icon, move or reparent a node, call `update_elements`. To remove a node or an edge, call `delete_elements`.
- When the user says "this" or "the selected one", call `get_editor_state` and use the selection.
- For a Mermaid flowchart, call `import_mermaid`. Do not copy it node by node.
- To show how a request moves through the system, use the flows skill.
