import type { LucideProps } from 'lucide-react'
import { createElement, Fragment, type ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { artUrl, type IconArt, type IconEntry, type IconSet } from './library'

function logoIcon(path: string, title: string): ComponentType<LucideProps> {
  function LogoIcon({ size = 24, className }: LucideProps) {
    return createElement(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        className: cn('dg-logo', className),
        fill: 'currentColor',
        'aria-hidden': true,
      },
      createElement('path', { d: path }),
    )
  }
  LogoIcon.displayName = title
  return LogoIcon
}

function artImage(svg: string, size: LucideProps['size'], className: string | undefined, variant?: string) {
  return createElement('img', {
    key: variant ?? 'light',
    src: artUrl(svg),
    width: size,
    height: size,
    className: cn('dg-art', className),
    'data-variant': variant,
    alt: '',
    draggable: false,
  })
}

function tileImage(art: IconArt, size: LucideProps['size'], className: string | undefined) {
  return createElement('span', {
    className: cn('dg-art dg-art-tile', className),
    style: {
      '--dg-art-size': typeof size === 'number' ? `${size}px` : size,
      backgroundColor: art.tile,
      backgroundImage: `url("${artUrl(art.light)}")`,
      backgroundSize: `${(art.glyph ?? 1) * 100}%`,
    },
    'aria-hidden': true,
  })
}

function artIcon(art: IconArt, title: string): ComponentType<LucideProps> {
  function ArtIcon({ size = 24, className }: LucideProps) {
    if (art.tile) return tileImage(art, size, className)
    if (!art.dark) return artImage(art.light, size, className)
    return createElement(
      Fragment,
      null,
      artImage(art.light, size, className, 'light'),
      artImage(art.dark, size, className, 'dark'),
    )
  }
  ArtIcon.displayName = title
  return ArtIcon
}

/** Returns a component that draws the entry with the props of a Lucide icon. */
export function iconComponent(set: IconSet, entry: IconEntry): ComponentType<LucideProps> | null {
  if (entry.path) return logoIcon(entry.path, entry.title)
  const art = entry.art ? set.art[entry.art] : undefined
  return art ? artIcon(art, entry.title) : null
}

/** Returns the data URLs of the light art and, if it exists, the dark art. */
export function iconImageUrls(set: IconSet, entry: IconEntry): string[] {
  const art = entry.art ? set.art[entry.art] : undefined
  if (!art) return []
  return art.dark ? [artUrl(art.light), artUrl(art.dark)] : [artUrl(art.light)]
}
