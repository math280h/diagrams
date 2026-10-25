# Third-party notices

The app ships icons, logos, fonts and code from the sources below. Each source keeps its own licence or terms. The
[MIT licence](LICENSE) of this project does not cover them.

The product names, logos and icons are trademarks of their owners. Their use here does not mean that an owner endorses
this app, and this app is not a product of any of them.

Each build also contains `third-party-licenses.txt` (and `third-party-licenses.main.txt` for the desktop main process)
with the name, version, licence, source and full licence text of every bundled package. `pnpm build` and
`pnpm desktop:build` write these files.

## Cloud architecture icons

`pnpm icons` downloads the icon packages from the official sources and writes them to `src/canvas/icons/data/`. The
build optimises each SVG file with SVGO. This removes metadata and shortens the path data. It does not change how an
icon looks. The app does not crop, flip, rotate, distort or recolour the icons, and it shows the product name next to
each icon.

### AWS Architecture Icons

Source: https://aws.amazon.com/architecture/icons/ (icon package of 31 July 2026).

Amazon Web Services allows customers and partners to use these toolkits and assets to create architecture diagrams.
AWS and the AWS product names are trademarks of Amazon.com, Inc. or its affiliates.

### Azure architecture icons

Source: https://learn.microsoft.com/azure/architecture/icons/ (Azure Public Service Icons V24).

Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You may copy,
distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft
reserves all other rights. Azure and the Azure product names are trademarks of the Microsoft group of companies.

### Google Cloud icons

Source: https://cloud.google.com/icons (core product icons and product category icons).

Google provides these icons for diagrams and technical documentation about Google Cloud. The app follows the Google
Cloud product icon system: core products use their own icon, and other products use the icon of their category.
Google Cloud and the Google Cloud product names are trademarks of Google LLC.

### Kubernetes icons

Source: https://github.com/kubernetes/community/tree/70a4bb2d8cc35bb0672f221bad9bc60c27a6f94b/icons (commit of 26
January 2026).

Copyright The Kubernetes Authors. The Kubernetes Icons Set is licensed under a choice of Apache-2.0 or CC-BY-4.0. This
project uses it under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/). The SVG files are optimised with SVGO,
as described above. Kubernetes is a registered trademark of The Linux Foundation. Use of the Kubernetes logo follows
the Linux Foundation trademark usage guidelines: https://www.linuxfoundation.org/legal/trademark-usage

## Simple Icons

Source: https://simpleicons.org (simple-icons 16.35.0). The app bundles 220 of its logos as single-colour paths.

The Simple Icons data is licensed under CC0-1.0. The licence of the project does not mean that every logo is CC0, and
the trademark and brand guidelines of each brand still apply. These bundled logos have their own licence:

