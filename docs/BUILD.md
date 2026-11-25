# Build, tests and release tooling

This document covers the build, the package rules, the tests, CI, the installers and their signatures, the container
images and the supply chain. [ARCHITECTURE.md](ARCHITECTURE.md) covers how the app works. [RELEASING.md](RELEASING.md)
gives the steps of a release.

## Build

- React Compiler does not compile a function that it cannot handle, and at the default `panicThreshold` the build
  shows no warning. `scripts/react-compiler.ts` collects these functions from the app build and the player build. The
  build fails when they differ from `KNOWN_SKIPS`, or when the compiler fails.
- The `icons` chunk group holds the Lucide icons that the first page imports. Without it, Rolldown makes one chunk for
  each icon that two chunks share: about 80 files of less than 2 kB on the first page.
- Lint and format: oxlint (type-aware), oxfmt. create-vite default.

## Packages

pnpm 12. `pnpm-workspace.yaml` sets what pnpm accepts when it resolves a version. At each install, also with
`--frozen-lockfile`, pnpm checks every lockfile entry against the age and trust rules again.

- `minimumReleaseAge`: only versions that are at least one day old. Registries often remove a malicious version in
  that time.
- `trustPolicy: no-downgrade`: pnpm stops when a version has less proof of origin than an earlier version, for example
  no provenance after releases with provenance.
- `blockExoticSubdeps`: no git or tarball sources in sub-dependencies.
- `strictDepBuilds`: pnpm stops at an install script that `allowBuilds` does not list.
- `overrides`: minimatch 7.0 to 11.0.0 becomes 11 (GHSA-g3hv-75wg-m249). glob 9 to 14.0.1 becomes 14
  (GHSA-3g3m-2fjr-6pw4). Only `@electron/asar` uses glob, and it calls only the `glob()` function, which glob 14 keeps.
  semver 5 and 6 become 7, because their last releases have no provenance and fail the trust check. Their callers use
  only functions that semver 7 keeps.
- `overrides` for electron-builder 26: `@electron/asar` becomes 4 and `@electron/universal` becomes 3, the versions
  that the electron-builder 27 alpha uses. app-builder-lib loads them with `import()` and calls
  `createPackageFromStreams` and `makeUniversalApp`, which have the same signatures as in the earlier versions.
  `filelist` becomes 2 for jake, which only the ejs command line uses.
- `electron-builder-squirrel-windows: '-'` removes that package and the packages that only it needs. That package is a
  peer dependency of app-builder-lib, and pnpm installs it. app-builder-lib loads that package only for the `squirrel`
  target, which `electron-builder.ts` does not use. Together, these overrides remove minimatch 3 and 5, glob 7,
  dir-compare, rimraf 2 and temp.
- `capjs-core` needs esbuild and javascript-obfuscator only for its browser checks, so the `overrides` do not install
  them (see "Report server" in ARCHITECTURE.md).
- `osv-scanner.toml` tells OSV-Scanner to ignore the deepmerge advisory (GHSA-gcqx-w48m-w2h4), with a reason and an
  `ignoreUntil` date. The advisory has no fix, and deepmerge is only in the shadcn CLI. OpenSSF Scorecard reads this
  file for its Vulnerabilities check. Dependabot does not read it.
- `patchedDependencies`: `patches/@zumer__snapdom@3.7.0.patch` changes how snapdom removes pseudo-elements from a
  selector before `matches()`. Without the patch, snapdom 3.7.0 removes an escaped `\:after` inside a class name by
  mistake, for example in `group-data-horizontal/tabs:after:h-0.5` of the tabs component. Then the selector list that
  snapdom tests on each SVG element is not valid. Each test throws an error, and snapdom treats each element as a
  match. With 3,094 nodes and without the patch, `render_image` took 20 % to 25 % longer than with snapdom 3.3.6. In
  the packaged app, it took 45 % to 50 % longer. pnpm stops when no installed version matches the patch, so a snapdom
  update must update or remove the patch. `src/export/capture.browser.test.ts` fails without it.
