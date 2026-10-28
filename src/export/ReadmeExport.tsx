import { Copy, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Choice, Field, Segmented } from '@/editor/inspector/controls'
import { downloadBlob } from '@/lib/download'
import { errorMessage } from '@/lib/error-message'
import { safeFileName } from '@/lib/format'
import { useDoc } from '@/store/doc-store'
import { useUi } from '@/store/ui-store'
import { descriptionParagraph } from './describe'
import { readmeImagePaths, readmeSnippet, type ReadmeFormat } from './readme'
import { renderDiagramImage, renderDiagramVideo } from './render-image'
import { useDiagramDescription } from './use-description'

const NO_FLOW = 'traffic'
const IMAGE_MAX_SIZE_PX = 2400
const THEMES = ['dark', 'light'] as const

function fileName(path: string): string {
  return path.split('/').at(-1)!
}

export function ReadmeExport() {
  const name = useDoc((state) => state.name)
  const flows = useDoc((state) => state.flows)
  const activeFlowId = useUi((state) => state.activeFlowId)
  const description = useDiagramDescription()
  const [format, setFormat] = useState<ReadmeFormat>('png')
  const [flowChoice, setFlowChoice] = useState<string>(activeFlowId ?? flows[0]?.id ?? NO_FLOW)
  const [basePath, setBasePath] = useState(() => `docs/images/${safeFileName(name)}`)
  const [status, setStatus] = useState<string | null>(null)
  const flow = flows.find((candidate) => candidate.id === flowChoice)
  const paths = readmeImagePaths(basePath, format)
  const snippet = readmeSnippet(paths, descriptionParagraph(description))

  const copy = () =>
    void navigator.clipboard.writeText(snippet).then(
      () => toast.success('Copied the snippet'),
      () => toast.error('Could not copy. Select the text and copy it.'),
    )

  const save = async () => {
    const { id, ...doc } = useDoc.getState()
    const content = { ...doc, id: id ?? '' }
    try {
      for (const theme of THEMES) {
        setStatus(`Rendering the ${theme} ${format === 'gif' ? 'GIF' : 'image'}…`)
        const blob =
          format === 'gif'
            ? await renderDiagramVideo(content, { format: 'gif', theme, flowId: flow?.id })
            : (await renderDiagramImage(content, { format: 'png', theme, maxSizePx: IMAGE_MAX_SIZE_PX })).blob
        downloadBlob(blob, fileName(paths[theme]))
      }
      toast.success('Exported the dark and the light image')
    } catch (error) {
      toast.error('The export failed.', { description: errorMessage(error) })
    } finally {
      setStatus(null)
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Format">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'gif', label: 'GIF' },
              ]}
            />
          </Field>
          {format === 'gif' && (
            <Field label="Animation">
              <Choice
                label="Animation"
                value={flow ? flow.id : NO_FLOW}
                onChange={setFlowChoice}
                options={[
                  ...flows.map((candidate) => ({ value: candidate.id, label: `Flow “${candidate.name}”` })),
                  { value: NO_FLOW, label: 'Traffic only' },
                ]}
              />
            </Field>
          )}
        </div>
        <Field label="Image path">
          <Input
            value={basePath}
            onChange={(event) => setBasePath(event.target.value)}
            aria-label="Image path"
            spellCheck={false}
            className="h-7 font-mono text-xs md:text-xs"
          />
        </Field>
        <Textarea
          readOnly
          value={snippet}
          aria-label="README snippet"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          className="h-40 resize-none font-mono text-xs leading-5 whitespace-pre-wrap field-sizing-fixed md:text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Put the two images at the image path in your repository and paste the snippet in the README. GitHub shows the
          dark image in dark mode and the light image in light mode. The alt text is the text description of the
          diagram.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={copy}>
          <Copy /> Copy snippet
        </Button>
        <Button onClick={() => void save()} disabled={status !== null}>
          {status ? <Loader2 className="animate-spin" /> : <Download />} {status ?? 'Download images'}
        </Button>
      </DialogFooter>
    </>
  )
}
