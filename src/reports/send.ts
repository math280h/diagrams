import {
  challengeResponseSchema,
  errorBodySchema,
  PROOF_HEADER,
  receiptSchema,
  REPORT_API,
  reportApiUrl,
  type ChallengeResponse,
  type Receipt,
} from './protocol'

const REQUEST_TIMEOUT_MS = 30_000
const MIN_UPLOAD_BYTES_PER_MS = 64

/** A report server refused or did not answer a request. The message tells the user what to do. */
export class ReportServerError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ReportServerError'
    this.status = status
  }
}

export interface ReportClient {
  /** The base address of the report server. */
  endpoint: string
  fetch: typeof fetch
  /** Solves a challenge and returns the proof header value, or `null` for no proof of work. */
  solve: (challenge: ChallengeResponse, signal?: AbortSignal) => Promise<string | null>
}

function statusMessage(status: number, serverMessage: string | null): string {
  if (status === 413) return 'The report is larger than the report server accepts. Save it as a file instead.'
  if (status === 429) {
    return 'The report server takes no more reports from this network for now. Try again later, or save the report as a file.'
  }
  if (status === 503) return 'The report server is full for today. Try again tomorrow, or save the report as a file.'
  if (status === 404) return 'The report server does not know this report. It may have deleted it already.'
  return serverMessage ?? `The report server answered with status ${status}.`
}

async function failure(response: Response): Promise<ReportServerError> {
  let serverMessage: string | null = null
  try {
    const parsed = errorBodySchema.safeParse(await response.json())
    if (parsed.success) serverMessage = parsed.data.message
  } catch {
    serverMessage = null
  }
  return new ReportServerError(statusMessage(response.status, serverMessage), response.status)
}

async function request(
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    return await fetchImplementation(url, { ...init, signal: combined, credentials: 'omit', cache: 'no-store' })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ReportServerError('The report server could not be reached. Check the connection and try again.', null)
  }
}

/**
 * Sends an encrypted report: asks the server for a challenge, solves its proof of work, and uploads the report.
 *
 * @throws ReportServerError If the server refuses the report or cannot be reached.
 */
export async function sendReport(
  client: ReportClient,
  encrypted: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<Receipt> {
  const challengeUrl = `${reportApiUrl(client.endpoint, REPORT_API.challenge)}?size=${encrypted.length}`
  const challengeResponse = await request(client.fetch, challengeUrl, { method: 'GET' }, signal)
  if (!challengeResponse.ok) throw await failure(challengeResponse)
  const challenge = challengeResponseSchema.safeParse(await challengeResponse.json())
  if (!challenge.success)
    throw new ReportServerError('The report server sent a challenge that the app cannot read.', null)
  const proof = await client.solve(challenge.data, signal)
  const headers: Record<string, string> = { 'content-type': 'application/octet-stream' }
  if (proof !== null) headers[PROOF_HEADER] = proof
  const response = await request(
    client.fetch,
    reportApiUrl(client.endpoint, REPORT_API.reports),
    { method: 'POST', headers, body: encrypted },
    signal,
    REQUEST_TIMEOUT_MS + Math.ceil(encrypted.length / MIN_UPLOAD_BYTES_PER_MS),
  )
  if (!response.ok) throw await failure(response)
  const receipt = receiptSchema.safeParse(await response.json())
  if (!receipt.success) throw new ReportServerError('The report server sent an answer that the app cannot read.', null)
  return receipt.data
}

/**
 * Deletes a sent report from the server.
 *
 * @throws ReportServerError If the server refuses or cannot be reached. A report that the server deleted already
 *   counts as deleted.
 */
export async function deleteReport(
  client: Pick<ReportClient, 'endpoint' | 'fetch'>,
  receipt: Pick<Receipt, 'id' | 'deleteToken'>,
) {
  const response = await request(client.fetch, reportApiUrl(client.endpoint, `${REPORT_API.reports}/${receipt.id}`), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${receipt.deleteToken}` },
  })
  if (response.ok || response.status === 404) return
  throw await failure(response)
}
