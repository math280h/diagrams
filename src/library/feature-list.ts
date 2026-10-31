export type HeadlineId = 'flows' | 'traces' | 'sensitive' | 'agents' | 'share' | 'code'

export interface Feature {
  title: string
  /** One or two plain sentences for the website and the README. */
  summary: string
}

export interface HeadlineFeature extends Feature {
  id: HeadlineId
}

/** The features that the library shows with a picture, and that the README lists first. */
export const HEADLINE_FEATURES: readonly HeadlineFeature[] = [
  {
    id: 'flows',
    title: 'Follow a request step by step',
    summary:
      'Record the path of a request and caption each step. Play it and the camera follows. Steps can fan out or branch. A flow also reads as a log or a sequence diagram.',
  },
  {
    id: 'traces',
    title: 'Replay a real trace',
    summary:
      'Import an OpenTelemetry, Jaeger or Zipkin trace as a flow. Each step shows the real operation, its latency and its status.',
  },
  {
    id: 'sensitive',
    title: 'See where sensitive data goes',
    summary:
      'Mark fields in request and response bodies as personal data or secrets. The Sensitive data view shows which connections carry them across a trust boundary.',
  },
  {
    id: 'agents',
    title: 'Ask an AI agent to draw',
    summary:
      'In the desktop app, Claude Code and other MCP clients draw, animate and check diagrams while you watch. They can start from Terraform, docker-compose or Kubernetes files.',
  },
  {
    id: 'share',
    title: 'Export and share',
    summary:
      'Present in full screen. Export PNG, SVG, MP4, WebM, GIF or a web page that plays the flows. Copy an image, or a link that carries the whole diagram.',
  },
  {
    id: 'code',
    title: 'Keep diagrams with your code',
    summary:
      'A diagram is a JSON file that you can review and diff. A GitHub Action comments on pull requests with before and after images.',
  },
]

/** Every other feature, one short line each. */
export const MORE_FEATURES: readonly Feature[] = [
  {
    title: 'Templates',
    summary:
      'Examples to play and copy, such as C4 models, RAG, an agent with MCP tools and an OpenID Connect sign-in.',
  },
  { title: 'Node kinds', summary: 'Services, data stores, queues, clients and more, each with its own outline.' },
  {
    title: 'Icons and logos',
    summary: 'Official AWS, Azure, Google Cloud, Kubernetes and Salesforce icons, and about 220 software logos.',
  },
  { title: 'Boundaries', summary: 'Cloud, network and cluster boundaries, or your own groups, such as a team.' },
  { title: 'Colours and metrics', summary: 'Colour nodes by kind or by group, and add numbers or meters.' },
  { title: 'Traffic on connections', summary: 'Dots, comets, dashes or pulses that flow along a connection.' },
  { title: 'Details on hover', summary: 'Give a node an owner, a description and links. Present shows them on hover.' },
  {
    title: 'Request and response bodies',
    summary: 'The JSON fields of a connection, shown in the log as a flow plays.',
  },
  { title: 'Drill-down', summary: 'A node opens another diagram, and Present zooms into it.' },
  { title: 'Tidy up', summary: 'Lay out the whole diagram in one go. Pinned nodes stay where you put them.' },
  { title: 'Walkthroughs', summary: 'Introduction and conclusion steps that show the whole path of a flow.' },
  { title: 'Text description', summary: 'Every diagram described in words, for screen readers and alt text.' },
  { title: 'High contrast', summary: 'A canvas with stronger text and outlines. It can follow your system setting.' },
  {
    title: 'README images',
    summary: "A dark and a light image, and a snippet that shows the one for the reader's theme.",
  },
  { title: 'Mermaid', summary: 'Import and export Mermaid flowcharts, and copy a flow as a sequence diagram.' },
  { title: 'Version history', summary: 'Restore an earlier version. Each change an agent makes gets its own version.' },
  { title: 'Open in the desktop app', summary: 'Send a diagram from the website to the desktop app in one step.' },
  { title: 'Command-line render', summary: 'The desktop app renders diagram files to images and video for CI.' },
  {
    title: 'App on a tablet',
    summary: 'Install the website as an app that opens from the home screen and works offline.',
  },
]

export const README_FEATURES_START = '<!-- features:start -->'
export const README_FEATURES_END = '<!-- features:end -->'

/** Returns the Markdown of the features for the README, between the markers. */
export function readmeFeatures(): string {
  const line = ({ title, summary }: Feature) => `- **${title}.** ${summary}`
  return [
    README_FEATURES_START,
    '',
    ...HEADLINE_FEATURES.map(line),
    '',
    'Also:',
    '',
    ...MORE_FEATURES.map(line),
    '',
    README_FEATURES_END,
  ].join('\n')
}
