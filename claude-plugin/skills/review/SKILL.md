---
name: review
description: Checks a Diagrams diagram for layout and clarity problems and fixes them, such as overlaps, nodes outside their boundary, edges without a protocol, wrong card forms and long labels. Use when the user asks to review, clean up, tidy or polish a diagram, or after you build a large diagram.
---

# Review a diagram

1. **Read it.** Call `get_diagram` with `detail: "full"`. Read the `warnings`. They list overlapping nodes and nodes that stick out of their group.
2. **Look at it.** Call `render_image`. If the result says that the scale is low, render each area again with `focus`.
3. **Check each point.** Note the fix for each problem.

| Problem                                            | Fix                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nodes overlap, or stick out of their boundary      | `layout_diagram`, or set `x`, `y`, `width` and `height` with `update_elements`                                                                         |
| An edge has no label, so it has no protocol colour | Set `label` with `update_elements`, for example "HTTPS" or "SQL"                                                                                       |
| A card has the wrong form                          | Set `form`: `datastore` for databases and caches, `queue` for queues and streams, `external` for third parties, `client` for people, browsers and apps |
| A label is long or not in sentence case            | Shorten the label and move the details to `lines`                                                                                                      |
| A product card has no icon                         | Find one with `search_icons` and set `icon`                                                                                                            |
| A boundary is in the wrong place                   | Fix `parent`. See the boundary order in the architecture skill                                                                                         |
| An edge touches a group                            | Connect the edge to a node in the group with `from` or `to`                                                                                            |
| An edge crosses cards or makes a long detour       | Set `fromSide` and `toSide` to `"auto"` with `update_elements`, then call `layout_diagram` so that the edge follows the routes of the layout           |
| A badge or status carries no data                  | Set it to an empty string, or set status to `none`                                                                                                     |
| A flow step points at nothing, or has no event     | Fix it with `update_flow`                                                                                                                              |

4. **Fix in batches.** Send the fixes in a few `update_elements` calls, not one call for each node. Each call is one undo step for the user.
5. **Confirm.** Call `render_image` again. Tell the user what you changed in a short list.
