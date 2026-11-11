import { cn } from '@/lib/utils'
import type { Theme } from './schema'

/** Shows the background and the walkthrough colour of a theme. */
export function ThemeSwatch({ theme, className }: { theme: Theme; className?: string }) {
  return (
    <span
      aria-hidden
      data-app-base={theme.base}
      data-app-theme={theme.id}
      className={cn(
        'inline-grid size-4 shrink-0 place-items-center rounded-[5px] border border-border bg-background',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-flow" />
    </span>
  )
}
