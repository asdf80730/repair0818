// vitest.config.ts — @cloudflare/vitest-pool-workers 設定（0.5.41 新版 API）
// 參考官方 AGENTS.md：測試用 cloudflare:test 的 env，對應 miniflare pool options binding
// 故 D1/R2/vars 一律在 miniflare 提供（不靠 wrangler config）
import path from 'node:path'
import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig(async () => {
  // 讀取 migrations 目錄
  const migrationsPath = path.join(import.meta.dirname, 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    test: {
      poolOptions: {
        workers: {
          // main worker：包 Hono app
          main: './tests/worker.ts',
          miniflare: {
            d1Databases: { DB: '00000000-0000-0000-0000-000000000000' },
            r2Buckets: { PHOTOS: 'test-photos' },
            bindings: {
              TEST_MIGRATIONS: migrations,
              LINE_CHANNEL_ID: 'test-channel',
              JWT_SECRET: 'test-secret',
            },
          },
        },
      },
      setupFiles: ['./tests/apply-migrations.ts'],
      include: ['tests/**/*.test.ts'],
      testTimeout: 90_000,
    },
  }
})
