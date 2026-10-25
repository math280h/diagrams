import { create } from 'zustand'
import type { DiagramNode } from '@/model/types'
import { takeSnapshot, useDoc, type DocSnapshot } from './doc-store'

const LIMIT = 200
export const COALESCE_MS = 500

let past: DocSnapshot[] = []
let future: DocSnapshot[] = []
let lastKey: string | null = null
let lastAt = 0
let gesture: DocSnapshot | null = null
let gestureDepth = 0
let batchDepth = 0

export const useHistory = create(() => ({ canUndo: false, canRedo: false }))

function sync() {
  useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 })
}

function push(snapshot: DocSnapshot) {
  past.push(snapshot)
  if (past.length > LIMIT) past.shift()
  future = []
  sync()
}

/**
 * Saves the current document as an undo step. Call it before a change.
 *
 * @param key - Calls with the same key less than {@link COALESCE_MS} apart make one undo step.
 */
export function record(key?: string) {
  if (gesture || batchDepth > 0) return
  const now = performance.now()
  if (key !== undefined && key === lastKey && now - lastAt < COALESCE_MS) {
    lastAt = now
    return
  }
  lastKey = key ?? null
  lastAt = now
  push(takeSnapshot())
}

/**
 * Starts a drag or a resize.
 *
 * {@link endGesture} records one undo step if the gesture changed a node.
 */
export function beginGesture() {
  if (gestureDepth++ === 0) gesture = takeSnapshot()
}

function geometryChanged(before: DiagramNode[], after: DiagramNode[]) {
  if (before.length !== after.length) return true
  const byId = new Map(before.map((node) => [node.id, node]))
  for (const node of after) {
    const old = byId.get(node.id)
    if (
      !old ||
      old.position.x !== node.position.x ||
      old.position.y !== node.position.y ||
      old.width !== node.width ||
      old.height !== node.height ||
      old.parentId !== node.parentId
    ) {
      return true
    }
  }
  return false
}

export function endGesture() {
  if (gestureDepth === 0) return
  if (--gestureDepth > 0) return
  const before = gesture
  gesture = null
  lastKey = null
  if (before && geometryChanged(before.nodes, useDoc.getState().nodes)) push(before)
}

function snapshotChanged(before: DocSnapshot, after: DocSnapshot) {
  return (
    before.name !== after.name ||
    before.theme !== after.theme ||
    before.nodes !== after.nodes ||
    before.edges !== after.edges ||
    before.flows !== after.flows
  )
}

/**
 * Runs a change as one undo step, however many actions it calls.
 *
 * If the change throws, the document goes back to its state before the change.
 *
 * @returns The return value of the change.
 */
export function oneStep<T>(change: () => T): T {
  if (batchDepth > 0 || gesture) return change()
  const before = takeSnapshot()
  batchDepth++
  let result: T
  try {
    result = change()
  } catch (error) {
    batchDepth--
    useDoc.setState(before)
    throw error
  }
  batchDepth--
  if (snapshotChanged(before, takeSnapshot())) {
    lastKey = null
    push(before)
  }
  return result
}

function restore(snapshot: DocSnapshot) {
  useDoc.setState({
    ...snapshot,
    nodes: snapshot.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
    edges: snapshot.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
  })
}

export function undo() {
  const previous = past.pop()
  if (!previous) return
  future.push(takeSnapshot())
  restore(previous)
  lastKey = null
  sync()
}

export function redo() {
  const next = future.pop()
  if (!next) return
  past.push(takeSnapshot())
  restore(next)
  lastKey = null
  sync()
}

export function resetHistory() {
  past = []
  future = []
  lastKey = null
  gesture = null
  gestureDepth = 0
  batchDepth = 0
  sync()
}
