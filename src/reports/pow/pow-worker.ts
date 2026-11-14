import { errorMessage } from '@/lib/error-message'
import type { ChallengeResponse } from '../protocol'
import { solveProof } from './solve'

export type ProofReply = { ok: true; proof: string | null } | { ok: false; message: string }

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ChallengeResponse>) => void) | null
  postMessage(reply: ProofReply, transfer: Transferable[]): void
}

scope.onmessage = (event) => {
  solveProof(event.data).then(
    (proof) => scope.postMessage({ ok: true, proof }, []),
    (error: unknown) => scope.postMessage({ ok: false, message: errorMessage(error) }, []),
  )
}
