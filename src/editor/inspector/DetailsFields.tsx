import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { newId } from '@/model/defaults'
import { safeLinkUrl } from '@/model/details'
import type { NodeDetails, NodeLink } from '@/model/schema'
import type { CardNodeType, GroupNodeType, ShapeNodeType } from '@/model/types'
import { updateNodeData } from '@/store/actions'
import { Field, Section, TextInput } from './controls'

/** Edits the owner, description and links that readers see on hover in Present and on an exported page. */
export function DetailsFields({ node }: { node: CardNodeType | ShapeNodeType | GroupNodeType }) {
  const { details } = node.data
  const set = (patch: Partial<NodeDetails>, key?: string) =>
    updateNodeData(node.id, { details: { ...details, ...patch } }, key)
  const setLink = (id: string, patch: Partial<NodeLink>, key: string) =>
    set({ links: details.links.map((link) => (link.id === id ? { ...link, ...patch } : link)) }, key)

  return (
    <Section title="Details">
      <Field label="Owner" wide>
        <TextInput
          value={details.owner}
          placeholder="Payments team"
          onChange={(owner) => set({ owner }, `details-owner:${node.id}`)}
        />
      </Field>
      <Textarea
        value={details.description}
        aria-label="Description"
        placeholder="What this part does, for people who read the diagram."
        onChange={(event) => set({ description: event.target.value }, `details-description:${node.id}`)}
        className="min-h-16 resize-y text-xs md:text-xs dark:bg-transparent"
      />
      {details.links.map((link) => {
        const invalid = link.url.trim() !== '' && safeLinkUrl(link.url) === null
        return (
          <div key={link.id} role="group" aria-label="Link" className="space-y-1">
            <div className="flex items-center gap-1">
              <TextInput
                value={link.label}
                placeholder="Runbook"
                onChange={(label) => setLink(link.id, { label }, `link-label:${link.id}`)}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove link"
                onClick={() => set({ links: details.links.filter((item) => item.id !== link.id) })}
              >
                <X />
              </Button>
            </div>
            <TextInput
              mono
              value={link.url}
              placeholder="https://"
              onChange={(url) => setLink(link.id, { url }, `link-url:${link.id}`)}
            />
            {invalid && (
              <p className="text-xs text-destructive">Use a web address (https://) or a mail address (mailto:).</p>
            )}
          </div>
        )
      })}
      <Button
        variant="ghost"
        size="sm"
        className="justify-start"
        onClick={() => set({ links: [...details.links, { id: newId('k'), label: '', url: '' }] })}
      >
        <Plus /> Add a link
      </Button>
      <p className="text-xs text-muted-foreground">
        Readers see the details when they point at the node in Present and on an exported web page.
      </p>
    </Section>
  )
}
