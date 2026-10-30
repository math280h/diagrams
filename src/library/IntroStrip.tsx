import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface IntroStripProps {
  /** The id of the heading, which names the section. */
  headingId: string
  title: string
  /** One short line under the title. */
  children: ReactNode
  /** The actions on the right, or below the text on narrow screens. */
  actions: ReactNode
  closeLabel: string
  onClose: () => void
  className?: string
}

/** Shows a card on the library that introduces one way to use the app, with its actions and a close button. */
export function IntroStrip({ headingId, title, children, actions, closeLabel, onClose, className }: IntroStripProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'relative flex flex-col gap-4 rounded-xl border bg-panel py-4 pr-12 pl-5 sm:flex-row sm:items-center sm:gap-8',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="text-[15px] font-medium tracking-[-0.01em]">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-pretty text-muted-foreground">{children}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">{actions}</div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={closeLabel}
        className="absolute top-2.5 right-2.5"
        onClick={onClose}
      >
        <X />
      </Button>
    </section>
  )
}