- `ajv`, `ajv-formats` and `jose` are dependencies of the app. `@vitemcp/server` loads them as optional peers, and the
  main bundle holds them. Without these entries in `package.json`, pnpm takes the peers from the packages of the dev
  dependencies. When no package has a version in the peer range, the bundler takes a hoisted copy that the SBOM does
  not list.
- A Dependabot security update to a version that is less than one day old can fail. Wait one day, or add the package
  to `minimumReleaseAgeExclude`. A version that fails the trust check for a known reason goes in `trustPolicyExclude`.
- `pmOnFail: ignore`: pnpm does not switch to the `packageManager` version. With any other value, pnpm writes that
  version as a first YAML document in `pnpm-lock.yaml`. The GitHub dependency graph reads only the first document, so
  Dependabot alerts and the dependency review see no packages. CI installs the `packageManager` version with
  `pnpm/action-setup`, and a CI step fails when the lockfile has more than one document.

## Tests

Vitest 5 (node and Chromium browser mode), Playwright. A real browser runs the tests of Mermaid and export.

- `pnpm test:coverage` measures the coverage of the unit and browser tests (V8) for `src`, `electron`, `scripts` and
  `actions`. Each threshold in `vitest.config.ts` is the value of 2026-11-01, rounded down to a whole number, minus 1.
  Vitest fails the run when a value is below its threshold. CI shows the values in the job summary.
- When you set `E2E_COVERAGE`, the web end-to-end tests record the V8 coverage of the app scripts in Chromium
  (`e2e/fixtures.ts`). The web specs import `test` from that file, and a lint rule blocks an import from
  `@playwright/test`.
- `scripts/coverage.ts` converts that coverage with `ast-v8-to-istanbul`, the converter of `@vitest/coverage-v8`. The
  script also uses `@vitest/istanbul-lib-coverage` and `@vitest/istanbul-lib-report`, the coverage libraries of
  Vitest. Then the script adds the converted coverage to the unit coverage.
- The React Compiler runs only for the client (`applyToEnvironmentHook`), so a component has more statements in the
  browser than in the unit tests. The script keeps the statements, functions and branches of the unit coverage. The
  script adds to each one the counts of the end-to-end entries that start at the same line and column.
- `pnpm coverage:all` needs `coverage/coverage-final.json` from `pnpm test:coverage`. `pnpm coverage:all` runs the web
  end-to-end tests with coverage and writes `coverage-all/`. In CI, the "Coverage of all tests" job merges the
  coverage of the four web shards with the unit coverage. Its thresholds follow the same rule. The desktop end-to-end
  tests do not count.
- The "Coverage of all tests" job writes the line coverage to a shields.io badge file on each run. The badge shows the
  percentage, rounded down to a whole number. On a push to `main`, the "Coverage badge" job pushes the file to the
  `coverage-badge` branch, and the README badge shows it. In `ci.yml`, only this job has write permission for the
  contents of the repository. It does not install packages or run code from the repository.
- Fuzz tests (`*.fuzz.test.ts`, `*.fuzz.browser.test.ts`) use fast-check. They give random and changed input to each
  reader of untrusted data.
  - The readers are for diagram files and migrations, copied nodes, share links, trace files, images with a diagram,
    `diagrams://` links and release notes HTML.
  - Each test checks the contract of the reader: a valid result, or the error class of that reader. Any other error or
    unsafe output fails the test.
- `e2e/accessibility-scan.spec.ts` runs axe (`@axe-core/playwright`, WCAG 2.2 A and AA) in the Light and the Dark
  theme.
  - Scope: library, template page, editor (selection, flow panel), command and insert menus, shortcut sheet, image
    export, minimap, Present with Explore, phone library and editor.
  - Each other built-in theme: editor with a selection, and the app settings.
  - A violation fails the run.
  - The scan leaves out what Explore dims (text at 16 %): WCAG 1.4.3 excludes inactive parts.
  - Every node has the `group` role.
  - The zoom readout, Insert, the path pickers and the log rows take their name from their text.

