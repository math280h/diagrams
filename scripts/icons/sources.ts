export const AWS_PACKAGE_URL =
  'https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip'
export const AZURE_PACKAGE_URL = 'https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip'
export const GCP_CORE_URL = 'https://services.google.com/fh/files/misc/core-products-icons.zip'
export const GCP_CATEGORY_URL = 'https://services.google.com/fh/files/misc/category-icons.zip'
export const KUBERNETES_COMMIT = '70a4bb2d8cc35bb0672f221bad9bc60c27a6f94b'
export const KUBERNETES_ICONS_URL = `https://raw.githubusercontent.com/kubernetes/community/${KUBERNETES_COMMIT}/icons/svg/`
export const SALESFORCE_ICONS_VERSION = '10.18.1'
export const SALESFORCE_ICONS_URL = `https://registry.npmjs.org/@salesforce-ux/icons/-/icons-${SALESFORCE_ICONS_VERSION}.tgz`

export type IconLicense = { id: string } | { expression: string } | { name: string; url: string }

/** Where an icon set comes from, and on which terms the app ships it. */
export interface IconSource {
  /** The data file in `src/canvas/icons/data`, without `.json`. */
  file: string
  name: string
  /** The version of the download. The Google Cloud downloads have no version. */
  version?: string
  /** The npm package that gives the version, when `pnpm icons` reads the set from an installed package. */
  npmPackage?: string
  purl?: string
  website: string
  downloads: readonly string[]
  license: IconLicense
}

/** The icon sets that `pnpm icons` writes to `src/canvas/icons/data`. */
export const ICON_SOURCES: readonly IconSource[] = [
  {
    file: 'aws',
    name: 'AWS Architecture Icons',
    version: '2026-07-31',
    website: 'https://aws.amazon.com/architecture/icons/',
    downloads: [AWS_PACKAGE_URL],
    license: { name: 'AWS Architecture Icons terms', url: 'https://aws.amazon.com/architecture/icons/' },
  },
  {
    file: 'azure',
    name: 'Azure architecture icons',
    version: 'V24',
    website: 'https://learn.microsoft.com/azure/architecture/icons/',
    downloads: [AZURE_PACKAGE_URL],
    license: { name: 'Azure architecture icons terms', url: 'https://learn.microsoft.com/azure/architecture/icons/' },
  },
  {
    file: 'gcp',
    name: 'Google Cloud icons',
    website: 'https://cloud.google.com/icons',
    downloads: [GCP_CORE_URL, GCP_CATEGORY_URL],
    license: { name: 'Google Cloud icons terms', url: 'https://cloud.google.com/icons' },
  },
  {
    file: 'k8s',
    name: 'Kubernetes icons',
    version: KUBERNETES_COMMIT,
    purl: `pkg:github/kubernetes/community@${KUBERNETES_COMMIT}#icons`,
    website: `https://github.com/kubernetes/community/tree/${KUBERNETES_COMMIT}/icons`,
    downloads: [KUBERNETES_ICONS_URL],
    license: { expression: 'Apache-2.0 OR CC-BY-4.0' },
  },
  {
    file: 'salesforce',
    name: 'Salesforce Lightning Design System icons',
    version: SALESFORCE_ICONS_VERSION,
    purl: `pkg:npm/%40salesforce-ux/icons@${SALESFORCE_ICONS_VERSION}`,
    website: 'https://www.lightningdesignsystem.com/icons/',
    downloads: [SALESFORCE_ICONS_URL],
    license: { id: 'CC-BY-ND-4.0' },
  },
  {
    file: 'logos',
    name: 'Simple Icons',
    npmPackage: 'simple-icons',
    website: 'https://simpleicons.org',
    downloads: [],
    license: { id: 'CC0-1.0' },
  },
]
