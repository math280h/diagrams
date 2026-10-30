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
  /** The actions on the right, or below the text when the strip is narrow. */
  actions: ReactNode
  closeLabel: string
  onClose: () => void
  className?: string
}

/** Shows a card on the library that introduces one way to use the app, with its actions and a close button. */
export function IntroStrip({ headingId, title, children, actions, closeLabel, onClose, className }: IntroStripProps) {
  return (
    <section aria-labelledby={headingId} className={cn('@container relative rounded-xl border bg-panel', className)}>
      <div className="flex flex-col gap-4 py-4 pr-5 pl-5 @xl:flex-row @xl:items-center @xl:gap-8 @xl:pr-12">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="pr-8 text-[15px] font-medium tracking-[-0.01em] @xl:pr-0">
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-pretty text-muted-foreground">{children}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
      </div>
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
