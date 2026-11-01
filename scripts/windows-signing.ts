import { spawnSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CustomWindowsSign } from 'electron-builder'

const KMS_PROVIDER = 'Google Cloud KMS Provider'
const DEFAULT_TIMESTAMP_URL = 'http://timestamp.digicert.com'
const PEM_CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g

export interface WindowsSigning {
  /** The resource name of the Cloud KMS key version, for example `projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1`. */
  key: string
  /** The PEM certificate of the key, then the certificates of the CAs between that certificate and the root. */
  certificates: string[]
  /** An RFC 3161 timestamp server. */
  timestampUrl: string
}

/**
 * Reads the Windows signing settings from `WINDOWS_SIGNING_KEY`, `WINDOWS_SIGNING_CERTIFICATE_FILE` and
 * `WINDOWS_SIGNING_TIMESTAMP_URL`.
 *
 * @returns The settings, or null when `WINDOWS_SIGNING_KEY` or `WINDOWS_SIGNING_CERTIFICATE_FILE` has no value.
 * @throws Error If the certificate file has no PEM certificate.
 */
export function windowsSigningFromEnv(env: NodeJS.ProcessEnv): WindowsSigning | null {
  const key = env.WINDOWS_SIGNING_KEY
  const file = env.WINDOWS_SIGNING_CERTIFICATE_FILE
  if (!key || !file) return null
  const certificates = readFileSync(file, 'utf8').match(PEM_CERTIFICATE) ?? []
  if (certificates.length === 0) throw new Error(`${file} has no PEM certificate.`)
  return { key, certificates, timestampUrl: env.WINDOWS_SIGNING_TIMESTAMP_URL || DEFAULT_TIMESTAMP_URL }
}

/**
 * Returns the common name of the first certificate in a PEM text.
 *
 * @throws Error If the certificate has no common name.
 */
export function publisherName(certificate: string): string {
  const commonName = new X509Certificate(certificate).subject.split('\n').find((part) => part.startsWith('CN='))
  if (!commonName) throw new Error('The signing certificate has no common name.')
  return commonName.slice('CN='.length)
}

/**
 * Returns the arguments of `signtool.exe` that sign a file with the Cloud KMS key and add an RFC 3161 timestamp.
 *
 * @param chainFile - A file with the CA certificates between the certificate and the root, or null.
 */
export function signtoolArguments(
  file: string,
  signing: WindowsSigning,
  certificateFile: string,
  chainFile: string | null,
): string[] {
  return [
    'sign',
    '/fd',
    'sha256',
    '/tr',
    signing.timestampUrl,
    '/td',
    'sha256',
    '/f',
    certificateFile,
    ...(chainFile ? ['/ac', chainFile] : []),
    '/csp',
    KMS_PROVIDER,
    '/kc',
    signing.key,
    file,
  ]
}

function versionParts(version: string): number[] {
  return version.split('.').map(Number)
}

function compareVersions(a: string, b: string): number {
  const [x, y] = [versionParts(a), versionParts(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * Returns the x64 `signtool.exe` of the newest Windows SDK in a `Windows Kits\10\bin` folder.
 *
 * @throws Error If the folder has no `signtool.exe`.
 */
export function newestSigntool(kitsBin: string): string {
  const versions = existsSync(kitsBin)
    ? readdirSync(kitsBin)
        .filter((name) => /^\d+(\.\d+)+$/.test(name) && existsSync(path.join(kitsBin, name, 'x64', 'signtool.exe')))
        .toSorted(compareVersions)
    : []
  const newest = versions.at(-1)
  if (!newest) throw new Error(`No Windows SDK in ${kitsBin} has signtool.exe. Install the Windows SDK.`)
  return path.join(kitsBin, newest, 'x64', 'signtool.exe')
}

function defaultKitsBin(env: NodeJS.ProcessEnv): string {
  return path.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin')
}

/**
 * Returns the electron-builder sign function and the publisher name for the Windows signing settings in the
 * environment, or null for an unsigned build. The sign function runs `signtool.exe` with the Google Cloud KMS CNG
 * provider. The computer must have the provider, and the provider must find Google Cloud credentials.
 */
export function windowsSigner(env: NodeJS.ProcessEnv): { sign: CustomWindowsSign; publisherName: string } | null {
  const signing = windowsSigningFromEnv(env)
  if (!signing) return null
  const [certificate, ...chain] = signing.certificates as [string, ...string[]]
  let files: { certificate: string; chain: string | null } | null = null
  const sign: CustomWindowsSign = async (configuration) => {
    if (!files) {
      const folder = mkdtempSync(path.join(tmpdir(), 'windows-signing-'))
      files = { certificate: path.join(folder, 'certificate.pem'), chain: null }
      writeFileSync(files.certificate, `${certificate}\n`)
      if (chain.length > 0) {
        files.chain = path.join(folder, 'chain.pem')
        writeFileSync(files.chain, `${chain.join('\n')}\n`)
      }
    }
    const signtool = env.SIGNTOOL_PATH || newestSigntool(defaultKitsBin(env))
    const result = spawnSync(signtool, signtoolArguments(configuration.path, signing, files.certificate, files.chain), {
      stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0)
      throw new Error(`signtool.exe could not sign ${configuration.path} (exit code ${result.status}).`)
  }
  return { sign, publisherName: publisherName(certificate) }
}
