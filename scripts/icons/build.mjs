import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { unzipSync } from 'fflate'
import * as simpleIcons from 'simple-icons'
import { optimize } from 'svgo'
import { AWS, AZURE, GCP, KUBERNETES, LOGO_ALIASES, LOGOS, SALESFORCE } from './catalog.mjs'
import {
  AWS_PACKAGE_URL,
  AZURE_PACKAGE_URL,
  GCP_CATEGORY_URL,
  GCP_CORE_URL,
  KUBERNETES_ICONS_URL,
  SALESFORCE_ICONS_URL,
} from './sources.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, 'node_modules', '.cache', 'diagram-icons')
const OUT = join(ROOT, 'src', 'canvas', 'icons', 'data')

const SALESFORCE_ICONS_FOLDER = 'package/dist/salesforce-lightning-design-system-icons/'
const SALESFORCE_UTILITY_GLYPH = 0.64
const TAR_BLOCK = 512

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

function tarText(block, start, length) {
  const text = block.toString('latin1', start, start + length)
  const end = text.indexOf('\0')
  return end === -1 ? text : text.slice(0, end)
}

// A tar file is a 512 byte header for each file, then its data, padded to 512 bytes. A header holds the name at 0, the
// size in octal at 124, the type at 156 and a name prefix at 345.
function tarArchive(gzip) {
  const tar = gunzipSync(gzip)
  const files = []
  for (let offset = 0; offset + TAR_BLOCK <= tar.length;) {
    const header = tar.subarray(offset, offset + TAR_BLOCK)
    const name = tarText(header, 0, 100)
    if (!name) break
    const size = Number.parseInt(tarText(header, 124, 12).trim() || '0', 8)
    const prefix = tarText(header, 345, 155)
    const type = tarText(header, 156, 1)
    const data = tar.subarray(offset + TAR_BLOCK, offset + TAR_BLOCK + size)
    if (type === '0' || type === '') files.push([prefix ? `${prefix}/${name}` : name, data.toString('utf8')])
    offset += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
  }
  return files
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

async function buildSalesforce() {
  const archive = tarArchive(await download(SALESFORCE_ICONS_URL, 'salesforce-icons.tgz'))
  const art = {}
  const entries = []
  for (const [category, list] of Object.entries(SALESFORCE)) {
    for (const item of list) {
      const entry = entryFields('salesforce', category, item)
      const [kind, name] = entry.art.split(':')
      art[entry.art] ??= {
        light: clean(find(archive, (p) => p === `${SALESFORCE_ICONS_FOLDER}${kind}/${name}.svg`, entry.art)),
        tile: item[6],
        ...(kind === 'utility' ? { glyph: SALESFORCE_UTILITY_GLYPH } : {}),
      }
      entries.push(entry)
    }
  }
  writeSet('salesforce', { art, entries })
}

const BUILDS = {
  aws: buildAws,
  azure: buildAzure,
  gcp: buildGcp,
  k8s: buildKubernetes,
  logos: buildLogos,
  salesforce: buildSalesforce,
}

const chosen = process.argv.slice(2)
for (const name of chosen) if (!BUILDS[name]) throw new Error(`Unknown icon set ${name}`)
for (const [name, build] of Object.entries(BUILDS)) if (chosen.length === 0 || chosen.includes(name)) await build()
