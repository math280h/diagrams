import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  appImageSignatureSections,
  type BlockMap,
  type ElfSection,
  embeddedBlockMap,
  hashWithBlankSections,
  readBlockMap,
} from './appimage.ts'

const BLOCK_MAP_LENGTH_BYTES = 4
const MAX_GPG_OUTPUT_BYTES = 1024 * 1024
const MAX_SIGNATURE_UPDATE_BYTES = 1024 * 1024
const KEY_ID_LENGTH = 16
const VALIDATE_URL =
  'https://github.com/AppImageCommunity/AppImageUpdate/releases/download/2.0.0-alpha-1-20251018/validate-x86_64.AppImage'
const VALIDATE_SHA256 = 'b10c8d39a0a917432af185afc92f1cd54b7f68aa70deda927acacf38ded84990'
export const CHECKSUMS_FILE = 'SHA256SUMS'
export const LINUX_UPDATE_INFO_FILE = 'latest-linux.yml'

interface Operation {
  kind: number
  start: number
  end: number
}

interface UpdaterLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  debug(message: string): void
}

const QUIET_LOGGER: UpdaterLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
}

interface Libraries {
  appendBlockmap: (file: string) => Promise<{ blockMapSize?: number }>
  computeOperations: (oldBlockMap: BlockMap, newBlockMap: BlockMap, logger: UpdaterLogger) => Operation[]
  OperationKind: { COPY: number; DOWNLOAD: number }
  yaml: { load: (text: string) => unknown; dump: (value: unknown, options: { lineWidth: number }) => string }
}

let loaded: Libraries | null = null

function libraries(): Libraries {
  if (loaded) return loaded
  const fromHere = createRequire(import.meta.url)
  const fromElectronBuilder = createRequire(fromHere.resolve('electron-builder'))
  const fromElectronUpdater = createRequire(fromHere.resolve('electron-updater'))
  const { appendBlockmap } = fromElectronBuilder('app-builder-lib/out/targets/differentialUpdateInfoBuilder') as Pick<
    Libraries,
    'appendBlockmap'
  >
  const { computeOperations, OperationKind } = fromHere(
    'electron-updater/out/differentialDownloader/downloadPlanBuilder',
  ) as Pick<Libraries, 'computeOperations' | 'OperationKind'>
  const yaml = fromElectronUpdater('js-yaml') as Libraries['yaml']
  loaded = { appendBlockmap, computeOperations, OperationKind, yaml }
  return loaded
}

/** Makes ASCII-armored OpenPGP signatures with one key and exports its public key. */
export interface OpenPgpSigner {
  /** Returns a detached signature of the data. */
  sign(data: Uint8Array): Buffer
  /** Writes a detached signature of a file to the output file. */
  signFile(file: string, output: string): void
  /** Returns the public key. */
  publicKey(): Buffer
}

function gpg(args: readonly string[], input?: Uint8Array): Buffer {
  const result = spawnSync('gpg', ['--batch', '--no-tty', ...args], { input, maxBuffer: MAX_GPG_OUTPUT_BYTES })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`gpg ${args.join(' ')} failed:\n${result.stderr.toString()}`)
  return result.stdout
}

/** Returns a signer that uses gpg with the primary key of the fingerprint. */
export function gpgSigner(fingerprint: string): OpenPgpSigner {
  const key = `${fingerprint}!`
  return {
    sign: (data) => gpg(['--local-user', key, '--armor', '--detach-sign'], data),
    signFile: (file, output) => {
      gpg(['--yes', '--local-user', key, '--armor', '--detach-sign', '--output', output, file])
    },
    publicKey: () => gpg(['--armor', '--export', fingerprint]),
  }
}

/** The size and hash of a signed file, as `latest-linux.yml` lists them. */
export interface SignedFile {
  size: number
  /** The SHA-512 of the file in base64. */
  sha512: string
  blockMapSize?: number
}

function sha512(file: Uint8Array): string {
  return createHash('sha512').update(file).digest('base64')
}

function embed(file: Uint8Array, section: ElfSection, data: Uint8Array) {
  if (data.byteLength > section.size) {
    throw new Error(`The data for ${section.name} has ${data.byteLength} bytes, but the section has ${section.size}.`)
  }
  file.fill(0, section.offset, section.offset + section.size)
  file.set(data, section.offset)
}

/**
 * Signs an AppImage that electron-builder built, in the format of `appimagetool --sign`. Differential updates to the
 * signed AppImage stay possible.
 *
 * @throws Error If the AppImage has no block map, or if its signature sections are not empty.
 */
