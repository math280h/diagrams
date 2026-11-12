import { describe, expect, it } from 'vitest'
import { readConfig } from './config'

const SECRET = 'a-secret-with-at-least-32-characters'

describe('readConfig', () => {
  it('stores in a folder without proof of work by default', () => {
    const config = readConfig({})
    expect(config).toMatchObject({
      port: 8080,
      host: '0.0.0.0',
      storage: { kind: 'fs', dir: '/data/reports' },
      retentionMs: 30 * 24 * 60 * 60 * 1000,
      pow: { provider: 'none', secret: '' },
      allowedOrigins: [],
      trustProxyHops: 0,
      limits: { reportsPerHour: 20, challengesPerHour: 60, dailyReports: 2000, dailyBytes: 2048 * 1024 * 1024 },
    })
  })

  it('reads a bucket', () => {
    const config = readConfig({
      STORAGE: 's3',
      S3_ENDPOINT: 'https://s3.example',
      S3_BUCKET: 'reports',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_PATH_STYLE: 'true',
    })
    expect(config.storage).toEqual({
      kind: 's3',
      endpoint: 'https://s3.example',
      bucket: 'reports',
      region: 'auto',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      pathStyle: true,
      prefix: 'reports/',
    })
  })

  it('names each variable that is missing or wrong', () => {
    expect(() => readConfig({ STORAGE: 's3', S3_ENDPOINT: 'https://s3.example' })).toThrow(
      /S3_BUCKET[\s\S]*S3_ACCESS_KEY_ID[\s\S]*S3_SECRET_ACCESS_KEY/,
    )
    expect(() => readConfig({ PORT: 'eighty' })).toThrow(/PORT/)
    expect(() => readConfig({ RETENTION_DAYS: '0' })).toThrow(/RETENTION_DAYS/)
    expect(() => readConfig({ POW_PROVIDER: 'mcaptcha', POW_SECRET: SECRET })).toThrow(/POW_PROVIDER/)
  })

  it('needs a long secret for a proof of work', () => {
    expect(() => readConfig({ POW_PROVIDER: 'altcha' })).toThrow(/POW_SECRET must have at least 32 characters/)
    expect(() => readConfig({ POW_PROVIDER: 'cap', POW_SECRET: 'short' })).toThrow(/POW_SECRET/)
    expect(readConfig({ POW_PROVIDER: 'cap', POW_SECRET: SECRET }).pow).toEqual({ provider: 'cap', secret: SECRET })
  })

  it('accepts only origins in the list of websites', () => {
    expect(readConfig({ ALLOWED_ORIGINS: 'https://a.example, http://127.0.0.1:5173' }).allowedOrigins).toEqual([
      'https://a.example',
      'http://127.0.0.1:5173',
    ])
    expect(() => readConfig({ ALLOWED_ORIGINS: 'https://a.example/' })).toThrow(
      /"https:\/\/a.example\/" is not an origin/,
    )
    expect(() => readConfig({ ALLOWED_ORIGINS: 'a.example' })).toThrow(/not an origin/)
  })
})
