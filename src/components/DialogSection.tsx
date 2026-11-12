import { useId, type ReactNode } from 'react'

/** Shows a titled part of a dialog, with a line under the title and a border above it. */
export function DialogSection({
  title,
  description,
  children,
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t pt-4 text-[13px]">
      <div className="space-y-0.5">
        <h3 id={headingId} className="font-medium text-foreground">
          {title}
        </h3>
        <p className="leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}
