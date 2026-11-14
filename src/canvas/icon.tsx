import type { LucideProps } from 'lucide-react'
import { createElement, useEffect, useSyncExternalStore } from 'react'
import { loaded, preloadIcons, subscribe } from './icon-cache'

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Component = useSyncExternalStore(subscribe, () => (name ? loaded.get(name) : undefined))
  useEffect(() => {
    if (name && !loaded.has(name)) void preloadIcons([name])
  }, [name])
  if (!name) return null
  if (!Component) {
    return <svg width={props.size ?? 24} height={props.size ?? 24} className={props.className} aria-hidden />
  }
  return createElement(Component, { 'aria-hidden': true, ...props })
}