export async function signAppImage(file: string, signer: OpenPgpSigner): Promise<SignedFile> {
  const built = readFileSync(file)
  const image = built.subarray(0, embeddedBlockMap(built).start)
  const sections = appImageSignatureSections(image)
  for (const section of sections) {
    if (image.subarray(section.offset, section.offset + section.size).some((byte) => byte !== 0)) {
      throw new Error(`The ${section.name} section of ${file} is not empty. An AppImage can be signed only once.`)
    }
    image.set(randomBytes(section.size), section.offset)
  }
  writeFileSync(file, image)
  const { blockMapSize } = await libraries().appendBlockmap(file)
  const signed = readFileSync(file)
  const [digest, signature, key] = sections
  embed(signed, digest, hashWithBlankSections(signed, sections, 'md5'))
  const hexDigest = hashWithBlankSections(signed, [signature, key], 'sha256').toString('hex')
  embed(signed, signature, signer.sign(Buffer.from(hexDigest)))
  embed(signed, key, signer.publicKey())
  writeFileSync(file, signed)
  return { size: signed.byteLength, sha512: sha512(signed), ...(blockMapSize === undefined ? {} : { blockMapSize }) }
}

/**
 * Returns the parts of a signed AppImage that a signature check reads: the SHA-256 of the file without the signature
 * and the key, the ASCII-armored signature and the public key.
 */
export function appImageSignature(image: Uint8Array): { hexDigest: string; signature: string; key: string } {
  const [, signature, key] = appImageSignatureSections(image)
  const text = (section: ElfSection) => {
    const data = image.subarray(section.offset, section.offset + section.size)
    const end = data.indexOf(0)
    return Buffer.from(end === -1 ? data : data.subarray(0, end)).toString()
  }
  return {
    hexDigest: hashWithBlankSections(image, [signature, key], 'sha256').toString('hex'),
    signature: text(signature),
    key: text(key),
  }
}

/** Adds an OpenPGP origin signature to a deb package with debsigs. */
export function signDeb(file: string, fingerprint: string): SignedFile {
  const result = spawnSync('debsigs', ['--sign=origin', `--default-key=${fingerprint}!`, file], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`debsigs failed for ${file}:\n${result.stderr}`)
  const signed = readFileSync(file)
  return { size: signed.byteLength, sha512: sha512(signed) }
}

interface UpdateInfo {
  files: ({ url: string } & SignedFile)[]
  path?: string
  sha512?: string
}

/**
 * Returns `latest-linux.yml` with the sizes and hashes of the signed files.
 *
 * @param signed - The signed files by file name.
 * @throws Error If a signed file is not in the update information.
 */
export function withSignedFiles(updateInfo: string, signed: ReadonlyMap<string, SignedFile>): string {
  const { yaml } = libraries()
  const info = yaml.load(updateInfo) as UpdateInfo
  for (const [name, file] of signed) {
    const entry = info.files.find((candidate) => candidate.url === name)
    if (!entry) throw new Error(`${LINUX_UPDATE_INFO_FILE} does not list ${name}.`)
    entry.size = file.size
    entry.sha512 = file.sha512
    if (file.blockMapSize !== undefined) entry.blockMapSize = file.blockMapSize
    if (info.path === name) info.sha512 = file.sha512
  }
  return yaml.dump(info, { lineWidth: 8000 })
}

/** Returns the lines of a `SHA256SUMS` file for the files, in the format of `sha256sum`. */
export function checksums(folder: string, names: readonly string[]): string {
  return names
    .toSorted()
    .map(
      (name) =>
        `${createHash('sha256')
          .update(readFileSync(path.join(folder, name)))
          .digest('hex')}  ${name}\n`,
    )
    .join('')
}

/** The result of a differential update in the way of electron-updater. */
export interface UpdatePlan {
  /** The bytes that come from the new file. */
  downloadBytes: number
  /** The bytes that come from the old file. */
  copyBytes: number
  /** If true, the result has the size and SHA-512 that the update information gives. */
  matches: boolean
}

/**
 * Does a differential update from an old AppImage to a new one in the way of electron-updater, and checks the result
 * against the update information of the new AppImage.
 *
 * @throws Error If the block maps have different versions, so that electron-updater downloads the whole file.
 */
