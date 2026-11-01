import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  newestSigntool,
  publisherName,
  signtoolArguments,
  windowsSigner,
  windowsSigningFromEnv,
} from './windows-signing.ts'

const CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIB3zCCAYWgAwIBAgIUOdV+nFKanrrWIa36LChcX6ZdjJIwCgYIKoZIzj0EAwIw
RTELMAkGA1UEBhMCREsxGjAYBgNVBAoMEUV4YW1wbGUgUHVibGlzaGVyMRowGAYD
VQQDDBFFeGFtcGxlIFB1Ymxpc2hlcjAeFw0yNjExMDExNzQ1MzdaFw0zNjEwMjkx
NzQ1MzdaMEUxCzAJBgNVBAYTAkRLMRowGAYDVQQKDBFFeGFtcGxlIFB1Ymxpc2hl
cjEaMBgGA1UEAwwRRXhhbXBsZSBQdWJsaXNoZXIwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAASNQSz8oI4dIk6DsJrz/EHoJJQP223u0GGa+KDstfWrFSGcfeJcpI+b
Wvn8vJ4AzxXfQAhYn6HMsbhxDoSv0TGWo1MwUTAdBgNVHQ4EFgQUbPf1n7mIZnwh
R5NdVfr9olghBscwHwYDVR0jBBgwFoAUbPf1n7mIZnwhR5NdVfr9olghBscwDwYD
VR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEA6KI3viZyR3eN2XkLrT5G
MXPEDFvpQekzXwNKk4fxhewCICV2YRBhOjMSlm6BYHMXXlgJyUE7ze/HjkRPXyWW
d3Bn
-----END CERTIFICATE-----`

const CA_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBwjCCAWmgAwIBAgIUHts+DXmHS12NtaBPQV1jZ/H2T14wCgYIKoZIzj0EAwIw
NzETMBEGA1UECgwKRXhhbXBsZSBDQTEgMB4GA1UEAwwXRXhhbXBsZSBDb2RlIFNp
Z25pbmcgQ0EwHhcNMjYxMTAxMTc0NTM3WhcNMzYxMDI5MTc0NTM3WjA3MRMwEQYD
VQQKDApFeGFtcGxlIENBMSAwHgYDVQQDDBdFeGFtcGxlIENvZGUgU2lnbmluZyBD
QTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABLqgoq9UxDQ3m78J7JzuBEdL9mGV
H2JdS3fLH7ICHonGl0Zc09YFiwiDNg203WOqEHusbYPCvH4KKTkvutyfSsujUzBR
MB0GA1UdDgQWBBTd4fE2ALFDmaWO79SUemnTvQaIETAfBgNVHSMEGDAWgBTd4fE2
ALFDmaWO79SUemnTvQaIETAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0cA
MEQCIB9Tezn2Qy78U5CzEMG8ZX5IE6ErRCqdcFvQARZcsQyJAiACJQ5Ud9a46zV8
wZ6xB2/f1ZTFTYrd9T30u1bIg94Z4A==
-----END CERTIFICATE-----`

const KEY = 'projects/example/locations/europe-west1/keyRings/diagrams/cryptoKeys/authenticode/cryptoKeyVersions/1'

const folders: string[] = []

function tempFolder() {
  const folder = mkdtempSync(path.join(tmpdir(), 'windows-signing-test-'))
  folders.push(folder)
  return folder
}

