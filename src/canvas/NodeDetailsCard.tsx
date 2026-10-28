import { useInternalNode, useStore } from '@xyflow/react'
import { ExternalLink, X } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { hasDetails, linkifyText, linkText, safeLinkUrl } from '@/model/details'
import { nodeTitle } from '@/model/labels'
import type { DiagramNode } from '@/model/types'
import type { DetailsHover } from './details-hover'

const CARD_WIDTH_PX = 288
const GAP_PX = 12
const EDGE_PX = 8

function Description({ text }: { text: string }) {
  return (
    <p className="dg-details-description">
      {linkifyText(text).map((part, index) =>
        part.kind === 'link' ? (
          <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </p>
  )
}

function Card({ node, hover, pinned }: { node: DiagramNode; hover: DetailsHover; pinned: boolean }) {
  const internal = useInternalNode(node.id)
  const [x, y, zoom] = useStore((state) => state.transform)
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  if (!internal || node.type === 'text') return null
  const { details } = node.data

  const position = internal.internals.positionAbsolute
  const nodeLeft = position.x * zoom + x
  const nodeRight = (position.x + (internal.measured.width ?? 0)) * zoom + x
  const nodeTop = position.y * zoom + y
  const fitsRight = nodeRight + GAP_PX + CARD_WIDTH_PX <= width - EDGE_PX
  const left = fitsRight
    ? nodeRight + GAP_PX
    : Math.max(EDGE_PX, Math.min(nodeLeft - GAP_PX - CARD_WIDTH_PX, width - CARD_WIDTH_PX - EDGE_PX))
  const top = Math.max(EDGE_PX, Math.min(nodeTop, height - 96))

  return (
    <aside
      className="dg-details-card"
      aria-label={`Details of ${nodeTitle(node)}`}
      style={{ left, top, width: CARD_WIDTH_PX, maxHeight: Math.max(96, height - top - EDGE_PX) }}
      onPointerEnter={hover.holdCard}
      onPointerLeave={hover.leave}
    >
      <div className="dg-details-head">
        <span className="dg-details-title">{nodeTitle(node)}</span>
        {pinned && (
          <button type="button" className="dg-details-close" aria-label="Close details" onClick={hover.close}>
            <X size={14} />
          </button>
        )}
      </div>
      {details.owner.trim() && <div className="dg-details-owner">Owner: {details.owner.trim()}</div>}
      {details.description.trim() && <Description text={details.description.trim()} />}
      {details.links.length > 0 && (
        <ul className="dg-details-links">
          {details.links.map((link) => {
            const href = safeLinkUrl(link.url)
            return (
              <li key={link.id}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {linkText(link)} <ExternalLink size={12} aria-hidden />
                  </a>
                ) : (
                  linkText(link)
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

/** Shows the details of the node under the pointer, or of the node that the reader clicked, next to the node. */
export function NodeDetailsCard({ hover, nodes }: { hover: DetailsHover; nodes: readonly DiagramNode[] | undefined }) {
  const { nodeId, pinned } = useSyncExternalStore(hover.subscribe, hover.getState)
  const node = nodeId ? nodes?.find((candidate) => candidate.id === nodeId) : undefined

  useEffect(() => {
    if (!pinned) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      hover.close()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [hover, pinned])

  if (!node || node.type === 'text' || !hasDetails(node.data.details)) return null
  return <Card node={node} hover={hover} pinned={pinned} />
}
