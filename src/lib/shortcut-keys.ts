export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Returns a key combination in the notation of the platform, for example "⇧⌘Z" on a Mac and "Ctrl+Shift+Z" on
 * other systems.
 */
export function keyCombo(key: string, { mod = false, shift = false } = {}): string {
  if (IS_MAC) return `${shift ? '⇧' : ''}${mod ? '⌘' : ''}${key}`
  return [mod && 'Ctrl', shift && 'Shift', key].filter(Boolean).join('+')
}

const SHIFT_NAME = IS_MAC ? '⇧' : 'Shift'

/** The keys of each shortcut in the notation of the platform, for menus, tooltips and the shortcut sheet. */
export const KEYS = {
  commandMenu: keyCombo('K', { mod: true }),
  insert: 'N',
  undo: keyCombo('Z', { mod: true }),
  redo: IS_MAC ? keyCombo('Z', { mod: true, shift: true }) : `${keyCombo('Z', { mod: true, shift: true })}, Ctrl+Y`,
  copy: keyCombo('C', { mod: true }),
  cut: keyCombo('X', { mod: true }),
  paste: keyCombo('V', { mod: true }),
  duplicate: keyCombo('D', { mod: true }),
  group: keyCombo('G', { mod: true }),
  ungroup: keyCombo('G', { mod: true, shift: true }),
  selectAll: keyCombo('A', { mod: true }),
  delete: IS_MAC ? '⌫' : 'Delete',
  fit: keyCombo('1', { shift: true }),
  playPause: 'Space',
  stopRecording: 'Esc',
  shortcuts: '?',
  previousStep: '←',
  nextStep: '→',
  fullScreen: 'F',
  exitPresent: 'Esc',
} as const

export interface ShortcutGroup {
  title: string
  shortcuts: { keys: string; label: string }[]
}

/** The shortcuts that the shortcut sheet lists, by the place where they work. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Editor',
    shortcuts: [
      { keys: KEYS.commandMenu, label: 'Open the command menu' },
      { keys: KEYS.insert, label: 'Insert a node at the pointer' },
      { keys: 'Double-click', label: 'Insert a node on the canvas' },
      { keys: KEYS.undo, label: 'Undo' },
      { keys: KEYS.redo, label: 'Redo' },
      { keys: [KEYS.copy, KEYS.cut, KEYS.paste].join(' / '), label: 'Copy, cut, paste' },
      { keys: KEYS.duplicate, label: 'Duplicate the selection' },
      { keys: `${KEYS.group} / ${KEYS.ungroup}`, label: 'Group, ungroup' },
      { keys: KEYS.selectAll, label: 'Select all' },
      { keys: KEYS.delete, label: 'Delete the selection' },
      { keys: '← ↑ → ↓', label: `Move the selection 1 px (${SHIFT_NAME} for 10 px)` },
      { keys: KEYS.fit, label: 'Fit to screen' },
      { keys: IS_MAC ? '⇧ drag' : 'Shift+drag', label: 'Select an area' },
      { keys: 'Drag from the side of a node', label: 'Connect, or drop on empty canvas to add a connected node' },
      { keys: 'Drag, scroll, middle-drag', label: 'Move the canvas' },
      { keys: `${IS_MAC ? '⌘ scroll' : 'Ctrl+scroll'}, pinch`, label: 'Zoom' },
      { keys: KEYS.shortcuts, label: 'Show the shortcuts' },
    ],
  },
  {
    title: 'Flows',
    shortcuts: [
      { keys: KEYS.playPause, label: 'Play or pause the flow, while the flow panel is open' },
      { keys: IS_MAC ? '⇧ click' : 'Shift+click', label: 'While recording, reach a node in the same step' },
      { keys: KEYS.stopRecording, label: 'Stop recording' },
    ],
  },
  {
    title: 'Present',
    shortcuts: [
      { keys: KEYS.playPause, label: 'Play or pause' },
      { keys: `${KEYS.previousStep} ${KEYS.nextStep}`, label: 'Previous or next step' },
      { keys: KEYS.fullScreen, label: 'Full screen' },
      { keys: KEYS.exitPresent, label: 'Leave Present' },
    ],
  },
]
