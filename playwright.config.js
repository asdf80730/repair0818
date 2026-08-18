// playwright.config.js — 前端互動 E2E 測試設定
// 用 mock 模式繞過 LINE 登入，對已部署的 Pages 網域跑
const { defineConfig } = require('@playwright/test')

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
