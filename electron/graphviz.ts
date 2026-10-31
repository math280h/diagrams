import { Graphviz } from '@hpcc-js/wasm-graphviz'
import type { MainRequests } from '@/desktop/contract'

type Request = MainRequests['layout.graphviz']

let loaded: Promise<Graphviz> | null = null

/** Lays out a DOT text with a Graphviz engine and returns the `plain` output. */
export async function layoutGraphviz({ dot, engine }: Request['input']): Promise<Request['output']> {
  loaded ??= Graphviz.load()
  return { plain: (await loaded).layout(dot, 'plain', engine) }
}
