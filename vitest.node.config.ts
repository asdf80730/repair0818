// vitest.node.config.ts — 本地快速回饋用：node pool + D1/R2 shim，不依賴 workerd
// 用法：npm run test:local（約數秒～十幾秒）
// ⚠️ shim 的 D1 語意與真 D1 有差異；CI 的 `npm test`（workers pool）仍是唯一真相。
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // 把官方測試模組換成本地 shim（SELF / env / applyD1Migrations 同名同介面）
      'cloudflare:test': path.resolve(import.meta.dirname, 'tests/node/cloudflare-test-shim.ts'),
    },
  },
  test: {
    setupFiles: ['./tests/node/_icu-polyfill.ts'], // TEMP: 驗證用，驗完移除
    server: {
      deps: {
        // node:sqlite 是較新的內建模組，vite 不認得要手動排除
        external: ['node:sqlite'],
      },
    },
    pool: 'threads',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    // 不掛 apply-migrations.ts：shim 在 module load 時已對 fresh DB 套完全套 migration，
    // setup 再跑一次會重複執行 CREATE TABLE。workers pool 的設定檔不受影響。
    // TEMP: _icu-polyfill.ts 僅為驗證 small-ICU 環境；正式版此行應為 setupFiles: []
    setupFiles: ['./tests/node/_icu-polyfill.ts'],
  },
})
