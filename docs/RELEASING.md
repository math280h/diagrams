# Releasing the desktop app

The official website has two deployments: a preview that follows `main`, and the live site at draw.thias.dev, which
deploys when you publish a release. The desktop app ships through GitHub Releases, and the installed app updates itself
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
   only after you publish. See "Release notes" below for what the draft holds and what to add.

## Release notes

The Release workflow writes the notes of the draft with `scripts/release-draft.ts`, from the pull requests merged
since the previous release (for a preview: since the previous tag of any kind):

- **New**, **Improvements** and **Fixes**, each grouped by area, such as Editor, Flows and Present, Export, or MCP
  server and skills. The `bug` label makes a pull request a fix and the `enhancement` label makes it new; without a
  label, the first word of the title decides (Add, Let, Copy, Export … for new; Fix, Restore, Stop … for fixes). The
  area is the one with the most changed files, without tests and docs.
- **MCP server** when tools were added or removed, and **Keyboard shortcuts** when the shortcut sheet has new entries.
- A comment at the top, which GitHub does not show, lists the new items. Before you publish, add a still and a short
  clip of each one: export them from the app (Export, then Image or Animation) and drag them into the notes. A clip
  of a few seconds as MP4 shows a feature better than a list item.

To see the notes before you tag, run `GITHUB_REPOSITORY=<owner>/<repository> node scripts/release-draft.ts <tag>`
with a local tag, for example one that you create with `git tag v0.0.0-check origin/main` and delete afterwards. 4. Publishing starts the Deploy the website workflow. Approve its job in the `release` environment, and it deploys the
tag to the live site.

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

## Builds of main

Each push to `main` that changes more than Markdown and `docs/` runs the Preview app workflow. Nobody needs to start
or approve it. It builds the installers without signatures and tests the packaged app. Then it publishes them as a
pre-release with the tag `preview-<run>`, for example `preview-57`, in the same way as a release: first a draft, then
the files, then publish.

- The repository has immutable releases, so GitHub locks the files and the tag of a published release. Each build
  therefore gets a new pre-release, and a tag name is never used twice.
- After it publishes, the workflow deletes the older builds and their tags, and keeps the build before the new one.
  The preview website reads the installer links when it builds, so its links stay valid until the next deploy.
- A build has the version `<next patch>-preview.<run>`, for example `0.1.5-preview.57`, and does not update itself.
  Download it again for newer changes, or install a release to get updates.
- The What’s new page of the preview website links the installers of the newest build under Next release. The
  release lists and the comparison with `main` leave the `preview-<run>` pre-releases out, and the website deploy
  skips them like every pre-release.
- A newer push cancels a build that still runs. The newest build that passed stays published.
- Each published build notifies the people who watch the releases of the repository.

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

Each package job attests the build provenance of its installers before it uploads them. The Preview app workflow
does the same for builds of `main`. The "Write the SBOM" job adds `Diagrams-<version>-sbom.cdx.json` to the release,
and each package job attests that SBOM for its installers. The attestations are on the Attestations page of the
repository, and each package job adds them to the release as `.sigstore.json` files. `SECURITY.md` shows how to
verify a downloaded file.

## Signing

Signing is optional. Without the settings below, the builds are unsigned: Windows SmartScreen and macOS Gatekeeper
warn before the first start, and macOS cannot install updates. A fork can sign its own builds with its own
certificates in the same way, or leave the settings empty.

The Release workflow signs the Windows builds of previews and releases, and the macOS builds of releases.
`ci.yml` and `preview-app.yml`, the workflows of pull requests and of `main`, do not sign.

### macOS: Developer ID and notarization

The macOS secrets are in the `release` environment. Add required reviewers to it in the repository settings, so that
no workflow run uses the secrets without your approval.

| Secret                        | Value                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| `MAC_CSC_LINK`                | The Developer ID Application certificate as a base64 `.p12` |
| `MAC_CSC_KEY_PASSWORD`        | The password of the `.p12` file                             |
| `APPLE_ID`                    | The Apple ID of the developer account                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for that Apple ID                  |
| `APPLE_TEAM_ID`               | The team ID of the developer account                        |

With the certificate, the build uses the hardened runtime and notarizes itself, and signed apps install updates. Users
of an unsigned macOS build must install the first signed version by hand.

### Windows: Google Cloud KMS

The Windows key is in Google Cloud KMS, with the HSM protection level, so it cannot leave Google Cloud.
`signtool.exe` signs the app, `elevate.exe`, the uninstaller and the installer through the Cloud KMS CNG provider
(`.github/actions/windows-signing`, `scripts/windows-signing.ts`). The workflow logs in to Google Cloud with the
OIDC token of the job (Workload Identity Federation), so the repository keeps no secret for Windows.

