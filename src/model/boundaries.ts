import type { Color } from './colors'
import { matchKeywords } from './keywords'

export const BOUNDARY_PROVIDER_IDS = ['general', 'aws', 'azure', 'gcp', 'k8s'] as const
export type BoundaryProvider = (typeof BOUNDARY_PROVIDER_IDS)[number]

/**
 * The family of a boundary kind. Each family has its own outline on the canvas.
 *
 * - `scope`: an owner of resources, for example an account or a project.
 * - `logical`: a named set inside a scope, for example a resource group.
 * - `location`: a geographic place, for example a region.
 * - `zone`: an isolated place inside a location.
 * - `network`: a private network.
 * - `subnet`: an address range inside a network.
 * - `security`: a rule set or a trust boundary.
 * - `runtime`: a set of machines or processes, for example a cluster.
 * - `custom`: a group without a kind.
 */
export type BoundaryTier =
  | 'scope'
  | 'logical'
  | 'location'
  | 'zone'
  | 'network'
  | 'subnet'
  | 'security'
  | 'runtime'
  | 'custom'

/** New boundaries of these tiers get a tinted area. */
export const TINTED_TIERS: ReadonlySet<BoundaryTier> = new Set(['scope', 'network', 'subnet', 'runtime', 'custom'])

/** The tiers whose boundaries hide the outlines of the other boundaries under them. */
export const SOLID_TIERS: ReadonlySet<BoundaryTier> = new Set(['runtime'])

export interface BoundaryKind {
  id: string
  provider: BoundaryProvider
  name: string
  tier: BoundaryTier
  color: Color
  icon: string
  /** An example value for the detail line, for example an account id or an address range. */
  detailHint: string
  keywords: string[]
}

export const BOUNDARY_PROVIDERS: { id: BoundaryProvider; name: string; prefix: string }[] = [
  { id: 'general', name: 'Boundaries', prefix: '' },
  { id: 'aws', name: 'AWS', prefix: 'AWS' },
  { id: 'azure', name: 'Azure', prefix: 'Azure' },
  { id: 'gcp', name: 'Google Cloud', prefix: 'GCP' },
  { id: 'k8s', name: 'Kubernetes', prefix: 'Kubernetes' },
]

function kind(
  id: string,
  provider: BoundaryProvider,
  name: string,
  tier: BoundaryTier,
  color: Color,
  icon: string,
  detailHint: string,
  keywords: string[],
): BoundaryKind {
  return { id, provider, name, tier, color, icon, detailHint, keywords }
}

export const CUSTOM_BOUNDARY = 'custom'

const PROPER_NAMES = ['Auto Scaling']

