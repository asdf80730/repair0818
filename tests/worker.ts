// tests/worker.ts — 測試用 main worker entrypoint
// 包 Hono app 成標準 ExportedHandler，讓 D1/R2/vars binding 正常注入
// （Pages worker 編譯產物的 env 結構不同，cloudflare:workers 的 env 拿不到 binding）
import { app } from '../src/app'
import type { Env } from '../src/lib/env'

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>
