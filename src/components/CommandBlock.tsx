import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success('Copied'),
    () => toast.error('Could not copy. Select the text and copy it.'),
  )
}

/** Shows a label and a text in monospace with a copy button, for commands, settings and bug report details. */
export function CommandBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 py-2 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 font-mono text-xs leading-5 break-all whitespace-pre-wrap select-all [font-variant-ligatures:none]">
          {value}
        </code>
        <Button variant="ghost" size="icon-xs" aria-label={`Copy: ${label}`} onClick={() => copy(value)}>
          <Copy />
        </Button>
      </div>
    </div>
  )
}
