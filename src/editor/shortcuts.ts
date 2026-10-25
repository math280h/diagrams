import { useEffect } from 'react'
import type { Engine } from '@/engine/engine'
import { duplicateSelection, groupSelection, nudgeSelection, selectAll, ungroupSelection } from '@/store/actions'
import { shortcutLetter } from '@/lib/keys'
import { redo, undo } from '@/store/history'
import { setUi, useUi } from '@/store/ui-store'
import { useVersions } from '@/store/versions'
import { copySelection, cutSelection, paste } from './clipboard'
import { openInsertAtPointer } from './insert'
import { useFitToScreen } from './fit'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const DELETE_KEY = isMac ? '⌫' : 'Delete'

/**
 * Returns a key combination in the notation of the platform, for example "⇧⌘Z" on a Mac and "Ctrl+Shift+Z" on
 * other systems.
 */
export function keyCombo(key: string, { mod = false, shift = false } = {}): string {
  if (isMac) return `${shift ? '⇧' : ''}${mod ? '⌘' : ''}${key}`
  return [mod && 'Ctrl', shift && 'Shift', key].filter(Boolean).join('+')
}

export const FIT_KEYS = keyCombo('1', { shift: true })
const SHIFT_NAME = isMac ? '⇧' : 'Shift'

export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: keyCombo('K', { mod: true }), label: 'Open the command menu' },
  { keys: 'N', label: 'Insert a node at the pointer' },
  { keys: 'Double-click', label: 'Insert a node on the canvas' },
  { keys: keyCombo('Z', { mod: true }), label: 'Undo' },
  { keys: keyCombo('Z', { mod: true, shift: true }), label: 'Redo' },
  {
    keys: ['C', 'X', 'V'].map((key) => keyCombo(key, { mod: true })).join(' / '),
    label: 'Copy, cut, paste',
  },
  { keys: keyCombo('D', { mod: true }), label: 'Duplicate the selection' },
  {
    keys: `${keyCombo('G', { mod: true })} / ${keyCombo('G', { mod: true, shift: true })}`,
    label: 'Group, ungroup',
  },
  { keys: keyCombo('A', { mod: true }), label: 'Select all' },
  { keys: DELETE_KEY, label: 'Delete the selection' },
  { keys: '← ↑ → ↓', label: `Move the selection 1 px (${SHIFT_NAME} for 10 px)` },
  { keys: 'Space', label: 'Play or pause the flow' },
  { keys: FIT_KEYS, label: 'Fit to screen' },
  { keys: isMac ? '⇧ drag' : 'Shift+drag', label: 'Select an area' },
  { keys: 'Drag from the side of a node', label: 'Connect, or drop on empty canvas to add a connected node' },
  { keys: 'Drag, scroll, middle-drag', label: 'Move the canvas' },
  { keys: `${isMac ? '⌘ scroll' : 'Ctrl+scroll'}, pinch`, label: 'Zoom' },
  { keys: '?', label: 'Show the shortcuts' },
]

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('[role="dialog"], [role="menu"]') !== null
  )
}

export function useEditorShortcuts(engine: Engine) {
  const fitToScreen = useFitToScreen()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.defaultPrevented || useVersions.getState().previewId !== null) return
      const mod = event.metaKey || event.ctrlKey
      const key = shortcutLetter(event)

      if (mod && key === 'k') {
        event.preventDefault()
        setUi({ commandOpen: !useUi.getState().commandOpen })
        return
      }
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod && key === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (mod && key === 'g') {
        event.preventDefault()
        if (event.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if (mod && key === 'a') {
        event.preventDefault()
        selectAll()
        return
      }
      if (mod) return

      if (key === 'n' && !event.altKey) {
        event.preventDefault()
        openInsertAtPointer()
        return
      }
      if (event.key === '?') {
        setUi({ shortcutsOpen: true })
        return
      }
      if (event.code === 'Space' && engine.playback.timeline && useUi.getState().flowPanelOpen) {
        event.preventDefault()
        engine.playback.toggle()
        return
      }
      if (event.key === '!' || (event.shiftKey && event.code === 'Digit1')) {
        fitToScreen()
        return
      }
      if (event.key === 'Escape' && useUi.getState().recording) {
        setUi({ recording: false })
        return
      }
      const step = event.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = moves[event.key]
      const onFocusedNode =
        event.target instanceof HTMLElement && event.target.closest('.react-flow__node, .react-flow__nodesselection')
      if (move && !onFocusedNode) {
        event.preventDefault()
        nudgeSelection(move[0], move[1])
      }
    }

    const editing = (event: ClipboardEvent) => !isTyping(event.target) && useVersions.getState().previewId === null
    const onCopy = (event: ClipboardEvent) => {
      if (editing(event)) copySelection(event)
    }
    const onCut = (event: ClipboardEvent) => {
      if (editing(event)) cutSelection(event)
    }
    const onPaste = (event: ClipboardEvent) => {
      if (editing(event)) paste(event)
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [engine, fitToScreen])
}
