const PROBABILITY_BITS = 12
const PROBABILITY_ONE = 1 << PROBABILITY_BITS
const STRETCH_LIMIT = 2047
/** The logistic curve at 33 points, from -8 to 8 in steps of 0.5, scaled to 12 bits. */
const SQUASH_POINTS = [
  1, 2, 4, 6, 10, 17, 27, 45, 74, 120, 194, 311, 488, 747, 1102, 1546, 2048, 2550, 2994, 3349, 3608, 3785, 3902, 3976,
  4022, 4051, 4069, 4079, 4086, 4090, 4092, 4094, 4095,
]
const COUNTER_ONE = 65535
const COUNTER_START = 32768
const COUNT_LIMIT = 127
const ORDERS = [1, 2, 3, 4, 6]
const TABLE_BITS = 20
const MIXER_START_WEIGHT = 16384
const MIXER_BIAS = 256
const LEARNING_RATE = 6
const LEARNING_SHIFT = 14
const MATCH_MIN_BYTES = 6
const MATCH_TABLE_BITS = 18
const MATCH_LONGEST_COUNTED = 31
const APM_POINTS = 33
const APM2_CONTEXT_BITS = 16
const QUOTE = 34
const COLON = 58
const SALT_WORD = 101
const SALT_KEY = 202
const SALT_ORDER0 = 303
const SALT_KEY_WORD = 404

function squash(stretched: number): number {
  const d = Math.max(-STRETCH_LIMIT, Math.min(STRETCH_LIMIT, stretched))
  const weight = d & 127
  const index = (d >> 7) + 16
  const p = (SQUASH_POINTS[index]! * (128 - weight) + SQUASH_POINTS[index + 1]! * weight + 64) >> 7
  return Math.max(1, Math.min(PROBABILITY_ONE - 1, p))
}

const STRETCH = (() => {
  const table = new Int16Array(PROBABILITY_ONE)
  let next = 0
  for (let d = -STRETCH_LIMIT; d <= STRETCH_LIMIT; d++) {
    const p = squash(d)
    for (let j = next; j <= p; j++) table[j] = d
    next = p + 1
  }
  table.fill(STRETCH_LIMIT, next)
  return table
})()

/** The share of the error that a counter takes after `n` updates, out of 65536. */
const RATE = Int32Array.from({ length: COUNT_LIMIT + 1 }, (_, n) => Math.floor(65536 / (n + 1.5)))

