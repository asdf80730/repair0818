// e2e/cache-busting.spec.js — 動態 cache-busting 回歸測試（v1.1.19，Playwright，對正式網域）
//
// 背景：v1.1.17 加 functions/index.html.ts 動態注入 ?v=<commit> 修「部署後看不到新程式」，
// 但當時只有 /index.html 路徑有 Function 對應、根路徑 / 仍回靜態 public/index.html（寫死 ?v=），
// cache-busting 從未生效（2026-08-30 實測發現）。本檔鎖死兩點，防止回歸：
//   1. GET / 的 HTML 是 Function 動態產出：本機 asset 帶 ?v=<12 字元短 SHA>、非寫死的 ?v=1.1.14/1.1.15
//   2. 回應頭 Cache-Control: no-cache（Function 自補，靜態檔是 CF 預設 max-age=0）
// 若 CI 的 GITHUB_SHA 與 /api/hello 的 commit 比對失敗，會先在「Wait for deployment」步驟擋下，
// 此處再比一次是雙重保險（避免測到舊部署）。
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'
const DEPLOY_COMMIT = process.env.GITHUB_SHA || ''

test('根路徑 / 是 Function 動態產出（asset 帶 ?v=<commit 前12字>、no-cache）', async ({ page }) => {
  // 用 page.request 直接取 HTML（不載入整個 app），避免 LIFF SDK 對 headless 的副作用
  const res = await page.request.get(`${BASE}/`)
  expect(res.status()).toBe(200)
  const html = await res.text()

  // 本機 asset 一律 ?v= 參數（動態注入），且非寫死的舊版本號
  const srcs = [...html.matchAll(/src="\/(app|templateEngine|vendor\/[^"]+)\.js\?v=([^"]*)"/g)].map((m) => m[2])
  expect(srcs.length).toBeGreaterThanOrEqual(4) // liff-mock + browser-image-compression + heic2any + templateEngine + app.js
  for (const v of srcs) {
    expect(v, `asset 版本參數 "${v}" 應為 12 字元短 commit SHA（動態注入）`).toMatch(/^[0-9a-f]{12}$/)
  }
  const css = html.match(/href="\/style\.css\?v=([^"]*)"/)
  expect(css, 'style.css 應帶 ?v= 參數').toBeTruthy()
  expect(css[1]).toMatch(/^[0-9a-f]{12}$/)
  // 明確排除「寫死版本號」回歸
  expect(html).not.toContain('?v=1.1.14')
  expect(html).not.toContain('?v=1.1.15')

  // Function 自補的安全／快取標頭（不走 public/_headers）
  expect(res.headers()['cache-control']).toBe('no-cache')
  expect(res.headers()['x-content-type-options']).toBe('nosniff')
})

test('/index.html 路徑與根路徑行為一致（Function 動態產出，非 308 到 /）', async ({ page }) => {
  const res = await page.request.get(`${BASE}/index.html`)
  expect(res.status(), '/index.html 應由 Function 直接回 200（靜態預設是 308 → /）').toBe(200)
  const html = await res.text()
  expect(html).toMatch(/src="\/app\.js\?v=[0-9a-f]{12}"/)
  expect(res.headers()['cache-control']).toBe('no-cache')
})

test('asset ?v 與本次部署 commit 前 12 字一致（若 CI 有 GITHUB_SHA）', async ({ page }) => {
  test.skip(!DEPLOY_COMMIT, '本機跑（無 GITHUB_SHA）跳過；CI 上必跑')
  const res = await page.request.get(`${BASE}/`)
  const html = await res.text()
  const m = html.match(/src="\/app\.js\?v=([^"]*)"/)
  expect(m, 'app.js 應帶 ?v= 參數').toBeTruthy()
  expect(m[1], 'asset 版本應等於本 commit 前 12 字').toBe(DEPLOY_COMMIT.slice(0, 12))
})
