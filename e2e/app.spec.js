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

test('建單完整流程：選類別→地點→填說明→送出→跳詳情頁', async ({ page }) => {
  await page.getByText('＋ 建單').first().click()
  await page.waitForSelector('.form select', { timeout: 10000 })

  // 類別/地點改下拉式選單（問題2）
  await page.locator('.form select').nth(0).selectOption({ label: '門禁' })
  await page.locator('.form select').nth(1).selectOption({ label: '大廳' })
  await page.locator('textarea.textarea').fill('門禁感應不良')
  await page.getByText('送出建單').click()

  // 建單成功後跳詳情頁
  await page.waitForURL(/#\/ticket\/\d+/, { timeout: 10000 })
  await expect(page.getByText('案件詳情')).toBeVisible()
})

test('案件詳情：分享連結格式正確、指派廠商下拉存在、可進編輯頁', async ({ page }) => {
  // 點進第一張單
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })

  // 分享連結格式：指向人類頁面 /share.html?token=（問題7）
  const shareVal = await page.locator('.share-row input').inputValue()
  expect(shareVal).toContain('/share.html?token=')

  // 指派廠商下拉存在（問題3，admin 可指派）
  await expect(page.locator('.form label', { hasText: '指派廠商' })).toBeVisible()

  // 編輯按鈕可進編輯頁（問題5）
  await page.getByText('編輯').first().click()
  await page.waitForSelector('text=編輯案件', { timeout: 10000 })
  await expect(page.getByText('儲存')).toBeVisible()
})

test('列表卡片可直接指派廠商（manager/admin）', async ({ page }) => {
  // 列表卡片內嵌廠商下拉（問題3）
  await page.waitForSelector('.vendor-inline', { timeout: 10000 })
  await expect(page.locator('.vendor-inline').first()).toBeVisible()
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
  await expect(page.getByText('廠商').first()).toBeVisible()
})

test('統計頁渲染（含 CSV 匯出）', async ({ page }) => {
  await page.getByText('📊 統計').click()
  await page.waitForSelector('text=統計', { timeout: 10000 })
  await expect(page.getByText('匯出 CSV')).toBeVisible()
})
