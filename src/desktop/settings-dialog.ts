import { create } from 'zustand'

export const useDesktopSettingsDialog = create<{ open: boolean }>(() => ({ open: false }))

export function openDesktopSettings() {
  useDesktopSettingsDialog.setState({ open: true })
}