export const BOUNDARY_KINDS: BoundaryKind[] = [
  kind(CUSTOM_BOUNDARY, 'general', 'Group', 'custom', 'neutral', '', '', ['group', 'box', 'container']),
  kind('general.system', 'general', 'System boundary', 'scope', 'neutral', 'box', 'payments platform', [
    'system',
    'c4',
    'context',
    'product',
  ]),
  kind('general.environment', 'general', 'Environment', 'logical', 'orange', 'flask-conical', 'production', [
    'environment',
    'env',
    'production',
    'staging',
    'dev',
  ]),
  kind('general.trust', 'general', 'Trust boundary', 'security', 'red', 'shield-alert', 'internet facing', [
    'trust',
    'security',
    'dmz',
    'perimeter',
  ]),
  kind('general.datacenter', 'general', 'Data center', 'location', 'neutral', 'warehouse', 'FRA1', [
    'data center',
    'datacenter',
    'dc',
    'colo',
  ]),
  kind('general.onprem', 'general', 'On-premises', 'location', 'neutral', 'building', 'head office', [
    'on premises',
    'on prem',
    'onprem',
    'office',
  ]),
  kind('general.team', 'general', 'Team', 'logical', 'pink', 'users', 'payments team', ['team', 'owner', 'squad']),
  kind('general.app', 'general', 'Application', 'runtime', 'yellow', 'app-window', 'Node 22, Fastify', [
    'application',
    'app',
    'container',
    'microservice',
  ]),

  kind('aws.organization', 'aws', 'Organization', 'scope', 'neutral', 'aws:organizations', 'o-a1b2c3d4e5', [
    'aws organization',
    'organization',
    'org',
  ]),
  kind('aws.ou', 'aws', 'Organizational unit', 'scope', 'neutral', 'folder-tree', 'ou-ab12-cdef3456', [
    'organizational unit',
    'ou',
  ]),
  kind('aws.account', 'aws', 'Account', 'scope', 'pink', 'aws:account', '123456789012', ['aws account', 'account']),
  kind('aws.region', 'aws', 'Region', 'location', 'teal', 'aws:region', 'eu-west-1', ['aws region', 'region']),
  kind('aws.az', 'aws', 'Availability zone', 'zone', 'blue', 'map-pin', 'eu-west-1a', [
    'availability zone',
    'az',
    'zone',
  ]),
  kind('aws.vpc', 'aws', 'VPC', 'network', 'green', 'aws:vpc-group', '10.0.0.0/16', ['vpc', 'virtual private cloud']),
  kind('aws.subnet.public', 'aws', 'Public subnet', 'subnet', 'green', 'aws:public-subnet', '10.0.1.0/24', [
    'public subnet',
    'subnet',
  ]),
  kind('aws.subnet.private', 'aws', 'Private subnet', 'subnet', 'teal', 'aws:private-subnet', '10.0.2.0/24', [
    'private subnet',
    'subnet',
  ]),
  kind('aws.sg', 'aws', 'Security group', 'security', 'red', 'shield', 'sg-0a1b2c3d4e', ['security group', 'sg']),
  kind('aws.asg', 'aws', 'Auto Scaling group', 'runtime', 'orange', 'aws:auto-scaling-group', 'min 2, max 10', [
    'auto scaling group',
    'asg',
    'autoscaling',
  ]),

  kind('azure.tenant', 'azure', 'Tenant', 'scope', 'neutral', 'azure:tenant', 'contoso.onmicrosoft.com', [
    'tenant',
    'entra',
    'directory',
  ]),
  kind('azure.mg', 'azure', 'Management group', 'scope', 'neutral', 'azure:management-groups', 'mg-platform', [
    'management group',
  ]),
  kind('azure.subscription', 'azure', 'Subscription', 'scope', 'yellow', 'azure:subscriptions', 'sub-7f3a', [
    'subscription',
    'azure subscription',
  ]),
  kind('azure.rg', 'azure', 'Resource group', 'logical', 'blue', 'azure:resource-groups', 'rg-payments-prod', [
    'resource group',
    'rg',
  ]),
  kind('azure.region', 'azure', 'Region', 'location', 'teal', 'globe', 'westeurope', ['azure region', 'region']),
  kind('azure.az', 'azure', 'Availability zone', 'zone', 'blue', 'map-pin', 'zone 1', ['availability zone', 'zone']),
  kind('azure.vnet', 'azure', 'Virtual network', 'network', 'green', 'azure:virtual-networks', '10.1.0.0/16', [
    'virtual network',
    'vnet',
  ]),
  kind('azure.subnet', 'azure', 'Subnet', 'subnet', 'teal', 'azure:subnet', '10.1.1.0/24', ['subnet']),
  kind('azure.nsg', 'azure', 'Network security group', 'security', 'red', 'azure:network-security-groups', 'nsg-web', [
    'network security group',
    'nsg',
  ]),

  kind('gcp.organization', 'gcp', 'Organization', 'scope', 'neutral', 'building-2', 'example.com', [
    'gcp organization',
    'organization',
  ]),
  kind('gcp.folder', 'gcp', 'Folder', 'scope', 'neutral', 'folder-tree', 'payments', ['folder']),
  kind('gcp.project', 'gcp', 'Project', 'scope', 'blue', 'logo:googlecloud', 'payments-prod-4821', [
    'project',
    'gcp project',
  ]),
  kind('gcp.region', 'gcp', 'Region', 'location', 'teal', 'globe', 'europe-west1', ['gcp region', 'region']),
  kind('gcp.zone', 'gcp', 'Zone', 'zone', 'blue', 'map-pin', 'europe-west1-b', ['zone']),
  kind('gcp.vpc', 'gcp', 'VPC network', 'network', 'green', 'gcp:vpc', 'global', ['vpc network', 'vpc']),
  kind('gcp.subnet', 'gcp', 'Subnet', 'subnet', 'teal', 'lock', '10.2.0.0/20', ['subnet']),

  kind('k8s.cluster', 'k8s', 'Cluster', 'runtime', 'blue', 'logo:kubernetes', 'v1.31', [
    'kubernetes',
    'cluster',
    'k8s',
    'eks',
    'aks',
    'gke',
  ]),
  kind('k8s.namespace', 'k8s', 'Namespace', 'logical', 'teal', 'k8s:namespace', 'payments', ['namespace', 'ns']),
  kind('k8s.nodepool', 'k8s', 'Node pool', 'runtime', 'neutral', 'k8s:node', '3 × e2-standard-4', [
    'node pool',
    'node group',
  ]),
]

