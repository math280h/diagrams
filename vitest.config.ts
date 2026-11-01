import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import { COVERAGE_EXCLUDE, COVERAGE_INCLUDE } from './scripts/coverage-files.ts'
import viteConfig from './vite.config.ts'

// Vite optimizes the dependencies of warm-up files while browser tests run, and then reloads a running test.
const { warmup: _warmup, ...server } = viteConfig.server ?? {}

export default mergeConfig(
  { ...viteConfig, server },
  defineConfig({
    test: {
      coverage: {
        provider: 'v8',
        include: COVERAGE_INCLUDE,
        exclude: COVERAGE_EXCLUDE,
        reporter: ['text-summary', 'json-summary', 'json', 'html'],
        reportOnFailure: true,
        thresholds: { statements: 58, branches: 49, functions: 49, lines: 61 },
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'scripts/**/*.test.ts', 'actions/**/*.test.mjs'],
            exclude: ['src/**/*.browser.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['src/**/*.browser.test.ts'],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
)
