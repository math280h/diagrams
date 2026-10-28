import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { setUi, useUi } from '@/store/ui-store'
import { SHORTCUT_GROUPS } from '@/lib/shortcut-keys'

export function ShortcutsDialog() {
  const open = useUi((state) => state.shortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={(value) => setUi({ shortcutsOpen: value })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="-mx-4 max-h-[70dvh] space-y-4 overflow-y-auto px-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`shortcuts-${group.title}`}>
              <h3 id={`shortcuts-${group.title}`} className="text-xs font-medium text-muted-foreground">
                {group.title}
              </h3>
              <dl className="divide-y divide-border text-sm">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">{shortcut.label}</dt>
                    <dd className="shrink-0">
                      <Kbd>{shortcut.keys}</Kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
