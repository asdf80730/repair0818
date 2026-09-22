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
      // zod 3.25 ESM 入口使用 `import * as z ...; export { z }`；vite 5.4 SSR transform
      // 對 namespace 再重出的 named binding 解析為 undefined，改走已展平 binding 的 cjs 版。
      zod: path.resolve(import.meta.dirname, 'node_modules/zod/index.cjs'),
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
  },
})
