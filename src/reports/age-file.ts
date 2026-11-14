/** The first line of each age file. */
export const AGE_HEADER = 'age-encryption.org/v1\n'

const RECIPIENT = /^age1(?:pq1)?[02-9ac-hj-np-z]{58,}$/

/** Returns true for an age recipient, such as `age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq`. */
export function isAgeRecipient(text: string): boolean {
  return RECIPIENT.test(text)
}

/** Returns true if the bytes start with the header of an age file. */
export function isAgeFile(bytes: Uint8Array): boolean {
  const header = new TextEncoder().encode(AGE_HEADER)
  if (bytes.length < header.length) return false
  return header.every((byte, index) => bytes[index] === byte)
}
