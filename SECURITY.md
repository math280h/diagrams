# Security policy

## Report a problem

Do not open a public issue for a security problem. Report it privately through
[GitHub private vulnerability reporting](https://github.com/math280h/diagrams/security/advisories/new).

Give the steps to reproduce the problem, the version of the desktop app or the date you used the website, and your
operating system. You get an answer within 7 days. This project has one maintainer, so a fix can take longer. When a
fix is out, the advisory names you, unless you ask not to be named.

## Supported versions

| Part                                                    | Supported          |
| ------------------------------------------------------- | ------------------ |
| The website at [draw.thias.dev](https://draw.thias.dev) | Yes                |
| The desktop app                                         | The latest version |
| Older desktop versions and forks                        | No                 |

## Scope

These parts handle data from outside the app:

- **The agent server of the desktop app.** It listens on `127.0.0.1:27419` only. `/mcp` needs the bearer token from
  "Connect an agent", accepts only a `Host` of `127.0.0.1` or `localhost`, and refuses requests that a web page sends.
- **The handoff from the website.** `/handoff/:code` accepts a diagram only from the website origin, only with a
  single-use code from a `diagrams://` link that is at most 60 seconds old, and at most 8 MiB. A handed-over diagram
  always becomes a new diagram.
- **The `diagrams://` link** that the operating system passes to the desktop app.
- **Diagram files**: JSON import, Mermaid import, and the files in `Documents/Diagrams` that other programs can change.
- **The renderer of the desktop app**, which runs with context isolation and the Chromium sandbox.
- **Updates of the desktop app.** The app downloads updates over HTTPS from the published GitHub Releases of this
  repository and checks the SHA-512 of each download. The builds are not signed yet, so an attacker who controls the
  releases of this repository can ship an update.

Not in scope:

- An attacker who can already run programs as the same user. Such a program can read the agent token, which the app
  keeps in a file in its user data folder, and it can change the diagram files.
- An AI agent that you connect and that then makes changes you did not want. The agent has the same access to your
  diagrams as you, and you can undo each change it makes.
- Problems in Electron, Chromium or a dependency that a newer version already fixes. Report those to the project
  upstream.
