import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { mergeScriptCovs } from '@bcoe/v8-coverage'
import { test as base } from '@playwright/test'
import type { ScriptCoverage } from '../scripts/coverage-files.ts'

export * from '@playwright/test'

/** The folder for the V8 coverage that the web tests write when you set `E2E_COVERAGE`. */
export const E2E_COVERAGE_DIR = path.join(import.meta.dirname, '..', 'coverage-e2e')

function isAppSource(url: string): boolean {
  return URL.canParse(url) && new URL(url).pathname.startsWith('/src/')
}

export const test = base.extend<{ scriptCoverage: void }, { workerCoverage: Map<string, ScriptCoverage> }>({
  workerCoverage: [
    async ({}, use, workerInfo) => {
      const scripts = new Map<string, ScriptCoverage>()
      await use(scripts)
      if (scripts.size === 0) return
      mkdirSync(E2E_COVERAGE_DIR, { recursive: true })
      writeFileSync(
        path.join(E2E_COVERAGE_DIR, `${process.pid}-${workerInfo.workerIndex}.json`),
        JSON.stringify([...scripts.values()]),
      )
    },
    { scope: 'worker' },
  ],
  scriptCoverage: [
    async ({ page, workerCoverage }, use) => {
      if (!process.env.E2E_COVERAGE) {
        await use()
        return
      }
      await page.coverage.startJSCoverage({ resetOnNavigation: false })
      await use()
      for (const entry of await page.coverage.stopJSCoverage()) {
        if (entry.source === undefined || !isAppSource(entry.url)) continue
        const known = workerCoverage.get(entry.url)
        const functions = known
          ? (mergeScriptCovs([
              { scriptId: '0', url: entry.url, functions: known.functions },
              { scriptId: '0', url: entry.url, functions: entry.functions },
            ])?.functions ?? known.functions)
          : entry.functions
        workerCoverage.set(entry.url, { url: entry.url, source: known?.source ?? entry.source, functions })
      }
    },
    { auto: true },
  ],
})
