// e2e/daily-report.spec.js — F10 案件動態訊息框 E2E（Playwright，mock 模式）
// 跑正式網域 ?mock=true（與其他 e2e 同步）
//
// 範圍縮小（v1.1.15 修訂）：
// - 只驗 UI 結構存在（標題、日期 input、類別 select、複製按鈕、textarea）
// - **不驗 daily-report API 內容**（mock 層未攔這條 /api/stats/daily-report，
//   需另外在 mock 層加 fetch 攔截才能 e2e 驗內容——留 v1.1.16+）
// - **不驗「改日期/類別 → 預覽更新」**（同上原因，API 真的會打到 production 但 404）
// - 仍驗：日期 input max=今天、textarea readonly、複製按鈕存在
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/stats`)
  await page.waitForSelector('text=案件動態', { timeout: 15000 })
})

test('案件動態區塊結構存在（v1.1.15）', async ({ page }) => {
  // 標題
  await expect(page.getByText('案件動態')).toBeVisible()
  // 日期 input 存在且 max=今天（台灣）
  const dateInput = page.locator('.report-box input[type=date]')
  await expect(dateInput).toBeVisible()
  const todayTaipei = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  await expect(dateInput).toHaveAttribute('max', todayTaipei)
  // 類別下拉存在
  await expect(page.locator('.report-box select')).toBeVisible()
  // 複製按鈕存在
  await expect(page.getByText('📋 複製')).toBeVisible()
  // textarea 預覽存在且 readonly
  const preview = page.locator('.report-box textarea')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('readonly', 'readonly')
})

test('日期選擇器預設值 = 今日台灣', async ({ page }) => {
  const dateInput = page.locator('.report-box input[type=date]')
  const todayTaipei = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  await expect(dateInput).toHaveValue(todayTaipei)
})

test('訊息模板管理頁 nav 入口存在（v1.1.15 F7）', async ({ page }) => {
  // 從 nav 進入訊息模板頁
  await page.goto(`${BASE}/?mock=true#/message-templates`)
  await page.waitForSelector('text=訊息模板', { timeout: 8000 })
  // 兩個 tab：報告模板、無更新訊息
  await expect(page.getByText('報告模板')).toBeVisible()
  await expect(page.getByText('無更新訊息')).toBeVisible()
})
