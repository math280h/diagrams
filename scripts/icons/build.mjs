import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import * as simpleIcons from 'simple-icons'
import { optimize } from 'svgo'
import { AWS, AZURE, GCP, KUBERNETES, LOGO_ALIASES, LOGOS } from './catalog.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, 'node_modules', '.cache', 'diagram-icons')
const OUT = join(ROOT, 'src', 'canvas', 'icons', 'data')

const AWS_PACKAGE_URL =
  'https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip'
const AZURE_PACKAGE_URL = 'https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V24.zip'
const GCP_CORE_URL = 'https://services.google.com/fh/files/misc/core-products-icons.zip'
const GCP_CATEGORY_URL = 'https://services.google.com/fh/files/misc/category-icons.zip'
const KUBERNETES_COMMIT = '70a4bb2d8cc35bb0672f221bad9bc60c27a6f94b'
const KUBERNETES_ICONS_URL = `https://raw.githubusercontent.com/kubernetes/community/${KUBERNETES_COMMIT}/icons/svg/`

async function download(url, name) {
  const file = join(CACHE, name)
  if (!existsSync(file)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status} for ${url}`)
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(file, Buffer.from(await response.arrayBuffer()))
  }
  return readFileSync(file)
}

// The Kubernetes set has no unlabeled variant of the control plane components.
async function kubernetesIcon(group, name) {
  try {
    return await download(`${KUBERNETES_ICONS_URL}${group}/unlabeled/${name}.svg`, `k8s-${group}-${name}.svg`)
  } catch {
    return download(`${KUBERNETES_ICONS_URL}${group}/labeled/${name}.svg`, `k8s-${group}-${name}-labeled.svg`)
  }
}

async function svgArchive(url, name) {
  const files = unzipSync(await download(url, name), {
    filter: (file) => file.name.endsWith('.svg') && !file.name.includes('__MACOSX'),
  })
  return Object.entries(files).map(([path, data]) => [path, Buffer.from(data).toString('utf8')])
}

function find(archive, test, what) {
  const match = archive.find(([path]) => test(path))
  if (!match) throw new Error(`No icon for ${what}`)
  return match[1]
}

function findOptional(archive, test) {
  return archive.find(([path]) => test(path))?.[1]
}

function clean(svg) {
  return optimize(svg, {
    multipass: true,
    plugins: [
      'preset-default',
      'removeDimensions',
      'removeXMLNS',
      { name: 'removeAttrs', params: { attrs: 'data-name' } },
    ],
  }).data.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
}

function words(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function entryFields(source, category, [slug, title, art, form, aliases, keywords]) {
  return {
    id: `${source}:${slug}`,
    title,
    category,
    form,
    aliases: aliases ? aliases.split('|') : [],
    keywords: [...new Set([...words(title), ...words(keywords)])],
    art,
  }
}

function writeSet(name, set) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(set))
  const bytes = Buffer.byteLength(JSON.stringify(set))
  console.log(`${name}: ${set.entries.length} entries, ${Object.keys(set.art ?? {}).length} images, ${bytes} bytes`)
}

async function buildAws() {
  const archive = await svgArchive(AWS_PACKAGE_URL, 'aws.zip')
  const art = {}
  const entries = []
  for (const [category, list] of Object.entries(AWS)) {
    for (const item of list) {
      const entry = entryFields('aws', category, item)
      const [kind, stem] = entry.art.split(':')
      const key = entry.art
      if (!art[key]) {
        if (kind === 'service') {
          art[key] = { light: clean(find(archive, (p) => p.endsWith(`/Arch_${stem}_32.svg`), key)) }
        } else if (kind === 'resource') {
          art[key] = { light: clean(find(archive, (p) => p.endsWith(`/Res_${stem}_48.svg`), key)) }
        } else if (kind === 'general') {
          art[key] = {
            light: clean(find(archive, (p) => p.endsWith(`/Res_${stem}_48_Light.svg`), key)),
            dark: clean(find(archive, (p) => p.endsWith(`/Res_${stem}_48_Dark.svg`), key)),
          }
        } else if (kind === 'group') {
          const dark = findOptional(archive, (p) => p.endsWith(`/${stem}_32_Dark.svg`))
          art[key] = {
            light: clean(find(archive, (p) => p.endsWith(`/${stem}_32.svg`), key)),
            ...(dark ? { dark: clean(dark) } : {}),
          }
        } else {
          throw new Error(`Unknown art ${key}`)
        }
      }
      entries.push(entry)
    }
  }
  writeSet('aws', { art, entries })
}

async function buildAzure() {
  const archive = await svgArchive(AZURE_PACKAGE_URL, 'azure.zip')
  const art = {}
  const entries = []
  for (const [category, list] of Object.entries(AZURE)) {
    for (const item of list) {
      const entry = entryFields('azure', category, item)
      art[entry.art] ??= { light: clean(find(archive, (p) => p.endsWith(`-icon-service-${entry.art}.svg`), entry.art)) }
      entries.push(entry)
    }
  }
  writeSet('azure', { art, entries })
}

async function buildGcp() {
  const archive = [
    ...(await svgArchive(GCP_CORE_URL, 'gcp-core.zip')),
    ...(await svgArchive(GCP_CATEGORY_URL, 'gcp-category.zip')),
  ]
  const art = {}
  const entries = []
  for (const [category, list] of Object.entries(GCP)) {
    for (const item of list) {
      const entry = entryFields('gcp', category, item)
      const folder = entry.art.split(':')[1]
      art[entry.art] ??= {
        light: clean(find(archive, (p) => p.includes(`/${folder}/SVG/`) && /-color(-rgb)?\.svg$/.test(p), entry.art)),
      }
      entries.push(entry)
    }
  }
  writeSet('gcp', { art, entries })
}

async function buildKubernetes() {
  const art = {}
  const entries = []
  for (const [category, list] of Object.entries(KUBERNETES)) {
    for (const item of list) {
      const entry = entryFields('k8s', category, item)
      if (!art[entry.art]) {
        const [group, name] = entry.art.split('/')
        art[entry.art] = { light: clean((await kubernetesIcon(group, name)).toString('utf8')) }
      }
      entries.push(entry)
    }
  }
  writeSet('k8s', { art, entries })
}

function buildLogos() {
  const bySlug = new Map()
  for (const icon of Object.values(simpleIcons)) {
    if (icon && typeof icon === 'object' && 'slug' in icon) bySlug.set(icon.slug, icon)
  }
  const entries = []
  for (const [category, { form, slugs }] of Object.entries(LOGOS)) {
    for (const slug of slugs.split(/\s+/)) {
      const icon = bySlug.get(slug)
      if (!icon) throw new Error(`Simple Icons has no ${slug}`)
      entries.push({
        id: `logo:${slug}`,
        title: icon.title,
        category,
        form,
        aliases: [...new Set([slug, icon.title.toLowerCase(), ...(LOGO_ALIASES[slug]?.split('|') ?? [])])],
        keywords: [...new Set([slug, ...words(icon.title)])],
        path: icon.path,
      })
    }
  }
  writeSet('logos', { entries })
}

await buildAws()
await buildAzure()
await buildGcp()
await buildKubernetes()
buildLogos()
