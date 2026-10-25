import type { VersionMeta } from '@/persistence/version-store'

const DAY_MS = 24 * 3600_000
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const date = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const dateWithYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function startOfDay(timestamp: number) {
  const day = new Date(timestamp)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** Returns the name of the day of a timestamp: "Today", "Yesterday" or a date. */
function versionDay(timestamp: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(timestamp).getFullYear() === new Date(now).getFullYear()
    ? date.format(timestamp)
    : dateWithYear.format(timestamp)
}

export function versionTime(timestamp: number): string {
  return time.format(timestamp)
}

/** Returns the day and the time of a timestamp for use in a sentence, such as "today at 14:32". */
export function versionMoment(timestamp: number, now = Date.now()): string {
  const day = versionDay(timestamp, now)
  return `${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day} at ${versionTime(timestamp)}`
}

export function versionAuthor(meta: VersionMeta): string {
  switch (meta.author) {
    case 'you':
      return 'You'
    case 'agent':
      return meta.tool ? `Agent: ${meta.tool}` : 'Agent'
    case 'restore':
      return 'Restored a version'
    case 'opened':
      return 'First opened'
    case 'outside':
      return 'Changed outside the editor'
  }
}

/** Returns the summary of a version, with the restored version first for a restore. */
export function versionSummary(meta: VersionMeta): string {
  return meta.restoredAt === undefined
    ? meta.summary
    : `Back to the version from ${versionMoment(meta.restoredAt)}. ${meta.summary}`
}

/** Groups versions by day. The order of the versions stays the same. */
export function groupByDay(items: readonly VersionMeta[], now = Date.now()): { day: string; items: VersionMeta[] }[] {
  const groups: { day: string; items: VersionMeta[] }[] = []
  for (const meta of items) {
    const day = versionDay(meta.at, now)
    const last = groups.at(-1)
    if (last?.day === day) last.items.push(meta)
    else groups.push({ day, items: [meta] })
  }
  return groups
}
