import type { LucideProps } from 'lucide-react'
import { createElement, useEffect, useSyncExternalStore } from 'react'
import { cacheVersion, loaded, preloadIcons, subscribe } from './icon-cache'

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  useSyncExternalStore(subscribe, cacheVersion)
  useEffect(() => {
    if (name && !loaded.has(name)) void preloadIcons([name])
  }, [name])
  if (!name) return null
  const Component = loaded.get(name)
  if (!Component) {
    return <svg width={props.size ?? 24} height={props.size ?? 24} className={props.className} aria-hidden />
  }
  return createElement(Component, { 'aria-hidden': true, ...props })
}
