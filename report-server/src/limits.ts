import { BlockList, isIP } from 'node:net'

const HOUR_MS = 60 * 60 * 1000
const MAX_TRACKED = 50_000
const IPV6_GROUPS = 8
const IPV6_NETWORK_GROUPS = 4
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

/** Counts requests for each client address in a fixed hour window, in memory only. */
export class HourlyLimit {
  readonly #counts = new Map<string, { windowStart: number; count: number }>()
  readonly #limit: number
  readonly #now: () => number

  constructor(limit: number, now: () => number = Date.now) {
    this.#limit = limit
    this.#now = now
  }

  /** Returns true and counts the request if the address has requests left in this hour. */
  take(address: string): boolean {
    const now = this.#now()
    const entry = this.#counts.get(address)
    if (!entry || now - entry.windowStart >= HOUR_MS) {
      if (this.#counts.size >= MAX_TRACKED) this.#prune(now)
      this.#counts.set(address, { windowStart: now, count: 1 })
      return true
    }
    if (entry.count >= this.#limit) return false
    entry.count++
    return true
  }

  #prune(now: number) {
    for (const [address, entry] of this.#counts) if (now - entry.windowStart >= HOUR_MS) this.#counts.delete(address)
    if (this.#counts.size >= MAX_TRACKED) this.#counts.clear()
  }
}

/** Counts the reports and the bytes of the current day in UTC. */
export class DailyQuota {
  #day = ''
  #reports = 0
  #bytes = 0
  readonly #maxReports: number
  readonly #maxBytes: number
  readonly #now: () => number

  constructor(maxReports: number, maxBytes: number, now: () => number = Date.now) {
    this.#maxReports = maxReports
    this.#maxBytes = maxBytes
    this.#now = now
  }

  /** Returns true and counts the report if the day has room for it. */
  take(bytes: number): boolean {
    const day = new Date(this.#now()).toISOString().slice(0, 10)
    if (day !== this.#day) {
      this.#day = day
      this.#reports = 0
      this.#bytes = 0
    }
    if (this.#reports + 1 > this.#maxReports || this.#bytes + bytes > this.#maxBytes) return false
    this.#reports++
    this.#bytes += bytes
    return true
  }

  /** Gives back a report that the server could not store. */
  release(bytes: number) {
    this.#reports = Math.max(0, this.#reports - 1)
    this.#bytes = Math.max(0, this.#bytes - bytes)
  }
}

interface AddressRange {
  address: string
  prefix: number
  family: 'ipv4' | 'ipv6'
}

function plainAddress(address: string): string {
  return MAPPED_IPV4.exec(address)?.[1] ?? address.split('%')[0]!
}

/**
 * Returns the parts of an address range such as `173.245.48.0/20`, or `null` if the text is not a range. A range
 * without a prefix holds one address.
 */
export function parseRange(range: string): AddressRange | null {
  const [address = '', prefixText, extra] = range.split('/')
  const version = isIP(address)
  if (version === 0 || extra !== undefined || (prefixText !== undefined && !/^\d{1,3}$/.test(prefixText))) return null
  const bits = version === 4 ? 32 : 128
  const prefix = prefixText === undefined ? bits : Number(prefixText)
  return prefix > bits ? null : { address, prefix, family: version === 4 ? 'ipv4' : 'ipv6' }
}

/** Returns a test that is true for an address in one of the ranges. The test ignores a range that {@link parseRange} rejects. */
export function inRanges(ranges: readonly string[]): (address: string) => boolean {
  const list = new BlockList()
  for (const range of ranges) {
    const parsed = parseRange(range)
    if (parsed) list.addSubnet(parsed.address, parsed.prefix, parsed.family)
  }
  return (address) => {
    const plain = plainAddress(address)
    const version = isIP(plain)
    return version !== 0 && list.check(plain, version === 4 ? 'ipv4' : 'ipv6')
  }
}

/**
 * Returns the address of the client: the peer address, or with proxies in front of the server, the address that the
 * outermost trusted proxy saw.
 *
 * @param peer - The socket address, or the client address that the nearest proxy reports in its own header.
 * @param forwardedFor - The `X-Forwarded-For` header, or `null`.
 * @param hops - The number of proxies in front of the server that add to the header.
 * @param isTrustedProxy - True for an address of a proxy in front of those, such as a CDN. The function then takes
 *   the address that this proxy added to the header.
 */
export function clientAddress(
  peer: string | null,
  forwardedFor: string | null,
  hops: number,
  isTrustedProxy: (address: string) => boolean = () => false,
): string {
  const forwarded = (forwardedFor ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  const chain = [...forwarded, peer ?? 'unknown']
  let index = Math.max(0, chain.length - 1 - hops)
  while (index > 0 && isTrustedProxy(chain[index]!)) index--
  return chain[index]!
}

/** Returns the key that the rate limits count an address under: an IPv4 address, or the /64 network of an IPv6 address. */
export function limitKey(address: string): string {
  const bare = plainAddress(address)
  if (isIP(bare) !== 6) return bare
  const [head = '', tail] = bare.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === undefined || tail === '' ? [] : tail.split(':')
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(IPV6_GROUPS - left.length - right.length).fill('0'), ...right]
  const network = groups.slice(0, IPV6_NETWORK_GROUPS).map((group) => Number.parseInt(group, 16).toString(16))
  return `${network.join(':')}::/64`
}
