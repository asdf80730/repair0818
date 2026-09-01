// e2e/message-templates.spec.js — 訊息模板管理頁 E2E（Playwright，mock 模式，v1.1.16 簡化；v1.1.21 重構為「完整簡報預覽＋超連結編輯」）
// 從 admin 內 tab 進（F11-1 業主決策；committee 看不到入口）
//
// v1.1.16：模板 new_case / timeline 兩種。
// v1.1.21：管理頁 = 完整簡報預覽（兩段模板套 fixture 即時組出整篇）+ 模板來源列表（名稱超連結）；
// 點名稱或「編輯」開 modal-mask 置中彈窗（textarea + 即時預覽 + 重置出廠預設 + 儲存），存檔後整篇預覽同步刷新。
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

test('點訊息模板 tab → 完整簡報預覽＋模板來源兩行（v1.1.21）', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  // 兩個模板名稱（超連結）各一
  await expect(page.getByText('新案件')).toHaveCount(1)
  await expect(page.getByText('時間軸')).toHaveCount(1)
  // 模板來源兩行
  await expect(page.locator('.tmpl-row')).toHaveCount(2)
})

test('完整簡報預覽：進頁即組出整篇（v1.1.21）', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  const full = page.locator('.tmpl-full')
  await expect(full).toBeVisible()
  // 用 fixture 渲染出兩段實際內容 + 標題 + 系統連結
  await expect.poll(async () => {
    const t = (await full.textContent()) || ''
    // mock fixture：新案件段 id 12/13、時間軸段 id 3/7（SPEC §F5），用實際 id 斷言
    return t.includes('修繕系統簡報') && t.includes('12.') && t.includes('7.') && t.includes('liff.line.me') && !t.includes('載入中')
  }, { timeout: 5000 }).toBe(true)
})

test('點模板名稱 → modal-mask 置中彈窗＋textarea＋即時預覽（v1.1.21）', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  // 名稱是超連結（v1.1.21 業主：點下去才是編輯處）
  const link = page.locator('.tmpl-name').filter({ hasText: '新案件' })
  await expect(link).toHaveClass(/tmpl-link/)
  await link.click()
  await page.waitForSelector('.modal-mask', { timeout: 5000 })
  // modal 置中在遮罩內（fixed 定位，非文件流）
  await expect(page.locator('.modal-mask .modal')).toBeVisible()
  // textarea 存在且帶既有模板內容（含 {{#each}}）
  const ta = page.locator('.tmpl-body')
  await expect(ta).toBeVisible()
  await expect.poll(async () => (await ta.inputValue()).includes('{{#each new_cases}}'), { timeout: 5000 }).toBe(true)
  // 即時預覽用範例資料渲染出內容（非佔位文字）
  await expect.poll(async () => {
    const t = (await page.locator('.tmpl-preview').textContent()) || ''
    return t.length > 0 && !t.includes('(預覽將顯示於此)')
  }, { timeout: 5000 }).toBe(true)
  // v1.1.16 已砍除：下拉變數插入、點擊插入面板
  expect(page.locator('.insert-panel')).toHaveCount(0)
})

test('G7 重置出廠預設（v1.1.21 移入編輯 modal 內）', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: '訊息模板' }).click()
  await page.locator('.tmpl-row').first().getByRole('button', { name: '編輯' }).click()
  await page.waitForSelector('.modal-mask', { timeout: 5000 })
  // 重置鈕在 modal 內（不再散在列表行）
  await expect(page.locator('.modal-mask').getByText('重置出廠預設')).toBeVisible()
})
