// vitest.config.ts — @cloudflare/vitest-pool-workers 設定
// 結合官方 fixture：
//   pages-functions-unit-integration-self（main + ASSETS binding + globalSetup）
//   d1（wrangler.configPath 提供 D1 binding + readD1Migrations + applyD1Migrations）
import path from 'node:path'
import {
  buildPagesASSETSBinding,
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config'

const assetsPath = path.join(import.meta.dirname, 'public')

export default defineWorkersConfig(async () => {
  // 讀取 migrations 目錄（D1 fixture 模式）
  const migrationsPath = path.join(import.meta.dirname, 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    test: {
      poolOptions: {
        workers: {
          // main 由 wrangler.test.jsonc 指定（dist-functions/index.js）
          wrangler: {
            configPath: './wrangler.test.jsonc',
          },
          miniflare: {
            // Pages 靜態資產 binding + 測試專用 TEST_MIGRATIONS binding
            serviceBindings: {
              ASSETS: await buildPagesASSETSBinding(assetsPath),
            },
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
      globalSetup: ['./global-setup.ts'],
      setupFiles: ['./tests/apply-migrations.ts'],
      include: ['tests/**/*.test.ts'],
      testTimeout: 90_000,
    },
  }
})