const mix32 = (a: number, b: number) => Math.imul((a ^ Math.imul(b, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0
const isWordByte = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)

function apmTable(contexts: number): Uint16Array {
  const table = new Uint16Array(contexts * APM_POINTS)
  for (let c = 0; c < contexts; c++) {
    for (let j = 0; j < APM_POINTS; j++) table[c * APM_POINTS + j] = squash((j - 16) * 128) * 16
  }
  return table
}

/** Predicts the next bit from the bytes so far, with the same result on every engine: it uses integers only. */
class Model {
  private readonly contexts = ORDERS.length + 4
  private readonly counters = Array.from({ length: this.contexts }, () =>
    new Uint16Array(1 << TABLE_BITS).fill(COUNTER_START),
  )
  private readonly counts = Array.from({ length: this.contexts }, () => new Uint8Array(1 << TABLE_BITS))
  private readonly hashes = new Uint32Array(this.contexts)
  private readonly slots = new Uint32Array(this.contexts)
  private readonly inputs = new Int32Array(this.contexts + 2)
  private readonly weights = new Int32Array(2 * 4 * 256 * (this.contexts + 2)).fill(MIXER_START_WEIGHT)
  private readonly matchCounters = new Uint16Array(2 * (MATCH_LONGEST_COUNTED + 1)).fill(COUNTER_START)
  private readonly matchCounts = new Uint8Array(2 * (MATCH_LONGEST_COUNTED + 1))
  private readonly matchTable = new Int32Array(1 << MATCH_TABLE_BITS).fill(-1)
  private readonly apm1 = apmTable(256 * 256)
  private readonly apm2 = apmTable(1 << APM2_CONTEXT_BITS)
  private readonly history: Uint8Array
  private length = 0
  private partial = 1
  private bitIndex = 0
  private last4 = 0
  private wordHash = 0
  private keyHash = 0
  private stringHash = 0
  private inString = false
  private matchPointer = -1
  private matchLength = 0
  private expectedByte = -1
  private matchSlot = -1
  private mixerBase = 0
  private mixed = 0
  private apmWeight = 0
  private apm1Index = 0
  private apm2Index = 0

  constructor(capacity: number) {
    this.history = new Uint8Array(capacity)
    this.startByte()
  }

  private startByte() {
    const c = this.last4 & 255
    if (c === QUOTE) {
      if (!this.inString) this.stringHash = 0
      this.inString = !this.inString
    } else if (this.inString) this.stringHash = mix32(this.stringHash, c)
    else if (c === COLON) this.keyHash = this.stringHash
    this.wordHash = isWordByte(c) ? mix32(this.wordHash, c) : 0

    let hash = 0
    let next = 0
    for (let order = 1; order <= ORDERS[ORDERS.length - 1]!; order++) {
      hash = mix32(hash, this.length >= order ? this.history[this.length - order]! : 0)
      if (order === ORDERS[next]) this.hashes[next++] = mix32(hash, order)
    }
    this.hashes[next++] = mix32(this.wordHash, SALT_WORD)
    this.hashes[next++] = mix32(mix32(this.keyHash, c), SALT_KEY)
    this.hashes[next++] = SALT_ORDER0
    this.hashes[next] = mix32(mix32(this.keyHash, this.wordHash), SALT_KEY_WORD)

    this.findMatch(c)
  }

  private findMatch(c: number) {
    if (this.matchLength > 0 && this.history[this.matchPointer] === c) {
      this.matchLength++
      this.matchPointer++
    } else this.matchLength = 0
    if (this.length >= MATCH_MIN_BYTES) {
      let hash = 0
      for (let k = 1; k <= MATCH_MIN_BYTES; k++) hash = mix32(hash, this.history[this.length - k]!)
      const slot = hash >>> (32 - MATCH_TABLE_BITS)
      const candidate = this.matchTable[slot]!
      if (this.matchLength === 0 && candidate > 0) {
        let length = 0
        while (length < 32 && candidate - 1 - length >= 0) {
          if (this.history[candidate - 1 - length] !== this.history[this.length - 1 - length]) break
          length++
        }
        if (length >= MATCH_MIN_BYTES) {
          this.matchPointer = candidate
          this.matchLength = length
        }
      }
      this.matchTable[slot] = this.length
    }
    this.expectedByte = this.matchLength > 0 ? this.history[this.matchPointer]! : -1
  }

  /** Returns the probability that the next bit is 1, from 1 to 4095. */
  predict(): number {
    const { contexts, inputs } = this
    for (let i = 0; i < contexts; i++) {
      this.slots[i] = mix32(this.hashes[i]!, this.partial) >>> (32 - TABLE_BITS)
      inputs[i] = STRETCH[this.counters[i]![this.slots[i]!]! >>> 4]!
    }
    this.matchSlot = -1
    let expectedBit = 0
    if (this.expectedByte >= 0 && (this.expectedByte + 256) >> (8 - this.bitIndex) === this.partial) {
      expectedBit = (this.expectedByte >> (7 - this.bitIndex)) & 1
      this.matchSlot = Math.min(this.matchLength, MATCH_LONGEST_COUNTED) * 2 + expectedBit
      inputs[contexts] = STRETCH[this.matchCounters[this.matchSlot]! >>> 4]!
    } else inputs[contexts] = 0
    inputs[contexts + 1] = MIXER_BIAS

    const lengthBucket = this.matchSlot < 0 ? 0 : this.matchLength < 16 ? 1 : this.matchLength < 32 ? 2 : 3
    this.mixerBase = ((lengthBucket * 2 + expectedBit) * 256 + this.partial) * (contexts + 2)
    let dot = 0
    for (let i = 0; i < contexts + 2; i++) dot += this.weights[this.mixerBase + i]! * inputs[i]!
    this.mixed = squash(dot >> 16)

    const stretched = STRETCH[this.mixed]! + 2048
    this.apmWeight = stretched & 127
    this.apm1Index = (((this.last4 & 255) << 8) | this.partial) * APM_POINTS + (stretched >> 7)
    this.apm2Index =
      (mix32(this.last4 & 0xffff, this.partial) >>> (32 - APM2_CONTEXT_BITS)) * APM_POINTS + (stretched >> 7)
    const refined1 = this.refined(this.apm1, this.apm1Index)
    const refined2 = this.refined(this.apm2, this.apm2Index)
    return Math.max(1, Math.min(PROBABILITY_ONE - 1, (2 * this.mixed + 3 * refined1 + 3 * refined2) >> 3))
  }

  private refined(table: Uint16Array, index: number): number {
    return (table[index]! * (128 - this.apmWeight) + table[index + 1]! * this.apmWeight) >> 11
  }

  private static count(counters: Uint16Array, counts: Uint8Array, slot: number, target: number) {
    const n = counts[slot]!
    const value = counters[slot]!
    counters[slot] = value + Math.trunc(((target - value) * RATE[n]!) / 65536)
    if (n < COUNT_LIMIT) counts[slot] = n + 1
  }

  private static refine(table: Uint16Array, index: number, weight: number, target: number) {
    const below = table[index]!
    const above = table[index + 1]!
    table[index] = below + (((target - below) * (128 - weight)) >> 13)
    table[index + 1] = above + (((target - above) * weight) >> 13)
  }

  /** Learns the bit that came after the last {@link Model.predict}. */
  update(bit: number) {
    const target = bit ? COUNTER_ONE : 0
    for (let i = 0; i < this.contexts; i++) Model.count(this.counters[i]!, this.counts[i]!, this.slots[i]!, target)
    if (this.matchSlot >= 0) Model.count(this.matchCounters, this.matchCounts, this.matchSlot, target)
    const error = ((bit << PROBABILITY_BITS) - this.mixed) * LEARNING_RATE
    for (let i = 0; i < this.contexts + 2; i++) {
      const slot = this.mixerBase + i
      this.weights[slot] = this.weights[slot]! + ((this.inputs[i]! * error) >> LEARNING_SHIFT)
    }
    Model.refine(this.apm1, this.apm1Index, this.apmWeight, target)
    Model.refine(this.apm2, this.apm2Index, this.apmWeight, target)

    this.partial = (this.partial << 1) | bit
    if (++this.bitIndex === 8) {
      const byte = this.partial & 255
      this.history[this.length++] = byte
      this.last4 = ((this.last4 << 8) | byte) >>> 0
      this.partial = 1
      this.bitIndex = 0
      this.startByte()
    }
  }

  learn(bytes: Uint8Array) {
    for (const byte of bytes) {
      for (let i = 7; i >= 0; i--) {
        this.predict()
        this.update((byte >> i) & 1)
      }
    }
  }
}

function split(low: number, high: number, p: number): number {
  const range = high - low
  return low + Math.floor(range / PROBABILITY_ONE) * p + Math.floor(((range % PROBABILITY_ONE) * p) / PROBABILITY_ONE)
}

/**
 * Compresses bytes with a model that first learns the dictionary. {@link decompress} needs the same dictionary.
 *
 * @returns The coded bytes, without their length.
 */
export function compress(data: Uint8Array, dictionary: Uint8Array): Uint8Array {
  const model = new Model(dictionary.length + data.length)
  model.learn(dictionary)
  let low = 0
  let high = 0xffffffff
  const out: number[] = []
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) {
      const bit = (byte >> i) & 1
      const middle = split(low, high, model.predict())
      if (bit) high = middle
      else low = middle + 1
      model.update(bit)
      while (((low ^ high) & 0xff000000) === 0) {
        out.push(high >>> 24)
        low = (low << 8) >>> 0
        high = ((high << 8) | 255) >>> 0
      }
    }
  }
  out.push(low >>> 24)
  return Uint8Array.from(out)
}

/** Returns the `size` bytes that {@link compress} coded with the same dictionary. */
export function decompress(packed: Uint8Array, dictionary: Uint8Array, size: number): Uint8Array {
  const model = new Model(dictionary.length + size)
  model.learn(dictionary)
  let read = 0
  const nextByte = () => (read < packed.length ? packed[read++]! : 255)
  let low = 0
  let high = 0xffffffff
  let code = 0
  for (let i = 0; i < 4; i++) code = ((code << 8) | nextByte()) >>> 0
  const out = new Uint8Array(size)
  for (let k = 0; k < size; k++) {
    let byte = 0
    for (let i = 0; i < 8; i++) {
      const middle = split(low, high, model.predict())
      const bit = code <= middle ? 1 : 0
      if (bit) high = middle
      else low = middle + 1
      model.update(bit)
      byte = (byte << 1) | bit
      while (((low ^ high) & 0xff000000) === 0) {
        low = (low << 8) >>> 0
        high = ((high << 8) | 255) >>> 0
        code = ((code << 8) | nextByte()) >>> 0
      }
    }
    out[k] = byte
  }
  return out
}