export function simulateUpdate(oldImage: Uint8Array, newImage: Uint8Array, newInfo: SignedFile): UpdatePlan {
  if (newInfo.blockMapSize === undefined) throw new Error('The update information of the AppImage has no blockMapSize.')
  const metadata = newImage.subarray(newInfo.size - (newInfo.blockMapSize + BLOCK_MAP_LENGTH_BYTES), newInfo.size)
  const newBlockMap = readBlockMap(metadata)
  const oldBlockMap = embeddedBlockMap(oldImage).blockMap
  if (oldBlockMap.version !== newBlockMap.version) {
    throw new Error(`The block maps have versions ${oldBlockMap.version} and ${newBlockMap.version}.`)
  }
  const { computeOperations, OperationKind } = libraries()
  const parts: Uint8Array[] = []
  let downloadBytes = 0
  let copyBytes = 0
  for (const operation of computeOperations(oldBlockMap, newBlockMap, QUIET_LOGGER)) {
    const fromNew = operation.kind === OperationKind.DOWNLOAD
    parts.push((fromNew ? newImage : oldImage).subarray(operation.start, operation.end))
    if (fromNew) downloadBytes += operation.end - operation.start
    else copyBytes += operation.end - operation.start
  }
  parts.push(metadata)
  const result = Buffer.concat(parts)
  return { downloadBytes, copyBytes, matches: result.byteLength === newInfo.size && sha512(result) === newInfo.sha512 }
}

function filesWithSuffix(folder: string, suffix: string): string[] {
  return readdirSync(folder).filter((name) => name.endsWith(suffix))
}

async function signFolder(folder: string, fingerprint: string) {
  const signer = gpgSigner(fingerprint)
  const signed = new Map<string, SignedFile>()
  for (const name of filesWithSuffix(folder, '.AppImage')) {
    signed.set(name, await signAppImage(path.join(folder, name), signer))
  }
  for (const name of filesWithSuffix(folder, '.deb')) signed.set(name, signDeb(path.join(folder, name), fingerprint))
  if (signed.size === 0) throw new Error(`${folder} has no AppImage and no deb package.`)
  for (const name of signed.keys()) signer.signFile(path.join(folder, name), path.join(folder, `${name}.asc`))
  const infoFile = path.join(folder, LINUX_UPDATE_INFO_FILE)
  const info = readdirSync(folder).includes(LINUX_UPDATE_INFO_FILE) ? readFileSync(infoFile, 'utf8') : null
  if (info !== null) writeFileSync(infoFile, withSignedFiles(info, signed))
  for (const [name, file] of signed) console.log(`Signed ${name}: ${file.size} bytes.`)
  if (info === null) console.log(`${folder} has no ${LINUX_UPDATE_INFO_FILE}.`)
}

function checkSignature(file: string, fingerprint: string) {
  const result = spawnSync('gpg', ['--batch', '--status-fd', '1', '--verify', `${file}.asc`, file], {
    encoding: 'utf8',
  })
  if (result.status !== 0 || !result.stdout.includes(`[GNUPG:] VALIDSIG ${fingerprint}`)) {
    throw new Error(`${path.basename(file)}.asc is not a valid signature of ${fingerprint}:\n${result.stderr}`)
  }
}

function writeChecksums(folder: string, fingerprint: string | undefined) {
  const names = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== CHECKSUMS_FILE && entry.name !== `${CHECKSUMS_FILE}.asc`)
    .map((entry) => entry.name)
  const output = path.join(folder, CHECKSUMS_FILE)
  writeFileSync(output, checksums(folder, names))
  if (fingerprint) {
    gpgSigner(fingerprint).signFile(output, `${output}.asc`)
    checkSignature(output, fingerprint)
  }
  console.log(`Wrote ${CHECKSUMS_FILE} for ${names.length} files${fingerprint ? ' and signed it' : ''}.`)
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(command, args, { encoding: 'utf8', env })
  if (result.error) throw result.error
  const output = `${result.stdout}${result.stderr}`
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${output}`)
  return output
}

async function validateTool(folder: string): Promise<string> {
  const response = await fetch(VALIDATE_URL)
  if (!response.ok) throw new Error(`The download of ${VALIDATE_URL} failed with status ${response.status}.`)
  const data = Buffer.from(await response.arrayBuffer())
  const hash = createHash('sha256').update(data).digest('hex')
  if (hash !== VALIDATE_SHA256) throw new Error(`${VALIDATE_URL} has the SHA-256 ${hash}, not ${VALIDATE_SHA256}.`)
  const file = path.join(folder, 'validate.AppImage')
  writeFileSync(file, data)
  chmodSync(file, 0o755)
  return file
}

function checkDeb(file: string, fingerprint: string, folder: string) {
  const keyId = fingerprint.slice(-KEY_ID_LENGTH)
  const policies = path.join(folder, 'policies', keyId)
  const keyrings = path.join(folder, 'keyrings', keyId)
  mkdirSync(policies, { recursive: true })
  mkdirSync(keyrings, { recursive: true })
  writeFileSync(path.join(keyrings, 'debsig.gpg'), gpg(['--export', fingerprint]))
  writeFileSync(
    path.join(policies, 'diagrams.pol'),
    `<?xml version="1.0"?>