function certificateFile(text: string) {
  const file = path.join(tempFolder(), 'certificate.pem')
  writeFileSync(file, text)
  return file
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('windowsSigningFromEnv', () => {
  it('leaves the build unsigned without a key or a certificate file', () => {
    expect(windowsSigningFromEnv({})).toBeNull()
    expect(windowsSigningFromEnv({ WINDOWS_SIGNING_KEY: KEY })).toBeNull()
    expect(windowsSigningFromEnv({ WINDOWS_SIGNING_CERTIFICATE_FILE: certificateFile(CERTIFICATE) })).toBeNull()
  })

  it('reads the certificate and the CA certificates after it, and a timestamp server', () => {
    const file = certificateFile(`${CERTIFICATE}
${CA_CERTIFICATE}
`)
    expect(windowsSigningFromEnv({ WINDOWS_SIGNING_KEY: KEY, WINDOWS_SIGNING_CERTIFICATE_FILE: file })).toEqual({
      key: KEY,
      certificates: [CERTIFICATE, CA_CERTIFICATE],
      timestampUrl: 'http://timestamp.digicert.com',
    })
    expect(
      windowsSigningFromEnv({
        WINDOWS_SIGNING_KEY: KEY,
        WINDOWS_SIGNING_CERTIFICATE_FILE: file,
        WINDOWS_SIGNING_TIMESTAMP_URL: 'http://timestamp.example.com',
      })?.timestampUrl,
    ).toBe('http://timestamp.example.com')
  })

  it('refuses a certificate file without a PEM certificate', () => {
    const file = certificateFile('not a certificate')
    expect(() => windowsSigningFromEnv({ WINDOWS_SIGNING_KEY: KEY, WINDOWS_SIGNING_CERTIFICATE_FILE: file })).toThrow(
      'has no PEM certificate',
    )
  })
})

describe('publisherName', () => {
  it('gives the common name of the certificate', () => {
    expect(publisherName(CERTIFICATE)).toBe('Example Publisher')
  })
})

describe('signtoolArguments', () => {
  const signing = { key: KEY, certificates: [CERTIFICATE], timestampUrl: 'http://timestamp.example.com' }

  it('signs with SHA-256, the Cloud KMS provider and an RFC 3161 timestamp', () => {
    expect(signtoolArguments('Diagrams.exe', signing, 'certificate.pem', null)).toEqual([
      'sign',
      '/fd',
      'sha256',
      '/tr',
      'http://timestamp.example.com',
      '/td',
      'sha256',
      '/f',
      'certificate.pem',
      '/csp',
      'Google Cloud KMS Provider',
      '/kc',
      KEY,
      'Diagrams.exe',
    ])
  })

  it('adds the CA certificates', () => {
    const args = signtoolArguments('Diagrams.exe', signing, 'certificate.pem', 'chain.pem')
    expect(args.slice(args.indexOf('/ac'), args.indexOf('/ac') + 2)).toEqual(['/ac', 'chain.pem'])
  })
})

describe('newestSigntool', () => {
  it('takes signtool.exe of the newest Windows SDK', () => {
    const bin = tempFolder()
    for (const version of ['10.0.22621.0', '10.0.26100.0', '10.0.9200.0']) {
      mkdirSync(path.join(bin, version, 'x64'), { recursive: true })
      writeFileSync(path.join(bin, version, 'x64', 'signtool.exe'), '')
    }
    mkdirSync(path.join(bin, '10.0.30000.0', 'x64'), { recursive: true })
    expect(newestSigntool(bin)).toBe(path.join(bin, '10.0.26100.0', 'x64', 'signtool.exe'))
  })

  it('says when no Windows SDK has signtool.exe', () => {
    expect(() => newestSigntool(path.join(tempFolder(), 'missing'))).toThrow('Install the Windows SDK')
  })
})

describe('windowsSigner', () => {
  it('leaves the build unsigned without the settings', () => {
    expect(windowsSigner({})).toBeNull()
  })

  it('gives the publisher name, and fails when signtool.exe cannot start', async () => {
    const signer = windowsSigner({
      WINDOWS_SIGNING_KEY: KEY,
      WINDOWS_SIGNING_CERTIFICATE_FILE: certificateFile(CERTIFICATE),
      SIGNTOOL_PATH: path.join(tempFolder(), 'signtool.exe'),
    })
    expect(signer?.publisherName).toBe('Example Publisher')
    const configuration = { path: 'Diagrams.exe' } as Parameters<NonNullable<typeof signer>['sign']>[0]
    await expect(signer!.sign(configuration)).rejects.toThrow('ENOENT')
  })
})
