// vitest.config.ts — @cloudflare/vitest-pool-workers 設定
// 參考官方 fixture：
//   pages-functions-unit-integration-self（main + ASSETS binding + globalSetup）
//   d1（readD1Migrations + applyD1Migrations）
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
          main: './dist-functions/index.js',
          miniflare: {
            compatibilityDate: '2026-08-01',
            compatibilityFlags: ['nodejs_compat'],
            serviceBindings: {
              ASSETS: await buildPagesASSETSBinding(assetsPath),
            },
            d1Databases: { DB: '00000000-0000-0000-0000-000000000000' },
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
