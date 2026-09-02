// playwright.config.js — 前端互動 E2E 測試設定（ESM）
// 用 mock 模式繞過 LINE 登入，對已部署的 Pages 網域跑
import { defineConfig } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // GitHub Actions 預設 /dev/shm 僅 64MB、部分沙箱（PRoot）根本沒 /dev/shm——
        // Chromium 用 /dev/shm 做 renderer 共享記憶體，不足時 renderer OOM、
        // 觀察為偶發 `Protocol error (Runtime.callFunctionOn): ... session closed`。
        // 改用 /tmp 當共享記憶體，根治（CI 與本機一致）
        launchOptions: { args: ['--disable-dev-shm-usage'] },
      },
    },
  ],
})