| Logo             | Licence                                                                                   | Source                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| .NET             | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)                             | https://github.com/dotnet/brand                            |
| Android          | [CC-BY-3.0](https://creativecommons.org/licenses/by/3.0/)                                 | https://partnermarketinghub.withgoogle.com/brands/android/ |
| Angular          | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)                                 | https://angular.dev/press-kit                              |
| Apache Airflow   | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://apache.org/logos                                   |
| Apache Cassandra | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://apache.org/logos                                   |
| Apache CouchDB   | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://apache.org/logos                                   |
| Apache Flink     | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://apache.org/logos                                   |
| Apache Kafka     | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://apache.org/logos                                   |
| Apache Pulsar    | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://apache.org/logos                                   |
| Apache Spark     | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://apache.org/logos                                   |
| Debian           | [CC-BY-SA-3.0](https://creativecommons.org/licenses/by-sa/3.0/)                           | https://www.debian.org/logos                               |
| Deno             | MIT                                                                                       | https://github.com/denoland/docs                           |
| Fluentd          | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)                                 | https://docs.fluentd.org/quickstart/logo                   |
| Git              | [CC-BY-3.0](https://creativecommons.org/licenses/by/3.0/)                                 | https://git-scm.com/community/logos (logo by Jason Long)   |
| JavaScript       | MIT                                                                                       | https://github.com/voodootikigod/logo.js                   |
| Jenkins          | [CC-BY-SA-3.0](https://creativecommons.org/licenses/by-sa/3.0/)                           | https://get.jenkins.io/art/                                |
| Keycloak         | [Linux Foundation trademark usage](https://www.linuxfoundation.org/legal/trademark-usage) | https://github.com/keycloak/keycloak-misc                  |
| Let's Encrypt    | [CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/)                           | https://letsencrypt.org/trademarks/                        |
| OpenTelemetry    | [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)                                 | https://cncf-branding.netlify.app/projects/opentelemetry/  |
| PHP              | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/)                           | https://php.net/download-logos.php                         |
| R                | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/)                           | https://www.r-project.org/logo/                            |
| Ruby             | [CC-BY-SA-2.5](https://creativecommons.org/licenses/by-sa/2.5/)                           | https://www.ruby-lang.org/en/about/logo/                   |
| Rust             | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/)                           | https://www.rust-lang.org                                  |
| Sanity           | MIT                                                                                       | https://github.com/sanity-io/logos                         |
| Tauri            | [CC-BY-NC-ND-4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)                     | https://github.com/tauri-apps/tauri-docs                   |
| Vue.js           | [CC-BY-NC-SA-4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)                     | https://github.com/vuejs/art                               |
| Zig              | [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/)                           | https://github.com/ziglang/logo                            |

Simple Icons provides each logo as one SVG path in one colour. The app draws that path without changes.

The licences of Let's Encrypt, Tauri and Vue.js do not allow commercial use, and the Tauri licence does not allow
changes. This project is free and non-commercial. If you use a fork of this project commercially, remove these three
logos from `scripts/icons/catalog.mjs` and run `pnpm icons`.

## Lucide

Source: https://lucide.dev (lucide-react).

Lucide is licensed under the ISC licence. Copyright (c) 2026 Lucide Icons and Contributors. Parts of Lucide are derived
from Feather, licensed under the MIT licence. Copyright (c) 2013-present Cole Bemis.

## Fonts

The app bundles these fonts through the Fontsource packages. Each is licensed under the SIL Open Font License 1.1
(https://openfontlicense.org). The full licence text is in `third-party-licenses.txt` in each build.

| Font                       | Copyright                                                          |
| -------------------------- | ------------------------------------------------------------------ |
| Host Grotesk               | Copyright 2023 The Host Grotesk Project Authors                    |
| Fragment Mono              | Copyright 2022 The Fragment-Mono Project Authors                   |
| Atkinson Hyperlegible Next | Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors |
| Atkinson Hyperlegible Mono | Copyright 2020-2024 The Atkinson Hyperlegible Mono Project Authors |
| Inter                      | Copyright 2016 The Inter Project Authors                           |
| JetBrains Mono             | Copyright 2020 The JetBrains Mono Project Authors                  |
| IBM Plex Sans              | Copyright 2019 IBM Corp.                                           |
| IBM Plex Mono              | Copyright 2017 IBM Corp.                                           |

## Code with a source requirement

These packages need a statement of where their source is. The build includes them without changes.

- **elkjs** 0.12.0 (the layout engine) and elkjs 0.9.3 (inside Mermaid): Eclipse Public License 2.0
  (https://www.eclipse.org/legal/epl-2.0/). Source: https://github.com/kieler/elkjs
- **mediabunny** 1.61.6 (video export): Mozilla Public License 2.0 (https://mozilla.org/MPL/2.0/). Source:
  https://github.com/Vanilagy/mediabunny
- **DOMPurify** 3.4.17 (inside Mermaid): MPL-2.0 or Apache-2.0. This project uses it under Apache-2.0. Source:
  https://github.com/cure53/DOMPurify

## React Flow

Source: https://reactflow.dev (@xyflow/react).

The canvas uses React Flow, licensed under the MIT licence. Copyright (c) 2019-2025 webkid GmbH. The app does not show
the React Flow attribution on the canvas.

## Mermaid

Source: https://github.com/mermaid-js/mermaid (mermaid).

The Mermaid import uses Mermaid, licensed under the MIT licence. Copyright (c) 2014-2022 Knut Sveidqvist. Mermaid
bundles other packages, which `third-party-licenses.txt` lists.

## Electron and Chromium

Source: https://www.electronjs.org (electron 45).

The desktop app runs on Electron, licensed under the MIT licence. Copyright (c) Electron contributors and GitHub Inc.
Electron includes Chromium and other projects. Their licences are in the `LICENSES.chromium.html` file next to the
Electron binary.

## Desktop main process

The agent server of the desktop app uses ViteMCP (https://github.com/vitemcp/server), hono (https://hono.dev) and
undici (https://undici.nodejs.org), each licensed under the MIT licence, and the Model Context Protocol SDK
(https://github.com/modelcontextprotocol/typescript-sdk), licensed under the Apache-2.0 licence. Copyright Anthropic,
PBC and the Model Context Protocol contributors. Updates use electron-updater
(https://github.com/electron-userland/electron-builder), licensed under the MIT licence.
`third-party-licenses.main.txt` lists all packages of the main process.