<!DOCTYPE Policy SYSTEM "https://www.debian.org/debsig/1.0/policy.dtd">
<Policy xmlns="https://www.debian.org/debsig/1.0/">
  <Origin Name="Diagrams" id="${keyId}" Description="Diagrams releases"/>
  <Selection>
    <Required Type="origin" File="debsig.gpg" id="${keyId}"/>
  </Selection>
  <Verification MinOptional="0">
    <Required Type="origin" File="debsig.gpg" id="${keyId}"/>
  </Verification>
</Policy>
`,
  )
  run('debsig-verify', [
    '--policies-dir',
    path.join(folder, 'policies'),
    '--keyrings-dir',
    path.join(folder, 'keyrings'),
    file,
  ])
}

function checkUpdateInfo(folder: string): UpdateInfo | null {
  if (!readdirSync(folder).includes(LINUX_UPDATE_INFO_FILE)) return null
  const info = libraries().yaml.load(readFileSync(path.join(folder, LINUX_UPDATE_INFO_FILE), 'utf8')) as UpdateInfo
  for (const entry of info.files) {
    const data = readFileSync(path.join(folder, entry.url))
    if (data.byteLength !== entry.size || sha512(data) !== entry.sha512) {
      throw new Error(`${LINUX_UPDATE_INFO_FILE} gives another size or SHA-512 for ${entry.url}.`)
    }
    if (entry.url.endsWith('.AppImage')) {
      const { start } = embeddedBlockMap(data)
      if (data.byteLength - start - BLOCK_MAP_LENGTH_BYTES !== entry.blockMapSize) {
        throw new Error(`${LINUX_UPDATE_INFO_FILE} gives another blockMapSize for ${entry.url}.`)
      }
    }
  }
  return info
}

async function checkFolder(folder: string, fingerprint: string, unsigned: string) {
  const temp = mkdtempSync(path.join(tmpdir(), 'openpgp-check-'))
  try {
    const appImages = filesWithSuffix(folder, '.AppImage')
    const debs = filesWithSuffix(folder, '.deb')
    if (appImages.length !== 1) throw new Error(`${folder} must hold one AppImage, not ${appImages.length}.`)
    const validate = await validateTool(temp)
    for (const name of appImages) {
      const output = run(validate, [path.join(folder, name)], { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' })
      if (!output.includes('Validation successful') || !output.includes(fingerprint)) {
        throw new Error(`validate does not report a valid signature of ${fingerprint} for ${name}:\n${output}`)
      }
      console.log(`${name}: the embedded signature of ${fingerprint} is valid.`)
    }
    for (const name of debs) {
      checkDeb(path.join(folder, name), fingerprint, path.join(temp, 'debsig'))
      console.log(`${name}: debsig-verify accepts the origin signature.`)
    }
    for (const name of [...appImages, ...debs]) {
      checkSignature(path.join(folder, name), fingerprint)
      console.log(`${name}.asc: the detached signature is valid.`)
    }
    const info = checkUpdateInfo(folder)
    const [appImage] = appImages
    const signedImage = readFileSync(path.join(folder, appImage!))
    const entry = info?.files.find((candidate) => candidate.url === appImage) ?? {
      size: signedImage.byteLength,
      sha512: sha512(signedImage),
      blockMapSize: signedImage.byteLength - embeddedBlockMap(signedImage).start - BLOCK_MAP_LENGTH_BYTES,
    }
    const plan = simulateUpdate(readFileSync(unsigned), signedImage, entry)
    console.log(
      `Differential update from the unsigned AppImage: ${plan.downloadBytes} bytes to download, ` +
        `${plan.copyBytes} bytes from the old file.`,
    )
    if (!plan.matches) throw new Error('The differential update does not give the signed AppImage.')
    if (plan.downloadBytes > MAX_SIGNATURE_UPDATE_BYTES) {
      throw new Error(`The differential update downloads more than ${MAX_SIGNATURE_UPDATE_BYTES} bytes.`)
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

const USAGE = `Usage:
  node scripts/openpgp-signing.ts sign <folder> --fingerprint <fingerprint>
  node scripts/openpgp-signing.ts check <folder> --fingerprint <fingerprint> --unsigned <AppImage before the signature>
  node scripts/openpgp-signing.ts checksums <folder> [--fingerprint <fingerprint>]`

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { fingerprint: { type: 'string' }, unsigned: { type: 'string' } },
  })
  const [command, folder] = positionals
  const { fingerprint, unsigned } = values
  if (command === 'sign' && folder && fingerprint) await signFolder(folder, fingerprint)
  else if (command === 'check' && folder && fingerprint && unsigned) await checkFolder(folder, fingerprint, unsigned)
  else if (command === 'checksums' && folder) writeChecksums(folder, fingerprint)
  else throw new Error(USAGE)
}

if (import.meta.main) await main()
