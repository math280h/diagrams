import type { ReactNode } from 'react'

/** Shows a setting of the app settings: its label and hint, with the control on the right. */
export function Setting({
  label,
  labelId,
  hint,
  hintId,
  children,
}: {
  label: string
  labelId?: string
  hint: string
  hintId: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p id={labelId} className="font-medium text-foreground">
          {label}
        </p>
        <p id={hintId} className="leading-5 text-pretty text-muted-foreground">
          {hint}
        </p>
      </div>
      {children}
    </div>
  )
}
