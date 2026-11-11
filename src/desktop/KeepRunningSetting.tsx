import { useId } from 'react'
import { Switch } from '@/components/ui/switch'
import { setKeepRunning, useAppSettings } from './app-settings'
import { desktopApi } from './bridge'
import { KEEP_RUNNING_LABEL, quitHint } from './keep-running'

export function KeepRunningSetting() {
  const settings = useAppSettings((state) => state.settings)
  const hintId = useId()
  if (!settings) return null
  return (
    <div className="flex items-start justify-between gap-4 border-t pt-4 text-[13px]">
      <div className="space-y-0.5">
        <p className="font-medium text-foreground">{KEEP_RUNNING_LABEL}</p>
        <p id={hintId} className="leading-5 text-muted-foreground">
          Agents can connect while the window is closed. {quitHint(desktopApi()?.platform ?? '')}
        </p>
      </div>
      <Switch
        aria-label={KEEP_RUNNING_LABEL}
        aria-describedby={hintId}
        checked={settings.keepRunning}
        onCheckedChange={(checked) => void setKeepRunning(checked)}
      />
    </div>
  )
}
