import { useEffect, useId, type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { loadAppSettings, setAgentWindow, setKeepRunning, setOpenAtLogin, useAppSettings } from './app-settings'
import { desktopApi } from './bridge'
import type { AgentWindowMode } from './contract'
import {
  AGENT_WINDOW_LABEL,
  AGENT_WINDOW_OPTIONS,
  KEEP_RUNNING_LABEL,
  OPEN_AT_LOGIN_LABEL,
  openAtLoginHint,
  quitHint,
} from './keep-running'

function Setting({
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
        <p id={hintId} className="leading-5 text-muted-foreground">
          {hint}
        </p>
      </div>
      {children}
    </div>
  )
}

/**
 * Shows the settings that let agents use the app while its window is closed. It loads the settings again when it
 * shows and when the window gets the focus.
 */
export function BackgroundSettings() {
  const settings = useAppSettings((state) => state.settings)
  const openAtLoginHintId = useId()
  const keepRunningHintId = useId()
  const agentWindowLabelId = useId()
  const agentWindowHintId = useId()
  useEffect(() => {
    loadAppSettings()
    window.addEventListener('focus', loadAppSettings)
    return () => window.removeEventListener('focus', loadAppSettings)
  }, [])
  if (!settings) return null
  const { openAtLogin } = settings
  return (
    <div className="space-y-4 border-t pt-4 text-[13px]">
      <Setting label={OPEN_AT_LOGIN_LABEL} hint={openAtLoginHint(openAtLogin)} hintId={openAtLoginHintId}>
        <Switch
          aria-label={OPEN_AT_LOGIN_LABEL}
          aria-describedby={openAtLoginHintId}
          checked={openAtLogin === 'on' || openAtLogin === 'approval'}
          disabled={openAtLogin === 'unsupported'}
          onCheckedChange={(checked) => void setOpenAtLogin(checked)}
        />
      </Setting>
      <Setting
        label={KEEP_RUNNING_LABEL}
        hint={`Agents can connect while the window is closed. ${quitHint(desktopApi()?.platform ?? '')}`}
        hintId={keepRunningHintId}
      >
        <Switch
          aria-label={KEEP_RUNNING_LABEL}
          aria-describedby={keepRunningHintId}
          checked={settings.keepRunning}
          onCheckedChange={(checked) => void setKeepRunning(checked)}
        />
      </Setting>
      <Setting
        label={AGENT_WINDOW_LABEL}
        labelId={agentWindowLabelId}
        hint="Agents that only read keep the window closed."
        hintId={agentWindowHintId}
      >
        <Select<AgentWindowMode>
          value={settings.agentWindow}
          onValueChange={(value) => value !== null && value !== settings.agentWindow && void setAgentWindow(value)}
          items={AGENT_WINDOW_OPTIONS}
        >
          <SelectTrigger
            size="sm"
            aria-labelledby={agentWindowLabelId}
            aria-describedby={agentWindowHintId}
            className="shrink-0 rounded-lg px-2 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            {AGENT_WINDOW_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Setting>
    </div>
  )
}
