import { z } from 'zod'

// zod tests for eval with Function('') when it creates an object schema. A Content-Security-Policy without
// 'unsafe-eval' reports each test as a violation.
z.config({ jitless: true })

export { z }
