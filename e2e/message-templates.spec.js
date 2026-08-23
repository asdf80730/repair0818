// e2e/message-templates.spec.js — F10 v1.1.15 訊息模板管理頁 E2E
// 從 admin 內 tab 進（F11-1 業主決策）
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/admin`)
  await page.waitForSelector('text=訊息模板', { timeout: 8000 })
})

test('管理頁 tab 含訊息模板（F11-1）', async ({ page }) => {
  const tabs = page.locator('.tab')
  await expect(tabs.filter({ hasText: '訊息模板' })).toBeVisible()
})

test('點訊息模板 tab 切到模板管理頁', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  await page.waitForTimeout(500) // 等 pages.messageTemplates() mount
  // 報告模板 / 無更新訊息 兩個 tab
  await expect(page.getByText('報告模板').first()).toBeVisible()
  await expect(page.getByText('無更新訊息').first()).toBeVisible()
  // 列表至少一筆模板（mock fixture 有 2 筆）
  await expect(page.locator('.tmpl-row').first()).toBeVisible()
})

test('F7 編輯 modal 含下拉變數插入 + 點擊面板 + 預覽', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  await page.waitForTimeout(500)
  // 第一列「編輯」按鈕
  await page.locator('.tmpl-row button').filter({ hasText: '編輯' }).first().click()
  await page.waitForSelector('.modal', { timeout: 5000 })
  // textarea 存在
  await expect(page.locator('.tmpl-body')).toBeVisible()
  // 兩個 select（groupSelect + varSelect）— 在 .tmpl-toolbar 內
  await expect(page.locator('.tmpl-toolbar select').nth(0)).toBeVisible()
  await expect(page.locator('.tmpl-toolbar select').nth(1)).toBeVisible()
  // 插入按鈕
  await expect(page.getByText('插入游標位置')).toBeVisible()
  // 點擊插入面板（含 group label）
  await expect(page.locator('.insert-panel').getByText('頂層變數')).toBeVisible()
  await expect(page.locator('.insert-panel').getByText('控制語法')).toBeVisible()
  // 即時預覽存在
  await expect(page.locator('.tmpl-preview')).toBeVisible()
})

test('G7 重置出廠預設按鈕存在', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByText('重置出廠預設').first()).toBeVisible()
})
