import { useNavigate } from '@tanstack/react-router'
import { Plus, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createDiagram } from '@/model/defaults'
import { nodeTitle } from '@/model/labels'
import type { CardNodeType, GroupNodeType } from '@/model/types'
import { saveImported } from '@/persistence/library-actions'
import { updateNodeData } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { flushPendingSave } from '@/store/document'
import { useLibrary } from '@/store/library-store'
import { Choice, Field, Section } from './controls'

const NOTHING = 'nothing'

/** Links a card or a boundary to the diagram that shows its inside. */
export function OpensFields({ node }: { node: CardNodeType | GroupNodeType }) {
  const navigate = useNavigate()
  const items = useLibrary((state) => state.items)
  const currentId = useDoc((state) => state.id)
  const opens = node.data.opens
  const target = items.find((item) => item.id === opens)
  const options = [
    { value: NOTHING, label: 'Nothing' },
    ...items.filter((item) => item.id !== currentId).map((item) => ({ value: item.id, label: item.name })),
  ]

  const createInside = () => {
    const diagram = createDiagram(nodeTitle(node).trim() || 'Inside')
    if (!saveImported(diagram).ok) return
    updateNodeData(node.id, { opens: diagram.id })
  }

  return (
    <Section title="Inside">
      <Field label="Opens">
        <Choice
          label="Opens"
          value={target ? target.id : NOTHING}
          onChange={(id) => updateNodeData(node.id, { opens: id === NOTHING ? undefined : id })}
          options={options}
        />
      </Field>
      {opens && !target && <p className="text-xs text-destructive">The diagram that this node opened is gone.</p>}
      {target ? (
        <Button
          variant="outline"
          size="sm"
          className="max-w-full justify-start"
          onClick={() => {
            flushPendingSave()
            void navigate({ to: '/d/$diagramId', params: { diagramId: target.id } })
          }}
        >
          <ZoomIn /> <span className="truncate">Open {target.name}</span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="justify-start" onClick={createInside}>
          <Plus /> New diagram for its inside
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        The node gets a zoom button. In Present it zooms into the node and plays the diagram inside.
      </p>
    </Section>
  )
}