## Continuous integration

`.github/workflows/ci.yml` runs on each pull request and on `main`.

- "Changed files": when a pull request changes only files that no check reads (`docs/`, `CONTRIBUTING.md`,
  `CODEOWNERS`, the issue and pull request templates, `dependabot.yml` and some other Markdown files), the jobs of the
  app do not run. `README.md`, `LICENSE` and the skills are not in the list, because tests read them.
  - When a pull request changes only these files and the image files (the two Dockerfiles, `.dockerignore` and
    `docker/`), only "Typecheck, lint and unit tests" and the two image jobs run. No web or desktop test reads the
    image files.
- "Typecheck, lint and unit tests": static checks and Vitest, with browser tests in Chromium.
- "Docker image": builds the website image and its SBOM, and scans both and the Dockerfile with Trivy. It runs the image
  with a read-only file system and no capabilities, and checks the content types, cache headers and compression.
- "Report server image": builds and scans the report server image in the same way. It tests the bucket store against
  SeaweedFS, and runs the conformance tests against the image with a folder (Cap) and with the bucket (ALTCHA).
- "Web tests 1 of 4" to "4 of 4": the end-to-end tests, split with Playwright `--shard`. A 4-core runner gets 2
  workers; four shards give the 8 of a developer computer. The matrix sets the number (`strategy.job-total`).
- "All checks": the required check of the "Protect main" ruleset, also for the desktop jobs. It fails unless each job
  passed or did not run because of "Changed files". It has `if: always()`, because GitHub counts a required job skipped
  after a failed dependency as passed. A matrix job that does not run gives no check with its platform name, so the
  desktop jobs are not required checks themselves.
- "Desktop app on …": unit tests, desktop end-to-end tests and the render action on Windows, macOS and Linux.
  - Each job builds the installers of its system for its own architecture: NSIS on Windows, dmg on macOS, AppImage
    and deb on Linux.
  - The job installs or mounts each installer and runs `scripts/smoke-package.mjs` on the installed app. On Windows,
    the job then runs the uninstaller and checks that the uninstaller removed `Diagrams.exe`.
  - On Linux, `scripts/smoke-deep-link.ts` checks the `diagrams://` handler with `xdg-mime`. Without the deb package,
    `xdg-open` starts the AppImage with a link. With the deb package, the deb entry keeps the links.
  - The Windows and Linux jobs run `scripts/installer-contents.ts`. The script compares the NSIS plugins, the AppImage
    runtime and the libraries in `usr/lib` of the AppImage with the SBOM. The script unpacks the Windows installer and
    uninstaller with 7-Zip.
  - Each job uploads its installers as the workflow artifact `installers-<runner>`. GitHub keeps them for 7 days. A
    reviewer can install the app from the installers of a pull request before the merge.
  - A failed desktop end-to-end test writes its evidence to its test results (`e2e/desktop/fixtures.ts`). The evidence
    is the output of each app process with Chromium logs (`ELECTRON_ENABLE_LOGGING`), `crashes.json`, the exception
    and location of each crash dump, the GPU state and the checked images. The job uploads the test results only after
    a failure.
  - A dump holds the memory of a process, and anyone can download the artifacts of a public repository. Thus the
    evidence holds the dumps themselves only with `E2E_KEEP_CRASH_DUMPS=1`, for a local run.
  - On `macos-latest`, some runners have more cores, and Playwright then uses 2 workers. With two apps on the virtual
    GPU, the GPU device is often lost and the GPU process restarts. A canvas in a page then reads transparent pixels,
    so the capture tests decode and compare pixels in the main process of the app (`e2e/desktop/pixels.ts`).
