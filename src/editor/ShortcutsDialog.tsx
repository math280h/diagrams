import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { setUi, useUi } from '@/store/ui-store'
import { SHORTCUTS } from './shortcuts'

export function ShortcutsDialog() {
  const open = useUi((state) => state.shortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={(value) => setUi({ shortcutsOpen: value })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <dl className="divide-y divide-border text-sm">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{shortcut.label}</dt>
              <dd>
                <Kbd>{shortcut.keys}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
