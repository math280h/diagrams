import {
  Activity,
  AppWindow,
  Bell,
  Box,
  Circle,
  Clock,
  Cloud,
  Cpu,
  CreditCard,
  Cylinder,
  Database,
  Diamond,
  DoorOpen,
  Flag,
  Globe,
  Group,
  HardDrive,
  Heading,
  Hexagon,
  Layers,
  Mail,
  MemoryStick,
  Monitor,
  MousePointerClick,
  PanelTop,
  Pill,
  Play,
  Plug,
  RectangleHorizontal,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Split,
  Square,
  SquareDashed,
  Text,
  TextCursorInput,
  Type,
  User,
  Waves,
  Zap,
  type LucideProps,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { iconComponent, iconImageUrls } from './icons/components'
import { iconSourceOf, loadSetOfIcon } from './icons/library'

export const loaded = new Map<string, ComponentType<LucideProps>>(
  Object.entries({
    activity: Activity,
    'app-window': AppWindow,
    bell: Bell,
    box: Box,
    circle: Circle,
    clock: Clock,
    cloud: Cloud,
    cpu: Cpu,
    'credit-card': CreditCard,
    cylinder: Cylinder,
    database: Database,
    diamond: Diamond,
    'door-open': DoorOpen,
    flag: Flag,
    globe: Globe,
    group: Group,
    'hard-drive': HardDrive,
    heading: Heading,
    hexagon: Hexagon,
    layers: Layers,
    mail: Mail,
    'memory-stick': MemoryStick,
    monitor: Monitor,
    'mouse-pointer-click': MousePointerClick,
    'panel-top': PanelTop,
    pill: Pill,
    play: Play,
    plug: Plug,
    'rectangle-horizontal': RectangleHorizontal,
    search: Search,
    server: Server,
    'shield-check': ShieldCheck,
    smartphone: Smartphone,
    sparkles: Sparkles,
    split: Split,
    square: Square,
    'square-dashed': SquareDashed,
    text: Text,
    'text-cursor-input': TextCursorInput,
    type: Type,
    user: User,
    waves: Waves,
    zap: Zap,
  }),
)

/** The names of the Lucide icons that the app bundles. Other Lucide icons load on demand. */
export const BUNDLED_ICON_NAMES: ReadonlySet<string> = new Set(loaded.keys())

const pending = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
let version = 0

export function cacheVersion() {
  return version
}

type DynamicIcons = typeof import('lucide-react/dynamic')

let dynamicIcons: Promise<DynamicIcons> | null = null

function loadDynamicIcons(): Promise<DynamicIcons> {
  dynamicIcons ??= import('lucide-react/dynamic')
  return dynamicIcons
}

/** Returns the names of all Lucide icons. The first call loads the icon index. */
export async function loadIconNames(): Promise<readonly string[]> {
  return (await loadDynamicIcons()).iconNames
}

function notify() {
  version++
  for (const listener of listeners) listener()
}

function decodeImage(url: string): Promise<void> {
  const image = new Image()
  image.src = url
  return image.decode().catch(() => undefined)
}

async function loadSetIcon(name: string): Promise<void> {
  const set = await loadSetOfIcon(name)
  const entry = set?.byId.get(name)
  const component = set && entry ? iconComponent(set, entry) : null
  if (!set || !entry || !component) return
  await Promise.all(iconImageUrls(set, entry).map(decodeImage))
  loaded.set(name, component)
  notify()
}

function loadIcon(name: string): Promise<void> {
  let job = pending.get(name)
  if (!job && iconSourceOf(name)) {
    job = loadSetIcon(name).catch(() => {
      pending.delete(name)
    })
    pending.set(name, job)
  }
  if (!job) {
    job = loadDynamicIcons()
      .then(({ dynamicIconImports }) =>
        name in dynamicIconImports ? dynamicIconImports[name as keyof typeof dynamicIconImports]() : null,
      )
      .then((module) => {
        if (!module) return
        loaded.set(name, module.default)
        notify()
      })
    pending.set(name, job)
  }
  return job
}

/**
 * Loads the icons into the cache.
 *
 * After the promise resolves, the `Icon` component renders these icons in its first render. The
 * function ignores unknown names.
 */
export function preloadIcons(names: Iterable<string>): Promise<void> {
  const jobs: Promise<void>[] = []
  for (const name of names) {
    if (name && !loaded.has(name)) jobs.push(loadIcon(name))
  }
  return Promise.all(jobs).then(() => undefined)
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
