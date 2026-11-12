import { Encrypter } from 'age-encryption'

/**
 * Encrypts the bytes of a report file to each recipient. Only the holders of the matching identities can read it.
 *
 * @throws Error If the list has no recipient.
 */
export async function encryptReport(
  bytes: Uint8Array,
  recipients: readonly string[],
): Promise<Uint8Array<ArrayBuffer>> {
  if (recipients.length === 0) throw new Error('A report needs at least one recipient.')
  const encrypter = new Encrypter()
  for (const recipient of recipients) encrypter.addRecipient(recipient)
  const encrypted = await encrypter.encrypt(bytes)
  return encrypted.buffer instanceof ArrayBuffer ? (encrypted as Uint8Array<ArrayBuffer>) : encrypted.slice()
}
