# Releasing the desktop app

The website deploys from `main`. The desktop app ships through GitHub Releases, and the installed app updates itself
from the latest published release. The tag gives the version of a release: the workflow builds the app with it. The
version in `package.json` only names builds on your own computer, so a release needs no commit.

## Make a release

1. On an up-to-date `main` with no local changes, run:

   ```sh
   pnpm release:tag patch
   ```

   Use `minor` or `major` for a bigger step, or an exact version such as `0.3.0`. The script works out the next
   version from the newest tag, then creates and pushes the tag (signed, if git signs your tags). Add `--dry-run` to
   only see the next version.

2. The Release workflow creates a draft release. The packaging jobs use the `release` environment, so GitHub asks you
   to approve them. Then they package the app on Windows, macOS and Linux. Each job starts the packaged app and drives
   it through the agent server before it uploads its files.
3. When all three jobs pass, open the draft on GitHub, edit the notes, and publish it. Installed apps find the update
   only after you publish.

## Make a preview

A preview is a pre-release for testing. It needs no approval and no publish step.

```sh
pnpm release:tag beta
```

This tags the next beta, for example `v0.1.2-beta.1`, then `v0.1.2-beta.2`. Use `alpha` for an alpha, or an exact
version such as `0.2.0-beta.1` for a preview of a bigger step. The workflow builds the app in the `preview`
environment and publishes it as a GitHub pre-release when all three jobs pass.

Installed apps with a normal version never get a preview. An app that runs a preview updates to the next preview or
release, whichever is newer. An app on a beta preview skips alpha previews.

## Who can release

Only repository admins can create, move or delete `v*` tags (the "Release tags" ruleset), so only they can start a
release or a preview. The `release` and `preview` environments accept only tags (`v*` and `v*-*`), so a pull request
can never use them or their secrets.

Test a package on your own computer with `pnpm desktop:package`. It writes the installer for your platform to
`release/` and publishes nothing. `node scripts/smoke-package.mjs` then tests the packaged app.

## What each release contains

| Platform | Files                                        | Updates                                                |
| -------- | -------------------------------------------- | ------------------------------------------------------ |
| Windows  | `Diagrams-<version>-win-x64.exe` (installer) | Download in the background, install on quit or Restart |
| macOS    | `.dmg` and `.zip` for `arm64` and `x64`      | Signed: as on Windows. Unsigned: a link to the release |
| Linux    | `.AppImage` and `.deb` for `x64`             | AppImage: as on Windows. deb: install on Restart       |

The `latest*.yml` and `.blockmap` files tell installed apps about the release. Keep them in the release.

## Signing

The workflow signs only when the `release` environment of the repository has the secrets below. Without them the
builds are unsigned: Windows SmartScreen and macOS Gatekeeper warn before the first start, and macOS cannot install
updates.

Add required reviewers to the `release` environment in the repository settings, so that no workflow run uses the
secrets without your approval.

### macOS: Developer ID and notarization

| Secret                        | Value                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| `MAC_CSC_LINK`                | The Developer ID Application certificate as a base64 `.p12` |
| `MAC_CSC_KEY_PASSWORD`        | The password of the `.p12` file                             |
| `APPLE_ID`                    | The Apple ID of the developer account                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for that Apple ID                  |
| `APPLE_TEAM_ID`               | The team ID of the developer account                        |

With the certificate, the build uses the hardened runtime and notarizes itself, and signed apps install updates. Users
of an unsigned macOS build must install the first signed version by hand.

### Windows: Azure Artifact Signing

| Name                      | Kind     | Value                                   |
| ------------------------- | -------- | --------------------------------------- |
| `AZURE_TENANT_ID`         | Secret   | The tenant of the app registration      |
| `AZURE_CLIENT_ID`         | Secret   | The client ID of the app registration   |
| `AZURE_CLIENT_SECRET`     | Secret   | A client secret of the app registration |
| `AZURE_SIGNING_ENDPOINT`  | Variable | The endpoint of the signing account     |
| `AZURE_SIGNING_ACCOUNT`   | Variable | The name of the signing account         |
| `AZURE_SIGNING_PROFILE`   | Variable | The name of the certificate profile     |
| `AZURE_SIGNING_PUBLISHER` | Variable | The publisher name of the certificate   |

After the first signed release, the installed app accepts only updates from the same publisher.

## Keep stable

- Do not change `appId` in `electron-builder.ts`. The installer and macOS use it to know that a new version replaces
  the old one.
- Do not name an npm script `release`. electron-builder publishes by itself under that script name.
