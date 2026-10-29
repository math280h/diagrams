import type { Flow, FlowPath, Step, Target } from './schema'

/** Returns the node or edge target of a step and its parallel targets, the main target first. An overview step has none. */
export function stepTargets(step: Step): Target[] {
  return step.target.kind === 'flow' ? [] : [step.target, ...(step.parallel ?? [])]
}

/** Returns true for a step that shows the whole flow. */
export function isOverview(step: Step): boolean {
  return step.target.kind === 'flow'
}

/** Returns the name of an overview step by its place: Introduction first, Conclusion last, else Overview. */
export function overviewName(index: number, total: number): string {
  if (index === 0) return 'Introduction'
  if (index === total - 1) return 'Conclusion'
  return 'Overview'
}

export function findPath(flow: Flow, pathId: string | null): FlowPath | null {
  if (pathId === null) return null
  return flow.paths?.find((path) => path.id === pathId) ?? null
}

/**
 * Returns the steps that a flow plays on a path: the main steps up to the start of the path, the steps of the path,
 * and the main steps from its rejoin step.
 *
 * @param pathId - The path, or `null` for the main steps. A path that starts at no main step gives the main steps.
 */
export function pathSteps(flow: Flow, pathId: string | null): Step[] {
  const path = findPath(flow, pathId)
  if (!path) return flow.steps
  const start = flow.steps.findIndex((step) => step.id === path.fromStep)
  if (start === -1) return flow.steps
  const rejoin = path.rejoinStep === null ? -1 : flow.steps.findIndex((step) => step.id === path.rejoinStep)
  return [...flow.steps.slice(0, start + 1), ...path.steps, ...(rejoin > start ? flow.steps.slice(rejoin) : [])]
}

export interface StepPlace {
  step: Step
  /** The path that holds the step, or `null` for a main step. */
  path: FlowPath | null
  /** The index of the step in its list. */
  index: number
  /** The main steps, or the steps of the path. */
  list: Step[]
}

/** Finds a step among the main steps and the steps of each path. */
export function findStep(flow: Flow, stepId: string): StepPlace | null {
  const main = flow.steps.findIndex((step) => step.id === stepId)
  if (main !== -1) return { step: flow.steps[main]!, path: null, index: main, list: flow.steps }
  for (const path of flow.paths ?? []) {
    const index = path.steps.findIndex((step) => step.id === stepId)
    if (index !== -1) return { step: path.steps[index]!, path, index, list: path.steps }
  }
  return null
}

/** Returns every step of a flow: the main steps, then the steps of each path. */
export function allSteps(flow: Flow): Step[] {
  return [...flow.steps, ...(flow.paths ?? []).flatMap((path) => path.steps)]
}

/** Returns the main steps after the start of a path, where the path can rejoin. */
export function rejoinCandidates(flow: Flow, path: FlowPath): Step[] {
  const start = flow.steps.findIndex((step) => step.id === path.fromStep)
  return start === -1 ? [] : flow.steps.slice(start + 1)
}

export interface LaneName {
  kind: 'node' | 'edge'
  /** The node name, or the source name of an edge in travel order. */
  from: string
  /** The target name of an edge in travel order. Empty for a node. */
  to: string
}

/**
 * Returns the element text of a step with several lanes, for example `Kafka → Email worker, Inventory`.
 *
 * Edges from one node show that node once. Other lanes show one after the other.
 */
export function lanesText(lanes: readonly LaneName[]): string {
  if (lanes.length === 0) return ''
  const edges = lanes.filter((lane) => lane.kind === 'edge')
  if (edges.length === lanes.length && edges.every((lane) => lane.from === edges[0]!.from)) {
    return `${edges[0]!.from} → ${edges.map((lane) => lane.to).join(', ')}`
  }
  return lanes.map((lane) => (lane.kind === 'edge' ? `${lane.from} → ${lane.to}` : lane.from)).join(', ')
}

/**
 * Removes a step from a flow. A path that starts at a removed main step starts at the main step before it, or goes
 * when no step comes before it. A path that rejoins at a removed main step rejoins at the main step after it, or ends.
 */
export function removeStep(flow: Flow, stepId: string) {
  const main = flow.steps.findIndex((step) => step.id === stepId)
  if (main === -1) {
    for (const path of flow.paths ?? []) path.steps = path.steps.filter((step) => step.id !== stepId)
    return
  }
  const before = flow.steps[main - 1]?.id ?? null
  const after = flow.steps[main + 1]?.id ?? null
  flow.steps.splice(main, 1)
  if (!flow.paths) return
  flow.paths = flow.paths.flatMap((path) => {
    if (path.fromStep === stepId) {
      if (before === null) return []
      path.fromStep = before
    }
    if (path.rejoinStep === stepId) path.rejoinStep = after
    return [path]
  })
}