| Repository variable              | Value                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | The full name of the workload identity provider                                   |
| `GCP_SERVICE_ACCOUNT`            | The email address of the service account that signs                               |
| `WINDOWS_SIGNING_KEY`            | The full name of the key version                                                  |
| `WINDOWS_SIGNING_CERTIFICATE`    | The PEM certificate of the key, then the PEM certificates of the intermediate CAs |
| `WINDOWS_SIGNING_TIMESTAMP_URL`  | Optional: an RFC 3161 timestamp server (default `http://timestamp.digicert.com`)  |

The full names have the form `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` and
`projects/PROJECT/locations/LOCATION/keyRings/RING/cryptoKeys/KEY/cryptoKeyVersions/1`.

The Release workflow signs the Windows build only when `WINDOWS_SIGNING_CERTIFICATE` has a value.

After the first signed release, the installed app accepts only updates from the same publisher: the common name of
the certificate (`publisherName` in `app-update.yml`). A new certificate must have the same common name.

#### Set up the key

Run these commands in Cloud Shell, or with the gcloud CLI in the Google Cloud project. Replace the words in capitals.

```sh
gcloud services enable cloudkms.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
gcloud kms keyrings create RING --location LOCATION
gcloud kms keys create KEY --keyring RING --location LOCATION \
  --purpose asymmetric-signing --default-algorithm ec-sign-p256-sha256 --protection-level hsm
gcloud iam service-accounts create SERVICE_ACCOUNT
gcloud kms keys add-iam-policy-binding KEY --keyring RING --location LOCATION \
  --member serviceAccount:SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com --role roles/cloudkms.signerVerifier
gcloud iam workload-identity-pools create POOL --location global
gcloud iam workload-identity-pools providers create-oidc PROVIDER --location global --workload-identity-pool POOL \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition "assertion.repository == 'OWNER/REPO' && (
    (assertion.environment in ['release', 'preview'] && assertion.ref.startsWith('refs/tags/v')) ||
    (assertion.environment == 'signing-test' && assertion.ref == 'refs/heads/main'))"
gcloud iam service-accounts add-iam-policy-binding SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member principalSet://iam.googleapis.com/projects/NUMBER/locations/global/workloadIdentityPools/POOL/attribute.repository/OWNER/REPO
```

The condition of the provider gives a token only to jobs of this repository. A job in the `release` or `preview`
environment gets a token only for a `v` tag. A job in the `signing-test` environment gets a token only for `main`.
Use the names of the environments of your repository.

#### Get the certificate

1. In the Google Cloud console, open the key version, select **Verify attestation** and download the attestation
   bundle. It shows that the key is in an HSM.
2. Make a certificate signing request (CSR) of the key with OpenSSL and the Cloud KMS PKCS #11 library, as in
   [Use CNG Provider and SignTool to sign Windows artifacts](https://docs.cloud.google.com/kms/docs/reference/cng-signtool).
3. Buy a code signing certificate from a CA that accepts a Cloud KMS key with an attestation. Send the CSR and the
   attestation bundle.
4. Put the certificate, then the certificates of the CA, in `WINDOWS_SIGNING_CERTIFICATE`.

#### Test the signing

The "Test the Windows signing" workflow signs a Windows build of `main` and checks that each file has a signature of
the certificate. It publishes nothing.

1. Make a self-signed certificate of the key, as in the same Google Cloud guide.
2. Add a `signing-test` environment that allows `main`, with you as a required reviewer. Give it a
   `WINDOWS_SIGNING_CERTIFICATE` variable with the self-signed certificate. A variable of an environment replaces the
   repository variable of the same name.
3. Run the workflow on `main`.

A self-signed certificate never goes into a release, because only the `signing-test` environment has it.

The action pins the release of the CNG provider, the SHA-256 of its zip file and the release signing key of Google.
It checks the signature of the `.msi` file with that key. Dependabot does not update the CNG provider. For a new
release, update the URL and the SHA-256 in `.github/actions/windows-signing/action.yml`.

## Keep stable

- Do not change `appId` in `electron-builder.ts`. The installer and macOS use it to know that a new version replaces
  the old one.
- Do not name an npm script `release`. electron-builder publishes by itself under that script name.

## Set up the live website

The Deploy the website workflow deploys the official live site. It reads its deploy token and the name of the website
service from the `release` environment in GitHub, and it fails with a message when one is missing. The website is a
static build (`pnpm build`), so a copy can run on any host; a fork that deploys another way can delete the workflow.

A preview release does not deploy the live site.
