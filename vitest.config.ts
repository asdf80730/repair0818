// vitest.config.ts — @cloudflare/vitest-pool-workers 設定
// 參考官方 D1 fixture：
//   wrangler.configPath 提供 D1/R2/vars binding（tests/worker.ts 包 Hono app）
//   readD1Migrations + applyD1Migrations
import path from 'node:path'
import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig(async () => {
  // 讀取 migrations 目錄（D1 fixture 模式）
  const migrationsPath = path.join(import.meta.dirname, 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    test: {
      poolOptions: {
        workers: {
          // main 由 wrangler.test.jsonc 指定（tests/worker.ts，包 Hono app）
          wrangler: {
            configPath: './wrangler.test.jsonc',
          },
          miniflare: {
            // 測試專用 TEST_MIGRATIONS binding（供 applyD1Migrations 使用）
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
      setupFiles: ['./tests/apply-migrations.ts'],
      include: ['tests/**/*.test.ts'],
      testTimeout: 90_000,
    },
  }
})
