import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/copy-text'

/** Shows a label and a text in monospace with a copy button, for commands, settings and bug report details. */
export function CommandBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 py-2 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 font-mono text-xs leading-5 break-all whitespace-pre-wrap select-all [font-variant-ligatures:none]">
          {value}
        </code>
        <Button variant="ghost" size="icon-xs" aria-label={`Copy: ${label}`} onClick={() => copyText(value)}>
          <Copy />
        </Button>
      </div>
    </div>
  )
}
