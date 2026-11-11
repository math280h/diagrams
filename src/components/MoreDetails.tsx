import { cn } from '@/lib/utils'

/** The "More details…" link under an error message. It opens the problem dialog of that error. */
export function MoreDetails({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-[13px] leading-5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline',
        className,
      )}
    >
      More details…
    </button>
  )
}