- `.github/actions/playwright-chromium` caches Chromium by Playwright version.
  - On Linux, it also caches the `.deb` files of the system libraries of Chromium, by runner image and Playwright
    version. A cache hit installs them with `dpkg` and does not use the Ubuntu mirrors, so a mirror outage does not
    stop CI. The key holds the image version, because the packages of an earlier image can downgrade those of a later
    image.
  - After a cache hit, `playwright install-deps --dry-run` fails the step when a library is missing.
- `.github/actions/electron` caches the Electron downloads by Electron version and installs the binary, with three
  tries. The `electron` package has no install script: it downloads the binary when a process first loads it, also in
  the unit tests.
- Playwright keeps a trace of each failed CI test (`trace: 'retain-on-failure'`); the failed job uploads it in
  `test-results`. No retries, so a test that fails only sometimes stays visible.
- `.github/workflows/dependency-review.yml` compares the dependency graph of a pull request with its base. It fails when
  the pull request adds or changes a package with a high or critical advisory, in runtime or development scope. It also
  fails for a licence outside `allow-licenses`, which holds the licences of the lockfile. A package with no licence
  only shows in the summary.
- `.github/workflows/scorecard.yml` runs OpenSSF Scorecard on each push to `main`, each Monday and after a change to
  branch protection. It publishes the result to the Scorecard API for the README badge, and it uploads the findings to
  code scanning. The Scorecard API accepts a result only from a job with approved actions and no `run` steps.

### Display previews

`.github/workflows/display-previews.yml` runs the render action (see "Render action" in ARCHITECTURE.md) for a pull
request from this repository that changes drawing code, templates or dependencies. It builds the app of both commits.

- The base commit is the first parent of the merge commit, not `pull_request.base.sha`, which stays old when `main`
  moves.
- `scripts/template-files.mjs` of each commit writes each template as a diagram file in `.diagram-previews/` and
  `base/.diagram-previews/`, and the action renders each file in the Dark and the Light theme (`theme: dark light`).
  Template changes then show. A template gets new random ids at each build, so the script numbers the ids in order.
  Particle times depend on a hash of the edge id, so the script sets the times to 0.
- App screens show what an export does not draw. `scripts/app-screens.mjs` of each commit serves its web build and
  takes them with Playwright in both themes:
  - library, template page, editor with a node selected and with the flow panel, image export, Present at its first
    step and five steps later;
  - empty diagram at 1440 × 900;
  - editor with properties and flow panel at 1280 × 720;
  - phone library, editor and Present at 390 × 844.

  Reduced motion and no CSS animations keep the screens still. Library screens show the whole page, after every card
  preview frames its diagram.

## Installers and releases

- electron-builder (`electron-builder.ts`): Windows NSIS; Mac dmg and zip per architecture; Linux AppImage and deb.
  Vite bundles all main-process dependencies, so the package holds only `dist/` and three `dist-electron/` files.
  - Toolsets: `nsis` 1.2.1 (NSIS 3.12) and `appimage` 1.0.3 (the static runtime of type2-runtime). electron-builder
    marks them as beta.
  - The default toolsets have NSIS 3.04, which has CVE-2023-37378. Their AppImage runtime needs libfuse2, which Ubuntu
    22.04 and later do not install.
- Fuses turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, inspect flags and extra `file://` rights, and allow only the
  checked asar archive.
- Release (`RELEASING.md`): a `v*.*.*` tag starts `.github/workflows/release.yml` and sets the version
  (`-c.extraMetadata.version`); a release needs no commit. `pnpm release:tag` calculates the tag. One job creates the
  draft, because parallel electron-builder jobs could each create one. Platform jobs package, drive the app through
  the agent server (`scripts/smoke-package.mjs`) and upload. The maintainer publishes the draft.
