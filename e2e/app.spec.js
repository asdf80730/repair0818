// e2e/app.spec.js — 前端互動 E2E 測試（Playwright，mock 模式）
// 用 ?mock=true 繞過 LINE 登入（@line/liff-mock），測前端互動完整流程
// 需先部署到 Pages（本測試對正式網域跑）
const { test, expect } = require('@playwright/test')

// 正式網域（部署後）
const BASE = 'https://repair-system-4re.pages.dev'

test.beforeEach(async ({ page }) => {
  // 進列表頁
  await page.goto(`${BASE}/?mock=true`)
  // 等列表載入
  await page.waitForSelector('.ticket-card', { timeout: 15000 })
})

test('案件列表渲染（含 mock 資料）', async ({ page }) => {
  await expect(page.locator('.ticket-card').first()).toBeVisible()
  await expect(page.getByText('電梯－停車場 #0001')).toBeVisible()
  // 底部導覽（admin 可見管理/成員）
  await expect(page.getByText('⚙ 管理')).toBeVisible()
  await expect(page.getByText('👥 成員')).toBeVisible()
})

test('建單完整流程：選類別→地點→填說明→送出→列表新增', async ({ page }) => {
  // 點建單
  await page.getByText('＋ 建單').first().click()
  await page.waitForSelector('.chips .chip', { timeout: 10000 })

  // 選類別「門禁」
  await page.locator('.chips').first().getByText('門禁').click()
  // 選地點「大廳」
  await page.locator('.chips').nth(1).getByText('大廳').click()
  // 填說明
  await page.locator('textarea.textarea').fill('門禁感應不良')
  // 送出
  await page.getByText('送出建單').click()

  // 跳回列表，出現新案件
  await page.waitForSelector('.ticket-card', { timeout: 10000 })
  await expect(page.getByText(/門禁－大廳 #\d+/)).toBeVisible()
})

test('切換狀態 tab 篩選', async ({ page }) => {
  // 點「已完成」
  await page.locator('.tab', { hasText: '已完成' }).click()
  // 等列表更新（mock 資料無已完成，應顯示空）
  await page.waitForTimeout(500)
  // 點「待處理」
  await page.locator('.tab', { hasText: '待處理' }).click()
  await page.waitForSelector('.ticket-card', { timeout: 10000 })
  await expect(page.getByText('電梯－停車場 #0001')).toBeVisible()
})

test('管理頁渲染（admin 專屬）', async ({ page }) => {
  // 點「⚙ 管理」導覽
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
