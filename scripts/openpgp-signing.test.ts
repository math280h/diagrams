import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appImageSignatureSections, embeddedBlockMap, hashWithBlankSections, runtimeSha256 } from './appimage.ts'
import {
  appImageSignature,
  checksums,
  gpgSigner,
  type OpenPgpSigner,
  signAppImage,
  simulateUpdate,
  withSignedFiles,
} from './openpgp-signing.ts'

const fromHere = createRequire(import.meta.url)
const { appendBlockmap } = createRequire(fromHere.resolve('electron-builder'))(
  'app-builder-lib/out/targets/differentialUpdateInfoBuilder',
) as { appendBlockmap: (file: string) => Promise<{ size: number; sha512: string; blockMapSize: number }> }

const SECTIONS = [
  { name: '.digest_md5', offset: 300, size: 16 },
  { name: '.sha256_sig', offset: 316, size: 1024 },
  { name: '.sig_key', offset: 1340, size: 8192 },
]
const TABLE_OFFSET = 9600
const RUNTIME_SIZE = 10_000
const PAYLOAD_SIZE = 1_000_000

const BUILD_TIMEOUT_MS = 30_000

const folders: string[] = []

function tempFolder() {
  const folder = mkdtempSync(path.join(tmpdir(), 'openpgp-signing-test-'))
  folders.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function runtime(): Buffer {
  const file = Buffer.alloc(RUNTIME_SIZE)
  file.writeUInt32BE(0x7f454c46, 0)
  file.writeUInt8(2, 4)
  file.writeUInt8(1, 5)
  file.writeBigUInt64LE(BigInt(TABLE_OFFSET), 0x28)
  file.writeUInt16LE(64, 0x3a)
  file.writeUInt16LE(SECTIONS.length + 1, 0x3c)
  file.writeUInt16LE(SECTIONS.length, 0x3e)
  let nameOffset = 1
  SECTIONS.forEach((section, index) => {
    const entry = TABLE_OFFSET + index * 64
    file.write(section.name, 64 + nameOffset)
    file.writeUInt32LE(nameOffset, entry)
    file.writeUInt32LE(1, entry + 4)
    file.writeBigUInt64LE(BigInt(section.offset), entry + 0x18)
    file.writeBigUInt64LE(BigInt(section.size), entry + 0x20)
    nameOffset += section.name.length + 1
  })
  const names = TABLE_OFFSET + SECTIONS.length * 64
  file.writeUInt32LE(3, names + 4)
  file.writeBigUInt64LE(64n, names + 0x18)
  file.writeBigUInt64LE(BigInt(nameOffset), names + 0x20)
  return file
}

async function builtAppImage(folder: string, name = 'Diagrams.AppImage', payload = randomBytes(PAYLOAD_SIZE)) {
  const file = path.join(folder, name)
  writeFileSync(file, Buffer.concat([runtime(), payload]))
  const info = await appendBlockmap(file)
  return { file, info, payload }
}

function armored(kind: string, body: string) {
  return Buffer.from(`-----BEGIN PGP ${kind}-----\n\n${body}\n-----END PGP ${kind}-----\n`)
}

const fakeSigner: OpenPgpSigner = {
  sign: (data) => armored('SIGNATURE', createHash('sha256').update(data).digest('base64')),
  signFile: (file, output) => writeFileSync(output, fakeSigner.sign(readFileSync(file))),
  publicKey: () => armored('PUBLIC KEY BLOCK', 'test key'),
}

describe('signAppImage', { timeout: BUILD_TIMEOUT_MS }, () => {
  it('embeds the signature of the digest and the public key, in the format of appimagetool', async () => {
    const { file } = await builtAppImage(tempFolder())
    const info = await signAppImage(file, fakeSigner)
    const signed = readFileSync(file)
    const signature = appImageSignature(signed)
    expect(signature.signature).toBe(fakeSigner.sign(Buffer.from(signature.hexDigest)).toString())
    expect(signature.key).toBe(fakeSigner.publicKey().toString())
    const sections = appImageSignatureSections(signed)
    const [digest] = sections
    expect(signed.subarray(digest.offset, digest.offset + digest.size)).toEqual(
      hashWithBlankSections(signed, sections, 'md5'),
    )
    expect(info).toEqual({
      size: signed.byteLength,
      sha512: createHash('sha512').update(signed).digest('base64'),
      blockMapSize: expect.any(Number),
    })
    expect(embeddedBlockMap(signed).start).toBe(signed.byteLength - 4 - info.blockMapSize!)
  })

  it('keeps the runtime and the payload as electron-builder built them', async () => {
    const built = await builtAppImage(tempFolder())
    const before = readFileSync(built.file)
    await signAppImage(built.file, fakeSigner)
    const signed = readFileSync(built.file)
    expect(runtimeSha256(signed)).toBe(runtimeSha256(before))
    expect(signed.subarray(RUNTIME_SIZE, RUNTIME_SIZE + PAYLOAD_SIZE)).toEqual(built.payload)
  })

  it('keeps differential updates small, from the unsigned and from an earlier signed AppImage', async () => {
    const folder = tempFolder()
    const payload = randomBytes(PAYLOAD_SIZE)
    const unsigned = await builtAppImage(folder, 'unsigned.AppImage', payload)
    const earlier = await builtAppImage(folder, 'earlier.AppImage', payload)
    const current = await builtAppImage(folder, 'current.AppImage', payload)
    const unsignedImage = readFileSync(unsigned.file)
    await signAppImage(earlier.file, fakeSigner)
    const info = await signAppImage(current.file, fakeSigner)
    const currentImage = readFileSync(current.file)
    for (const oldImage of [unsignedImage, readFileSync(earlier.file)]) {
      const plan = simulateUpdate(oldImage, currentImage, info)
      expect(plan.matches).toBe(true)
      expect(plan.downloadBytes).toBeGreaterThan(0)
      expect(plan.downloadBytes).toBeLessThan(PAYLOAD_SIZE / 10)
    }
  })

  it('refuses an AppImage that has a signature already', async () => {
    const { file } = await builtAppImage(tempFolder())
    await signAppImage(file, fakeSigner)
    await expect(signAppImage(file, fakeSigner)).rejects.toThrow('An AppImage can be signed only once.')
  })

  it('refuses a signature that is larger than its section', async () => {
    const { file } = await builtAppImage(tempFolder())
    const large = { ...fakeSigner, sign: () => Buffer.alloc(1025, 65) }
    await expect(signAppImage(file, large)).rejects.toThrow('The data for .sha256_sig has 1025 bytes')
  })

  it('refuses a file without a block map', async () => {
    const file = path.join(tempFolder(), 'plain.AppImage')
    writeFileSync(file, runtime())
    await expect(signAppImage(file, fakeSigner)).rejects.toThrow('The file does not end with a block map.')
  })
})

describe('simulateUpdate', { timeout: BUILD_TIMEOUT_MS }, () => {
  it('reports a result that does not match the update information', async () => {
    const folder = tempFolder()
    const old = await builtAppImage(folder, 'old.AppImage')
    const current = await builtAppImage(folder, 'current.AppImage')
    const plan = simulateUpdate(readFileSync(old.file), readFileSync(current.file), {
      ...current.info,
      sha512: old.info.sha512,
    })
    expect(plan.matches).toBe(false)
  })
})

describe('withSignedFiles', () => {
  const updateInfo = `version: 1.2.3
files:
  - url: Diagrams-1.2.3-linux-x86_64.AppImage
    sha512: old-appimage
    size: 10
    blockMapSize: 2
  - url: Diagrams-1.2.3-linux-amd64.deb
    sha512: old-deb
    size: 20
path: Diagrams-1.2.3-linux-x86_64.AppImage
sha512: old-appimage
releaseDate: '2026-11-02T12:00:00.000Z'
`

  it('gives the size, hash and block map size of each signed file', () => {
    const signed = new Map([
      ['Diagrams-1.2.3-linux-x86_64.AppImage', { size: 11, sha512: 'new-appimage', blockMapSize: 3 }],
      ['Diagrams-1.2.3-linux-amd64.deb', { size: 21, sha512: 'new-deb' }],
    ])
    expect(withSignedFiles(updateInfo, signed)).toBe(`version: 1.2.3
files:
  - url: Diagrams-1.2.3-linux-x86_64.AppImage
    sha512: new-appimage
    size: 11
    blockMapSize: 3
  - url: Diagrams-1.2.3-linux-amd64.deb
    sha512: new-deb
    size: 21
path: Diagrams-1.2.3-linux-x86_64.AppImage
sha512: new-appimage
releaseDate: '2026-11-02T12:00:00.000Z'
`)
  })

  it('refuses a signed file that the update information does not list', () => {
    const signed = new Map([['Other.AppImage', { size: 1, sha512: 'x' }]])
    expect(() => withSignedFiles(updateInfo, signed)).toThrow('latest-linux.yml does not list Other.AppImage.')
  })
})

describe('checksums', () => {
  it('lists the SHA-256 of each file in the format of sha256sum, sorted by name', () => {
    const folder = tempFolder()
    writeFileSync(path.join(folder, 'b.deb'), 'b')
    writeFileSync(path.join(folder, 'a.AppImage'), 'a')
    const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
    expect(checksums(folder, ['b.deb', 'a.AppImage'])).toBe(`${sha256('a')}  a.AppImage\n${sha256('b')}  b.deb\n`)
  })
})

const signsOnThisSystem = process.platform !== 'win32' && spawnSync('gpg', ['--version']).status === 0

describe.skipIf(!signsOnThisSystem)('gpgSigner', { timeout: BUILD_TIMEOUT_MS }, () => {
  it('signs the digest of an AppImage so that gpg verifies it with the embedded key', async () => {
    const folder = tempFolder()
    const home = path.join(folder, 'gnupg')
    const previousHome = process.env.GNUPGHOME
    process.env.GNUPGHOME = home
    try {
      const gpg = (args: string[], input?: string) => {
        const result = spawnSync('gpg', ['--batch', '--no-tty', ...args], { input, encoding: 'utf8' })
        expect(result.status, result.stderr).toBe(0)
        return result.stdout
      }
      mkdirSync(home, { mode: 0o700 })
      gpg([
        '--passphrase',
        '',
        '--quick-generate-key',
        'Diagrams test <test@example.invalid>',
        'ed25519',
        'sign',
        'never',
      ])
      const fingerprint = /^fpr:+([0-9A-F]+):/m.exec(gpg(['--with-colons', '--list-keys']))![1]!
      const { file } = await builtAppImage(folder)
      await signAppImage(file, gpgSigner(fingerprint))
      const { hexDigest, signature, key } = appImageSignature(readFileSync(file))
      const check = path.join(folder, 'check')
      mkdirSync(check, { mode: 0o700 })
      gpg(['--homedir', check, '--import'], key)
      writeFileSync(path.join(folder, 'digest'), hexDigest)
      writeFileSync(path.join(folder, 'digest.asc'), signature)
      const verify = spawnSync(
        'gpg',
        ['--batch', '--homedir', check, '--status-fd', '1', '--verify', 'digest.asc', 'digest'],
        { cwd: folder, encoding: 'utf8' },
      )
      expect(verify.stdout).toContain(`[GNUPG:] VALIDSIG ${fingerprint}`)
    } finally {
      if (previousHome === undefined) delete process.env.GNUPGHOME
      else process.env.GNUPGHOME = previousHome
      spawnSync('gpgconf', ['--homedir', home, '--kill', 'all'])
      spawnSync('gpgconf', ['--homedir', path.join(folder, 'check'), '--kill', 'all'])
    }
  })
})
