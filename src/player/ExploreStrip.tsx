import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CAPTION_HEIGHT_PX } from '@/canvas/FlowOverlay'
import { nodeTitle } from '@/model/labels'
import { explorable, type useExplore } from './use-explore'

/** Renders the strip of Explore mode: the node in focus and a button for each neighbour. */
export function ExploreStrip({ explore }: { explore: ReturnType<typeof useExplore> }) {
  if (!explore.focus) return null
  return (
    <nav
      aria-label="Neighbours"
      className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-1 overflow-x-auto border-t bg-panel px-2 [scrollbar-width:none]"
      style={{ height: CAPTION_HEIGHT_PX }}
    >
      <span className="shrink-0 px-1 text-sm font-medium">{nodeTitle(explore.focus)}</span>
      <span className="shrink-0 px-1 text-sm text-muted-foreground">
        {explore.links.length === 0 ? 'has no connections.' : 'connects to'}
      </span>
      {explore.links.map((link) => {
        const node = explore.byId.get(link.nodeId)
        if (!node) return null
        return (
          <Button
            key={link.edgeId}
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!explorable(node)}
            onClick={() => explore.setFocus(link.nodeId)}
          >
            {link.outgoing ? <ArrowRight /> : <ArrowLeft />}
            {nodeTitle(node)}
            {link.label && <span className="font-mono text-xs text-muted-foreground">{link.label}</span>}
          </Button>
        )
      })}
      <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={explore.stop}>
        <X /> Stop exploring
      </Button>
    </nav>
  )
}
