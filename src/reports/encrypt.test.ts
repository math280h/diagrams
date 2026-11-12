import { Decrypter, generateHybridIdentity, generateX25519Identity, identityToRecipient } from 'age-encryption'
import { describe, expect, it } from 'vitest'
import { isAgeFile, isAgeRecipient } from './age-file'
import { encryptReport } from './encrypt'

describe('encryptReport', () => {
  it('encrypts to each recipient, and only their identities read the report', async () => {
    const first = await generateX25519Identity()
    const second = await generateHybridIdentity()
    const stranger = await generateX25519Identity()
    const recipients = [await identityToRecipient(first), await identityToRecipient(second)]
    for (const recipient of recipients) expect(isAgeRecipient(recipient)).toBe(true)
    const bytes = new TextEncoder().encode('{"title":"report"}')
    const encrypted = await encryptReport(bytes, recipients)
    expect(isAgeFile(encrypted)).toBe(true)
    for (const identity of [first, second]) {
      const decrypter = new Decrypter()
      decrypter.addIdentity(identity)
      expect(await decrypter.decrypt(encrypted)).toEqual(bytes)
    }
    const other = new Decrypter()
    other.addIdentity(stranger)
    await expect(other.decrypt(encrypted)).rejects.toThrow()
  })

  it('needs a recipient', async () => {
    await expect(encryptReport(new Uint8Array(1), [])).rejects.toThrow('A report needs at least one recipient.')
  })
})

describe('isAgeRecipient', () => {
  it('refuses identities and other texts', () => {
    expect(isAgeRecipient('AGE-SECRET-KEY-1QQQ')).toBe(false)
    expect(isAgeRecipient('age1short')).toBe(false)
    expect(isAgeRecipient('ssh-ed25519 AAAA')).toBe(false)
  })
})

describe('isAgeFile', () => {
  it('needs the age header at the start', () => {
    expect(isAgeFile(new TextEncoder().encode('age-encryption.org/v1\n-> X25519'))).toBe(true)
    expect(isAgeFile(new TextEncoder().encode('age-encryption.org/v2\n'))).toBe(false)
    expect(isAgeFile(new Uint8Array(0))).toBe(false)
  })
})
