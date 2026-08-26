// e2e/message-templates.spec.js — 訊息模板管理頁 E2E（Playwright，mock 模式，v1.1.16 簡化）
// 從 admin 內 tab 進（F11-1 業主決策；committee 看不到入口）
//
// v1.1.16：管理頁簡化為「單 tab＋兩個編輯區塊」（新案件 new_case / 時間軸 timeline），
// 砍掉雙層下拉變數插入 + IntelliSense + 點擊插入面板，改用 textarea + 即時預覽。
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

test('點訊息模板 tab → 單 tab 兩區塊管理頁（v1.1.16 簡化）', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  // v1.1.16：單「訊息模板」，兩個編輯區塊（新案件 / 時間軸）+ 各一「編輯」「重置出廠預設」
  await expect(page.getByText('新案件')).toHaveCount(1)
  await expect(page.getByText('時間軸')).toHaveCount(1)
  // mock fixture 有 new_case + timeline 各 1 筆 → 列表兩行
  await expect(page.locator('.tmpl-row')).toHaveCount(2)
})

test('編輯 modal 含 body textarea + 即時預覽（v1.1.16：砍下拉變數插入面板）', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  // 兩個區塊各一個「編輯」鈕
  await expect(page.getByText('編輯')).toHaveCount(2)
  await page.getByText('編輯').first().click()
  await page.waitForSelector('.modal', { timeout: 5000 })
  // textarea 存在（v1.1.16：純 textarea）
  await expect(page.locator('.tmpl-body')).toBeVisible()
  // v1.1.16 已砍除：下拉變數插入、點擊插入面板、插入按鈕
  await expect(page.getByText('插入游標位置')).not.toBeVisible()
  expect(page.locator('.insert-panel')).toHaveCount(0)
  // 即時預覽存在，且用範例資料渲染出內容（非佔位文字）
  await expect(page.locator('.tmpl-preview')).toBeVisible()
  await expect.poll(async () => {
    const t = (await page.locator('.tmpl-preview').textContent()) || ''
    return t.length > 0 && !t.includes('(預覽將顯示於此)')
  }, { timeout: 5000 }).toBe(true)
})

test('G7 重置出廠預設按鈕存在', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  await expect(page.getByText('重置出廠預設')).toHaveCount(2)
})
