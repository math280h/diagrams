---
name: threat-model
description: Marks the personal data and the secrets in the bodies of a Diagrams diagram, finds the connections that carry them across a trust boundary, and checks each crossing with STRIDE. Use when the user asks for a threat model, a security or privacy review, where personal data goes, or what crosses a trust boundary.
---

# Threat model a diagram

The app keeps a mark on each body field that holds personal data or a secret, and it finds the connections that carry marked fields across a trust boundary. You decide which fields are sensitive, and you check each crossing.

1. **Read it.** Call `get_diagram` with `detail: "full"`. Each edge lists the fields of its `request` and `response` bodies, and a marked field has `sensitive`. `dataCrossings` lists each edge that carries a marked field, with the trust boundaries that it `crosses`.
2. **Mark the fields.** Set `sensitive` on each body field that holds personal data or a secret and has no mark. Send all marks in one `update_elements` call, in `request.fields` or `response.fields` by `path`. Then call `get_diagram` again to get the new `dataCrossings`.
   - `personal`: a name, an email or postal address, a phone number, an IP address, a user or customer id, a location, a date of birth.
   - `secret`: a password, a session or access token, an API key, a private key, a card number or a security code.
   - A connection without a body can carry sensitive data too, for example a sign-in page. When the user knows the body, add it first, as the architecture skill shows.
3. **Know the boundaries.** A trust boundary is a boundary of an owner (account, project, system), a network, a subnet or a rule set (security group, trust boundary). When no such boundary is between the two ends, a connection between a client or external card and another card crosses "the edge of the system". When the diagram shows no boundary where the user expects one, tell the user and offer to add a boundary of the kind `general.trust`.
4. **Check each crossing with STRIDE.** For each entry of `dataCrossings` with boundaries in `crosses`, answer the six questions. Use what the diagram shows: labels, protocols, the lines and the descriptions of the nodes. Say so when the diagram does not show the answer.

| Threat                 | Question for the crossing                 | What answers it                                                      |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Spoofing               | Can the receiver tell who sends the call? | mTLS, OIDC or OAuth tokens, signed webhooks                          |
| Tampering              | Can someone change the data on the way?   | TLS, signed messages                                                 |
| Repudiation            | Can the sender later deny the call?       | An audit log with the caller and the time                            |
| Information disclosure | Can someone read the sensitive fields?    | TLS, field encryption, fewer fields, no secrets in logs or addresses |
| Denial of service      | Can the caller overload the receiver?     | Rate limits, timeouts, queues                                        |
| Elevation of privilege | Can the caller do more than it must?      | Authorization checks, least privilege, read-only roles               |

5. **Report.** For each crossing, write the connection, the sensitive fields and the boundaries. Then write one line for each STRIDE threat: what the diagram shows, or the risk and a fix. Put the crossings with secrets first. Name the sensitive fields that the receiver does not need, because each one is a risk without a reason.
6. **Ask before you change the diagram.** Useful changes: remove a field from a body, add a boundary, put the protection in the edge label (for example "HTTPS, mTLS"), or write it in the `description` of a node.

The user sees the marked connections in the editor with the Sensitive data button in the top bar.