- Preview tags (`v0.2.0-beta.1`) build in the `preview` environment without approval and publish as GitHub
  pre-releases.
- Release and `main` builds do not restore the Actions cache. Other workflow runs can write that cache. If a build
  restores that cache, a changed package in it goes into the installers.
- Each `uses:` line of a remote action in a workflow pins a commit SHA, with the version in a comment.
  `.github/workflows/actions.lock` records the commit, the tag, the owner ID and the repository ID of each action. It
  also records the actions that the composite actions use. GitHub runs an action only at a commit in the lockfile.
  - A workflow calls a composite action of this repository with `uses: $/…`. GitHub runs that action at the commit of
    the workflow.
  - After a change to a `uses:` line, run `gh actions-lock --no-narrow`. Without `--no-narrow`, the tool changes the
    SHA pins to tags, and OpenSSF Scorecard counts a tag as not pinned.
  - The "Actions lockfile" job of CI checks the lockfile with `gh actions-lock --verify`.
- Each platform job attests the build provenance of its installers (`actions/attest`, SLSA provenance signed with
  Sigstore) after the test and before the upload. The attestation names the workflow file and the tag, so
  `gh attestation verify --signer-workflow --source-ref` rejects a file from another workflow or branch. Only an admin
  can create a tag, but any branch can change a workflow file. electron-updater does not check attestations.
  - Each platform job also uploads its two attestation bundles (`bundle-path` of `actions/attest`) to the release, as
    `<prefix>-<platform>-provenance.sigstore.json` and `<prefix>-<platform>-sbom.sigstore.json`.
  - OpenSSF Scorecard looks for signatures only in the files of a release. `gh attestation verify --bundle` reads the
    attestation from the file, without the attestation API of GitHub.
- Only the Mac builds of releases get a Developer ID signature. Mac builds without a certificate get an ad-hoc
  signature, which Apple Silicon needs after the fuses change the binary.
- `scripts/windows-signing.ts` signs the Windows build with `signtool.exe` (`RELEASING.md`). After a signed release, the
  updater accepts updates only from the publisher in `app-update.yml`.

### SBOM

The "Write the SBOM" job builds the bundles and runs `pnpm sbom --prod` (CycloneDX 1.6) once per release.
`scripts/sbom.ts` completes that SBOM. Each platform job attests the same SBOM for its installers.

- The production packages of pnpm include some that the bundles leave out, such as `@types` packages.
- Some bundled packages are not in the list of pnpm, for example dev dependencies whose CSS ships (tailwindcss,
  shadcn). The script adds each one from its `package.json` and the lockfile hash, without its dependencies. As a
  result, shadcn stays a dev dependency, and its CLI dependencies stay out of the SBOM.
- The script fails when a bundled package gets no component. CI runs the same check on each pull request.
- The script adds each program in `EMBEDDED_SOFTWARE` inside the package version that holds it, with a purl and a CPE.
  `EMBEDDED_VERSIONS` finds the program versions: Graphviz from the loaded module, llhttp from
  `deps/llhttp/include/llhttp.h` at the undici release tag on GitHub, and HashWX from the HashWX commit that capjs-core
  names at its release tag on GitHub.
- Electron is a dev dependency, so the script adds it. The script starts the Electron binary with
  `ELECTRON_RUN_AS_NODE` and reads `process.versions`. Chromium, V8 and Node.js go inside Electron. The projects of
  Node.js, such as c-ares, nghttp2, SQLite and libuv, go inside Node.js.
- The projects of Chromium come from `LICENSES.chromium.html` next to the binary. That file does not give versions.
- Each Fontsource package gets its font as a `data` component, from the `metadata.json` of the package.
- Each icon set in `src/canvas/icons/data` becomes a `data` component, from `scripts/icons/sources.ts`, with the SHA-256
  of its data file. Simple Icons holds a component for each bundled logo that has its own licence.
