import { Link } from '@tanstack/react-router'
import { useReactFlow } from '@xyflow/react'
import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { setUi } from '@/store/ui-store'

export function EmptyCanvas() {
  const { screenToFlowPosition } = useReactFlow()

  const openInsert = () => {
    const screen = { x: window.innerWidth / 2 - 140, y: window.innerHeight / 2 - 40 }
    setUi({
      insert: { screen, flow: screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) },
    })
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center p-6">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center text-center">
        <p className="text-xl font-medium tracking-[-0.015em]">Start with a node</p>
        <p className="mt-1.5 text-sm text-balance text-muted-foreground">
          Press <Kbd>N</Kbd>, double-click the canvas, or import a Mermaid flowchart. Then connect the nodes and record
          a flow that plays a request through them.
        </p>
        <div className="mt-5 flex gap-2">
          <Button onClick={openInsert}>
            <Plus /> Insert a node
          </Button>
          <Button variant="outline" onClick={() => setUi({ importOpen: true })}>
            <Upload /> Import Mermaid
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Or{' '}
          <Link to="/" className="text-foreground underline underline-offset-3 hover:text-foreground/80">
            start from a template
          </Link>{' '}
          that already plays.
        </p>
      </div>
    </div>
  )
}
