const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['week', 7 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
]

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function relativeTime(timestamp: number, now = Date.now()): string {
  const delta = timestamp - now
  for (const [unit, size] of UNITS) {
    if (Math.abs(delta) >= size) return relative.format(Math.round(delta / size), unit)
  }
  return 'just now'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

export function safeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\w\- ]+/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase() || 'diagram'
  )
}

export function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
}
