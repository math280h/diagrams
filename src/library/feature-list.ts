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
    title: 'Play a request through it',
    summary:
      'Record a path, add captions, and play it with a camera that follows. Read it as a log or a sequence diagram, with fan-out and alternate paths.',
  },
  {
    id: 'traces',
    title: 'Replay a real trace',
    summary:
      'Import an OpenTelemetry, Jaeger or Zipkin trace, and watch the request move with each operation, latency and status.',
  },
  {
    id: 'sensitive',
    title: 'See where sensitive data goes',
    summary:
      'Mark body fields as personal data or secrets, and see which connections carry them across a trust boundary.',
  },
  {
    id: 'agents',
    title: 'Let an AI agent draw it',
    summary:
      'In the desktop app, Claude Code and other MCP clients draw, animate and check diagrams while you watch, also from Terraform, docker-compose or Kubernetes files.',
  },
  {
    id: 'share',
    title: 'Share it anywhere',
    summary:
      'Present in full screen, export PNG, SVG, MP4, WebM or GIF, or a web page that plays its flows. Copy an image, or a link that carries the whole diagram.',
  },
  {
    id: 'code',
    title: 'Keep diagrams with your code',
    summary:
      'A diagram is a JSON file that you review and diff. A GitHub Action shows each diagram before and after in a pull request.',
  },
]

/** Every other feature, one short line each. */
export const MORE_FEATURES: readonly Feature[] = [
  {
    title: 'Templates',
    summary:
      'C4, RAG, an agent with MCP tools, an OpenID Connect sign-in, webhooks, a deploy pipeline and more, ready to play.',
  },
  { title: 'Node kinds', summary: 'Services, data stores, queues, clients and more, each with its own outline.' },
  { title: 'Real icons', summary: 'Official AWS, Azure, Google Cloud and Kubernetes icons, and 220 software logos.' },
  { title: 'Boundaries', summary: 'Cloud, network and cluster boundaries, or your own groups, such as a team.' },
  { title: 'Colours and metrics', summary: 'Colour nodes by kind or by group, and add numbers or meters.' },
  { title: 'Moving connections', summary: 'Dots, comets, dashes or pulses that flow along a connection.' },
  { title: 'Details on hover', summary: 'An owner, a description and links on a node, shown on hover in Present.' },
  {
    title: 'Request and response bodies',
    summary: 'The JSON fields of a connection, shown in the log as a flow plays.',
  },
  { title: 'Drill-down', summary: 'A node opens another diagram, and Present zooms into it.' },
  { title: 'Tidy up', summary: 'Lay out the whole diagram at once, and keep pinned nodes in place.' },
  { title: 'Walkthroughs', summary: 'Introduction and conclusion steps that show the whole path of a flow.' },
  { title: 'Text description', summary: 'Every diagram described in words, for screen readers and alt text.' },
  {
    title: 'README images',
    summary: "A dark and a light image, and a snippet that shows the one for the reader's theme.",
  },
  { title: 'Mermaid', summary: 'Import and export Mermaid flowcharts, and copy a flow as a sequence diagram.' },
  { title: 'Version history', summary: 'Earlier versions, also each change of an agent, ready to restore.' },
  { title: 'Open in the desktop app', summary: 'Send a diagram from the website to the desktop app in one step.' },
  { title: 'Command-line render', summary: 'The desktop app renders diagram files to images and video for CI.' },
  {
    title: 'Local first',
    summary: 'No account. The website keeps diagrams in your browser, the desktop app as files.',
  },
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
