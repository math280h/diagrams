import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { REPORT_ID } from '@/reports/protocol'
import { sameHash, type RemoveResult, type ReportStore, type StoredReport } from './store'

const REPORT_SUFFIX = '.age'
const META_SUFFIX = '.json'

async function writeAtomic(file: string, data: Uint8Array | string) {
  const temp = `${file}.tmp-${randomBytes(4).toString('hex')}`
  await writeFile(temp, data, { mode: 0o600 })
  try {
    await rename(temp, file)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

async function readMeta(file: string): Promise<StoredReport | null> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as Partial<StoredReport>
    if (typeof value.deleteHash !== 'string' || typeof value.createdAt !== 'number') return null
    return { deleteHash: value.deleteHash, createdAt: value.createdAt }
  } catch {
    return null
  }
}

/** Returns a store that keeps each report as two files in a folder: the encrypted report and its metadata. */
export function createFsStore(dir: string): ReportStore {
  const reportFile = (id: string) => path.join(dir, `${id}${REPORT_SUFFIX}`)
  const metaFile = (id: string) => path.join(dir, `${id}${META_SUFFIX}`)
  const removeFiles = async (id: string) => {
    await rm(reportFile(id), { force: true })
    await rm(metaFile(id), { force: true })
  }
  return {
    async put(id, bytes, report) {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await writeAtomic(reportFile(id), bytes)
      await writeAtomic(metaFile(id), JSON.stringify(report))
    },
    async remove(id, deleteHash): Promise<RemoveResult> {
      const meta = await readMeta(metaFile(id))
      if (!meta) return 'missing'
      if (!sameHash(meta.deleteHash, deleteHash)) return 'forbidden'
      await removeFiles(id)
      return 'deleted'
    },
    async sweep(before) {
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return 0
      }
      const present = new Set(names)
      let deleted = 0
      for (const name of names) {
        if (name.includes('.tmp-')) {
          await rm(path.join(dir, name), { force: true })
          continue
        }
        if (name.endsWith(META_SUFFIX) && !present.has(`${name.slice(0, -META_SUFFIX.length)}${REPORT_SUFFIX}`)) {
          await rm(path.join(dir, name), { force: true })
          continue
        }
        if (!name.endsWith(REPORT_SUFFIX)) continue
        const id = name.slice(0, -REPORT_SUFFIX.length)
        if (!REPORT_ID.test(id)) continue
        const meta = await readMeta(metaFile(id))
        const createdAt = meta?.createdAt ?? (await stat(reportFile(id))).mtimeMs
        if (createdAt >= before) continue
        await removeFiles(id)
        deleted++
      }
      return deleted
    },
  }
}
