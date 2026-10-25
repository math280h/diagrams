/** The first part of the MCP server instructions. The server adds the list of skills after it. */
export const AGENT_INSTRUCTIONS = `Diagrams draws software architecture diagrams and plays requests through them as animated flows. These tools change the diagrams in the open Diagrams desktop app. The user watches each change, and each call that changes a diagram is one undo step.

Work like this:
1. Call get_editor_state to see what the user looks at. Otherwise call list_diagrams, or create_diagram for a new diagram.
2. Call get_diagram before you change a diagram, and reuse its nodes.
3. Call search_icons and list_boundary_kinds before you add products or cloud boundaries.
4. Add nodes and edges together in one add_elements call. Give nodes refs and leave out x and y.
5. After larger changes call layout_diagram, then render_image to check the result, and fix what looks wrong.

Rules:
- A card's form shows its kind: service, datastore, queue, client, external or function.
- Label each edge with its protocol or call, such as HTTPS, gRPC, SQL or "publish order.created". The label sets the colour.
- Write labels in sentence case. Use badges and status only for real data.
- Connect edges to nodes, never to groups.
- When you talk to the user, say connection for edge and boundary for group.`