- app-builder-lib (electron-builder) holds the code that the installers add next to the app:
  - NSIS 3.12 for the Windows installer and uninstaller, with the plugins that their scripts call.
  - Elevate 1.3.0, which the Windows installer puts in `resources\elevate.exe`.
  - The AppImage runtime (type2-runtime 20251108). It is a static program with libfuse 3, squashfuse, Zstandard, zlib,
    mimalloc and musl.
  - Six libraries in `usr/lib` of the AppImage.
- `INSTALLER_TOOLSETS` names the toolsets and their bundles with the SHA-256. A test fails when `electron-builder.ts`
  selects other toolsets, or when app-builder-lib downloads other bundles for the selected toolsets.
- `NSIS_PLUGINS`, `APPIMAGE_RUNTIME_SHA256` and `APPIMAGE_LIBRARIES` give the SHA-256 of each file from the bundles. CI
  runs `scripts/installer-contents.ts` on the built installers. The script fails when an installer holds a file that
  the SBOM does not list. It also fails when the SBOM lists a file that no installer holds.
- The app gets a `pkg:github` purl, because the npm purl of the private package names another package.

### OpenPGP signatures

In the Release workflow, an OpenPGP key signs the Linux packages and `SHA256SUMS` (`scripts/openpgp-signing.ts`,
`RELEASING.md`).

- The AppImage signature has the format of `appimagetool --sign`. The key signs the SHA-256 of the whole file, with
  zero bytes in `.sha256_sig` and `.sig_key`.
- The block map for differential updates is part of the signed file. The block map has a checksum of the chunk with the
  signature. Thus a change to one makes the other incorrect.
- `signAppImage` writes random bytes into the signature sections, makes the block map again, then writes the
  signature. electron-updater uses chunk checksums only to find chunks to copy.
- The checksums of the random bytes are different from all old chunks. Thus electron-updater downloads these chunks,
  then checks the SHA-512 of the file. `check` fails if the download is more than 1 MiB.
- The SBOM gives the SHA-256 of the AppImage runtime with empty signature sections.

## Docker image

`Dockerfile` builds the website image that `.github/workflows/docker-image.yml` publishes for each release.

- The build stage takes `DIAGRAMS_WEBSITE`, `DIAGRAMS_REPOSITORY`, `DIAGRAMS_REPORT_URL` and `DIAGRAMS_REPORT_KEYS` as
  build arguments.
- The build stage runs on the platform of the build computer, because `dist/` is the same for each platform. The final
  stage has no `RUN` step, so the arm64 image needs no emulation.
- The final stage is distroless with static-web-server, a static binary. It has no shell and runs as `nonroot`.
- The Node.js image has no corepack, so the build copies pnpm from the official pnpm image. `scripts/dockerfile.test.ts`
  keeps its version equal to `packageManager`.
  - Dependabot bumps the pnpm image of both Dockerfiles in one pull request, in its own `pnpm` group. Dependabot cannot
    bump `packageManager`, so add that change to the same pull request. Thus a failed pnpm bump does not block the
    other images.
- The pnpm store is a cache mount. The website host accepts only the cache mount ID `s/<service ID>-<target>`, and no
  variable in it. Thus the ID holds the service ID of the website, and a fork that deploys to its own service changes
  it.
- The static-web-server configuration file overrides the `SERVER_*` variables. Thus the image sets the options as
  variables, and `docker/sws.toml` holds only the headers.
- The image holds the licence texts of static-web-server, from the release tag, with a checksum.
- The BuildKit SBOM scanner reads package files. The bundles in `dist/` have none, so it does not find the npm packages.
  Thus the `sbom` stage writes a CycloneDX SBOM from the same build (`scripts/image-sbom.ts`).
  - It starts from `pnpm sbom --prod` and keeps the packages in the licence files of the website bundles, as the
    desktop SBOM does. The desktop-only packages, such as the agent server, are not in it.
  - A kept package that only a removed package needs becomes a dependency of the image.
  - The publish workflow attests the SBOM to the image digest. The CI job "Docker image" builds it on each pull
    request.
