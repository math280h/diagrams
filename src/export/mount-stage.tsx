import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportStage, type ExportStageProps, type StageHandle } from './ExportStage'

const READY_TIMEOUT_MS = 15_000

/**
 * Renders an export stage outside the React tree of the page.
 *
 * @returns The stage after React Flow measures its nodes, and a function that removes it.
 * @throws Error If the stage is not ready within {@link READY_TIMEOUT_MS}.
 */
export function mountExportStage(
  props: Omit<ExportStageProps, 'onReady'>,
): Promise<{ stage: StageHandle; dispose: () => void }> {
  const root = createRoot(document.createElement('div'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      root.unmount()
      reject(new Error('The diagram did not render in time.'))
    }, READY_TIMEOUT_MS)
    root.render(
      <TooltipProvider>
        <ExportStage
          {...props}
          onReady={(stage) => {
            clearTimeout(timer)
            resolve({ stage, dispose: () => root.unmount() })
          }}
        />
      </TooltipProvider>,
    )
  })
}
