// e2e/app.spec.js — 前端互動 E2E 測試（Playwright，mock 模式，ESM）
// 用 ?mock=true 繞過 LINE 登入（@line/liff-mock），測前端互動完整流程
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/?mock=true`)
  await page.waitForSelector('.ticket-card', { timeout: 15000 })
})

test('案件列表渲染（含 mock 資料）', async ({ page }) => {
  await expect(page.locator('.ticket-card').first()).toBeVisible()
  await expect(page.getByText('電梯－停車場 #0001')).toBeVisible()
  await expect(page.getByText('⚙ 管理')).toBeVisible()
  await expect(page.getByText('👥 成員')).toBeVisible()
})

test('建單完整流程：選類別→地點→填說明→送出→列表新增', async ({ page }) => {
  await page.getByText('＋ 建單').first().click()
  await page.waitForSelector('.chips .chip', { timeout: 10000 })

  await page.locator('.chips').first().getByText('門禁').click()
  await page.locator('.chips').nth(1).getByText('大廳').click()
  await page.locator('textarea.textarea').fill('門禁感應不良')
  await page.getByText('送出建單').click()

  await page.waitForSelector('.ticket-card', { timeout: 10000 })
  await expect(page.getByText(/門禁－大廳 #\d+/)).toBeVisible()
})

test('切換狀態 tab 篩選', async ({ page }) => {
  await page.locator('.tab', { hasText: '已完成' }).click()
  await page.waitForTimeout(500)
  await page.locator('.tab', { hasText: '待處理' }).click()
  await page.waitForSelector('.ticket-card', { timeout: 10000 })
  await expect(page.getByText('電梯－停車場 #0001')).toBeVisible()
})

test('管理頁渲染（admin 專屬）', async ({ page }) => {
  await page.getByText('⚙ 管理').click()
  await page.waitForSelector('text=管理', { timeout: 10000 })
  await expect(page.getByText('類別')).toBeVisible()
  await expect(page.getByText('廠商管理')).toBeVisible()
})

test('統計頁渲染（含 CSV 匯出）', async ({ page }) => {
  await page.getByText('📊 統計').click()
  await page.waitForSelector('text=統計', { timeout: 10000 })
  await expect(page.getByText('匯出 CSV')).toBeVisible()
})