- Trivy scans the image, the SBOM and the Dockerfile. The image scan finds only the Debian packages, so the npm packages
  and static-web-server come from the SBOM scan.
  - CI fails on a high or critical finding that has a fix.
  - Each Monday, `.github/workflows/docker-scan.yml` verifies the attestations of the newest release image. Then it
    scans the image and the attested SBOM and uploads the findings to code scanning. A release image does not change,
    so only this scan finds a new advisory for it.
  - `.github/actions/trivy` downloads the Trivy release and checks its SHA-256, without the Trivy action. Attackers
    moved the tags of that action to malicious commits in March 2026.

## Report server image

Vite bundles `report-server/` into one file, and the image runs that file on a distroless Node.js base.

- The image has no cache mount and no `VOLUME`, so each container host can build and run it. The release workflow
  publishes `ghcr.io/<repository>-report-server` with an SBOM (`scripts/report-server-sbom.ts`) and attestations.
- The client address is the socket address. `CLIENT_IP_HEADER` names a header that replaces the socket address, for a
  proxy that does not add to `X-Forwarded-For`. `TRUST_PROXY_HOPS` moves the client address to the `X-Forwarded-For`
  entry that the outermost proxy added. While the client address is in `TRUSTED_PROXIES`, for example the ranges of a
  CDN, the server moves to the next entry on the left. A client that goes around the CDN can write any address into
  `X-Forwarded-For`. Thus the server stops at the first address that is not in the ranges.
- `report-server/src/conformance.test.ts` sends, deletes and replays reports with each provider and the client code of
  the app. CI also runs it against the image, once with a folder and once with a SeaweedFS bucket.

## Third-party licences

`scripts/third-party-licenses.ts`, a Vite plugin, collects the package of each module in the web and worker builds and
writes `third-party-licenses.txt` with each licence text. The desktop main build writes
`third-party-licenses.main.txt`. The fonts (OFL), elkjs (EPL) and mediabunny (MPL) need a licence text or source
statement in each copy. A list that people keep by hand can become different from the lockfile. Tailwind resolves the
`@import` and `@plugin` rules of the style sheets itself, so the module graph does not hold the packages that these
rules name. The plugin reads the rules of each style sheet in the bundle and adds those packages: tailwindcss,
tw-animate-css and shadcn.

Some packages hold another program in compiled form, with its own licence: Graphviz in `@hpcc-js/wasm-graphviz` (web
worker and main), llhttp in undici (main), HashWX in capjs-core (report server). `EMBEDDED_SOFTWARE` names each one
with its licence text. The build fails when a bundled module loads WebAssembly or holds a base64 WebAssembly module,
and its package has no entry.

The report server build writes `report-server/dist/third-party-licenses.txt`, which the image holds next to the server
bundle. The standalone player build writes `dist/standalone/licenses.txt`, which each web page export holds. The
preload build writes no licence file, so `withoutPackages` fails the preload build when that build bundles a package.
The SBOM check reads the licence files of the web, player and main builds.

`THIRD-PARTY-NOTICES.md` covers icons and logos (data, not packages). A test checks that it lists every bundled Simple
Icons logo that has its own licence.

## README image

`pnpm readme-gif` (`scripts/readme-gif.mjs`) records the README GIF of the editor. It starts the dev server, copies the
Order system template in Chromium with Playwright, opens the flow panel and plays the flow.

- The Playwright fake clock (`page.clock`) controls `requestAnimationFrame`, timers and `performance.now`. The script
  moves one frame per screenshot, so no frame drops at any computer speed.
- `modern-gif` (the GIF export encoder) also runs in Node and writes only the changed area of each frame, unchanged
  pixels transparent.
- `node:zlib` reads the PNG screenshots; no image package.
