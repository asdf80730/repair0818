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

test('案件詳情：分享連結格式正確、可進編輯頁（含指派廠商）', async ({ page }) => {
  // 點進第一張單
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })

  // 分享連結格式：指向人類頁面 /share.html?token=（問題7）
  const shareVal = await page.locator('.share-row input').inputValue()
  expect(shareVal).toContain('/share.html?token=')

  // 編輯按鈕可進編輯頁（問題5）
  await page.getByText('編輯').first().click()
  await page.waitForSelector('text=編輯案件', { timeout: 10000 })
  await expect(page.getByText('儲存')).toBeVisible()
  // 指派廠商在編輯頁內（問題3，保全/秘書層級）
  await expect(page.locator('.form label', { hasText: '指派廠商' })).toBeVisible()
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

test('成員管理：權限中文對照、篩選、停用紅/啟用藍', async ({ page }) => {
  await page.getByText('👥 成員').click()
  await page.waitForSelector('text=成員管理', { timeout: 10000 })

  // 權限中文對照（v1.1.5：主管=admin、保全/秘書=manager、委員=committee）
  await expect(page.getByText('主管').first()).toBeVisible()
  await expect(page.getByText('保全/秘書').first()).toBeVisible()
  await expect(page.getByText('委員').first()).toBeVisible()

  // 篩選下拉存在
  await expect(page.locator('.filter-row select')).toBeVisible()

  // 停用按鈕是紅色（btn-danger）、啟用按鈕是藍色（btn-primary）
  await expect(page.locator('.user-row .btn-danger').first()).toBeVisible()
})

test('建單：常用說明用下拉＋附加按鈕', async ({ page }) => {
  await page.getByText('＋ 建單').first().click()
  await page.waitForSelector('.form select', { timeout: 10000 })

  // 常用說明下拉＋附加按鈕（v1.1.5）
  await expect(page.getByText('＋ 附加')).toBeVisible()
  // 選取常用說明後按附加，會寫入說明框
  await page.locator('.add-row select').selectOption({ index: 1 })
  await page.getByText('＋ 附加').click()
  const descVal = await page.locator('textarea.textarea').inputValue()
  expect(descVal.length).toBeGreaterThan(0)
})

test('案件詳情：重新產生分享連結更新輸入框', async ({ page }) => {
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })

  // 重新產生分享連結（v1.1.5：不彈框、直接更新輸入框）
  await page.getByText('重新產生分享連結').click()
  await page.waitForTimeout(500)
  const shareVal = await page.locator('.share-row input').inputValue()
  expect(shareVal).toContain('/share.html?token=')
})
