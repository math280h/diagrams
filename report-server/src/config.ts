import { z } from 'zod'
import { POW_PROVIDERS, type PowProvider } from '@/reports/protocol'
import { parseRange } from './limits'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_SECRET_LENGTH = 32

const switchValue = z
  .enum(['0', '1', 'true', 'false'])
  .default('0')
  .transform((value) => value === '1' || value === 'true')

const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback)

const listValue = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  )

const environmentSchema = z
  .object({
    PORT: integer(8080, 1, 65_535),
    HOST: z.string().default('0.0.0.0'),
    STORAGE: z.enum(['fs', 's3']).default('fs'),
    FS_DIR: z.string().default('/data/reports'),
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PATH_STYLE: switchValue,
    S3_PREFIX: z.string().default('reports/'),
    RETENTION_DAYS: integer(30, 1, 365),
    POW_PROVIDER: z.enum(POW_PROVIDERS).default('none'),
    POW_SECRET: z.string().optional(),
    ALLOWED_ORIGINS: listValue,
    TRUST_PROXY_HOPS: integer(0, 0, 5),
    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[A-Za-z0-9-]*$/, 'CLIENT_IP_HEADER must be the name of a header.')
      .default('')
      .transform((value) => value.toLowerCase()),
    TRUSTED_PROXIES: listValue,
    REPORTS_PER_HOUR: integer(20, 1, 10_000),
    CHALLENGES_PER_HOUR: integer(60, 1, 100_000),
    DAILY_REPORTS: integer(2000, 1, 1_000_000),
    DAILY_MEGABYTES: integer(2048, 1, 1_000_000),
  })
  .superRefine((env, context) => {
    if (env.STORAGE === 's3') {
      for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[name])
          context.addIssue({ code: 'custom', path: [name], message: `${name} is needed with STORAGE=s3.` })
      }
    }
    if (env.POW_PROVIDER !== 'none' && (env.POW_SECRET ?? '').length < MIN_SECRET_LENGTH) {
      context.addIssue({
        code: 'custom',
        path: ['POW_SECRET'],
        message: `POW_SECRET must have at least ${MIN_SECRET_LENGTH} characters with POW_PROVIDER=${env.POW_PROVIDER}.`,
      })
    }
    for (const origin of env.ALLOWED_ORIGINS) {
      let parsed: URL | null = null
      try {
        parsed = new URL(origin)
      } catch {
        parsed = null
      }
      if (!parsed || parsed.origin !== origin) {
        context.addIssue({ code: 'custom', path: ['ALLOWED_ORIGINS'], message: `"${origin}" is not an origin.` })
      }
    }
    for (const range of env.TRUSTED_PROXIES) {
      if (!parseRange(range)) {
        context.addIssue({ code: 'custom', path: ['TRUSTED_PROXIES'], message: `"${range}" is not an address range.` })
      }
    }
  })

export interface S3Settings {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  pathStyle: boolean
  prefix: string
}

export interface ServerConfig {
  port: number
  host: string
  storage: { kind: 'fs'; dir: string } | ({ kind: 's3' } & S3Settings)
  retentionMs: number
  pow: { provider: PowProvider; secret: string }
  allowedOrigins: readonly string[]
  trustProxyHops: number
  /** The lowercase name of the header that holds the address of the client of the nearest proxy, or `''`. */
  clientIpHeader: string
  /** Address ranges such as `173.245.48.0/20` of further proxies, for example a CDN, in front of the nearest proxy. */
  trustedProxies: readonly string[]
  limits: { reportsPerHour: number; challengesPerHour: number; dailyReports: number; dailyBytes: number }
}

/**
 * Reads the configuration of the report server from environment variables.
 *
 * @throws Error If a variable has a value that the server cannot use. The message names each variable.
 */
export function readConfig(env: Record<string, string | undefined>): ServerConfig {
  const parsed = environmentSchema.safeParse(env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`The report server configuration is not valid:\n${lines.join('\n')}`)
  }
  const value = parsed.data
  return {
    port: value.PORT,
    host: value.HOST,
    storage:
      value.STORAGE === 's3'
        ? {
            kind: 's3',
            endpoint: value.S3_ENDPOINT ?? '',
            bucket: value.S3_BUCKET ?? '',
            region: value.S3_REGION,
            accessKeyId: value.S3_ACCESS_KEY_ID ?? '',
            secretAccessKey: value.S3_SECRET_ACCESS_KEY ?? '',
            pathStyle: value.S3_PATH_STYLE,
            prefix: value.S3_PREFIX,
          }
        : { kind: 'fs', dir: value.FS_DIR },
    retentionMs: value.RETENTION_DAYS * DAY_MS,
    pow: { provider: value.POW_PROVIDER, secret: value.POW_SECRET ?? '' },
    allowedOrigins: value.ALLOWED_ORIGINS,
    trustProxyHops: value.TRUST_PROXY_HOPS,
    clientIpHeader: value.CLIENT_IP_HEADER,
    trustedProxies: value.TRUSTED_PROXIES,
    limits: {
      reportsPerHour: value.REPORTS_PER_HOUR,
      challengesPerHour: value.CHALLENGES_PER_HOUR,
      dailyReports: value.DAILY_REPORTS,
      dailyBytes: value.DAILY_MEGABYTES * 1024 * 1024,
    },
  }
}