const MATCHABLE_BOUNDARIES = BOUNDARY_KINDS.filter((boundary) => boundary.tier !== 'custom')

export const BOUNDARY_BY_ID = new Map(BOUNDARY_KINDS.map((boundary) => [boundary.id, boundary]))

/** Returns the boundary kind for the id. Unknown ids give the custom group. */
export function boundaryKind(id: string): BoundaryKind {
  return BOUNDARY_BY_ID.get(id) ?? BOUNDARY_BY_ID.get(CUSTOM_BOUNDARY)!
}

/** Returns the label that names a boundary kind on the canvas, for example `AWS account`. */
export function boundaryKindLabel(boundary: BoundaryKind): string {
  if (boundary.tier === 'custom') return ''
  const prefix = BOUNDARY_PROVIDERS.find((provider) => provider.id === boundary.provider)?.prefix ?? ''
  if (!prefix) return boundary.name
  const keepCase = /^[A-Z]{2}/.test(boundary.name) || PROPER_NAMES.some((name) => boundary.name.startsWith(name))
  const name = keepCase ? boundary.name : `${boundary.name.charAt(0).toLowerCase()}${boundary.name.slice(1)}`
  return `${prefix} ${name}`
}

/**
 * Returns the boundary kind whose canvas name with a provider starts the label, for example `Kubernetes namespace`.
 * If no such name starts the label, the kind whose keywords match it best.
 *
 * @param label - A Mermaid subgraph title, for example.
 * @returns The matched kind, or the custom group if no keyword occurs in the label.
 */
export function matchBoundary(label: string): BoundaryKind {
  return namedBoundary(label) ?? matchKeywords(label, MATCHABLE_BOUNDARIES) ?? boundaryKind(CUSTOM_BOUNDARY)
}

/** Returns true if the label is the canvas name of the kind, or starts with it as whole words. */
export function startsWithKindLabel(label: string, boundary: BoundaryKind): boolean {
  const lower = label.trim().toLowerCase()
  const name = boundaryKindLabel(boundary).toLowerCase()
  return name !== '' && (lower === name || lower.startsWith(`${name} `))
}

function namedBoundary(label: string): BoundaryKind | undefined {
  let best: BoundaryKind | undefined
  for (const boundary of MATCHABLE_BOUNDARIES) {
    if (boundary.provider === 'general' || !startsWithKindLabel(label, boundary)) continue
    if (!best || boundaryKindLabel(boundary).length > boundaryKindLabel(best).length) best = boundary
  }
  return best
}
