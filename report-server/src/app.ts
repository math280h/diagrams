import { createHash, randomBytes } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { isAgeFile } from '@/reports/age-file'
import { DELETE_TOKEN, PROOF_HEADER, REPORT_API, REPORT_ID, REPORT_SIZE_LIMITS, type Receipt } from '@/reports/protocol'
import type { ServerConfig } from './config'
import { clientAddress, DailyQuota, HourlyLimit, inRanges, limitKey } from './limits'
import type { ProofProvider, SizeClass } from './pow/provider'
import type { ReportStore } from './storage/store'

export interface AppOptions {
  config: Pick<
    ServerConfig,
    'retentionMs' | 'allowedOrigins' | 'trustProxyHops' | 'clientIpHeader' | 'trustedProxies' | 'limits' | 'pow'
  >
  store: ReportStore
  proof: ProofProvider
  now?: () => number
  /** Returns the socket address of the client of a request, or `null`. */
  socketAddress?: (context: Context) => string | null
}

const CORS_METHODS = 'GET, POST, DELETE'
const CORS_HEADERS = `content-type, authorization, ${PROOF_HEADER}`
const CORS_MAX_AGE_SECONDS = '600'

function sizeClass(bytes: number): SizeClass {
  return bytes > REPORT_SIZE_LIMITS.text ? 'dump' : 'text'
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function defaultSocketAddress(context: Context): string | null {
  const env = context.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? null
}

/** Returns the HTTP app of the report server. It logs no request, no body and no address. */
export function createApp(options: AppOptions): Hono {
  const { config, store, proof } = options
  const now = options.now ?? Date.now
  const socketAddress = options.socketAddress ?? defaultSocketAddress
  const reportLimit = new HourlyLimit(config.limits.reportsPerHour, now)
  const challengeLimit = new HourlyLimit(config.limits.challengesPerHour, now)
  const quota = new DailyQuota(config.limits.dailyReports, config.limits.dailyBytes, now)
  const allowedOrigins = new Set(config.allowedOrigins)
  const isTrustedProxy = inRanges(config.trustedProxies)
  const address = (context: Context) => {
    const reported = config.clientIpHeader ? context.req.header(config.clientIpHeader)?.trim() : undefined
    const forwardedFor = context.req.header('x-forwarded-for') ?? null
    return limitKey(
      clientAddress(reported || socketAddress(context), forwardedFor, config.trustProxyHops, isTrustedProxy),
    )
  }
  const fail = (context: Context, status: 400 | 401 | 403 | 404 | 413 | 429 | 500 | 503, message: string) =>
    context.json({ message }, status)

  const app = new Hono()

  app.use(async (context, next) => {
    context.header('cache-control', 'no-store')
    context.header('x-content-type-options', 'nosniff')
    context.header('referrer-policy', 'no-referrer')
    context.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
    const origin = context.req.header('origin')
    if (origin !== undefined) {
      if (!allowedOrigins.has(origin)) return fail(context, 403, 'This website may not send reports to this server.')
      context.header('access-control-allow-origin', origin)
      context.header('vary', 'Origin')
      if (context.req.method === 'OPTIONS') {
        context.header('access-control-allow-methods', CORS_METHODS)
        context.header('access-control-allow-headers', CORS_HEADERS)
        context.header('access-control-max-age', CORS_MAX_AGE_SECONDS)
        return context.body(null, 204)
      }
    }
    await next()
  })

  app.get(REPORT_API.health, (context) => context.json({ ok: true, provider: config.pow.provider }))

  app.get(REPORT_API.challenge, async (context) => {
    const size = Number(context.req.query('size'))
    if (!Number.isInteger(size) || size < 1) return fail(context, 400, 'The size must be a whole number of bytes.')
    if (size > REPORT_SIZE_LIMITS.dump) return fail(context, 413, 'The report is larger than this server accepts.')
    if (!challengeLimit.take(address(context))) return fail(context, 429, 'Too many requests from this network.')
    return context.json(await proof.issue(sizeClass(size)))
  })

  app.post(
    REPORT_API.reports,
    async (context, next) => {
      if (!reportLimit.take(address(context))) return fail(context, 429, 'Too many reports from this network.')
      await next()
    },
    bodyLimit({
      maxSize: REPORT_SIZE_LIMITS.dump,
      onError: (context) => fail(context, 413, 'The report is larger than this server accepts.'),
    }),
    async (context) => {
      const bytes = new Uint8Array(await context.req.arrayBuffer())
      if (!isAgeFile(bytes)) return fail(context, 400, 'A report must be an encrypted age file.')
      const valid = await proof.verify(context.req.header(PROOF_HEADER) ?? null, sizeClass(bytes.length))
      if (!valid) return fail(context, 403, 'The proof of work is missing, wrong, expired or used already.')
      if (!quota.take(bytes.length)) return fail(context, 503, 'This server takes no more reports today.')
      const id = randomBytes(16).toString('hex')
      const deleteToken = randomBytes(32).toString('base64url')
      const createdAt = now()
      try {
        await store.put(id, bytes, { deleteHash: hashToken(deleteToken), createdAt })
      } catch (error) {
        quota.release(bytes.length)
        console.error(`Could not store a report: ${error instanceof Error ? error.message : 'unknown error'}`)
        return fail(context, 500, 'The server could not store the report.')
      }
      const receipt: Receipt = { id, deleteToken, expiresAt: createdAt + config.retentionMs }
      return context.json(receipt, 201)
    },
  )

  app.delete(`${REPORT_API.reports}/:id`, async (context) => {
    const id = context.req.param('id')
    if (!REPORT_ID.test(id)) return fail(context, 404, 'There is no such report.')
    if (!challengeLimit.take(address(context))) return fail(context, 429, 'Too many requests from this network.')
    const token = /^Bearer (.+)$/.exec(context.req.header('authorization') ?? '')?.[1] ?? ''
    if (!DELETE_TOKEN.test(token)) return fail(context, 401, 'The request needs the delete token of the report.')
    const result = await store.remove(id, hashToken(token))
    if (result === 'missing') return fail(context, 404, 'There is no such report.')
    if (result === 'forbidden') return fail(context, 403, 'The delete token does not match the report.')
    return context.body(null, 204)
  })

  app.notFound((context) => fail(context, 404, 'Not found.'))
  app.onError((error, context) => {
    console.error(`Request failed: ${error.name}`)
    return fail(context, 500, 'The server failed.')
  })

  return app
}
