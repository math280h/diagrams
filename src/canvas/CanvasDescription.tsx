import type { DiagramDescription } from '@/export/describe'

export function CanvasDescription({ description }: { description: DiagramDescription }) {
  return (
    <section className="sr-only" aria-label="Description of the diagram">
      <p>
        {description.name}. {description.summary}
      </p>
      {description.sections.map((section, index) => {
        const List = section.numbered ? 'ol' : 'ul'
        return (
          <div key={index}>
            <p>{section.title}</p>
            {section.items.length > 0 && (
              <List>
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </List>
            )}
            {section.end && <p>{section.end}</p>}
          </div>
        )
      })}
    </section>
  )
}
