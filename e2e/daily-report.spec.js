// e2e/daily-report.spec.js — F10 案件動態訊息框 E2E（Playwright，mock 模式）
// 跑正式網域 ?mock=true（與其他 e2e 同步）
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/stats`)
  await page.waitForSelector('text=案件動態', { timeout: 15000 })
})

test('案件動態區塊：日期 + 類別 + 複製按鈕 + textarea 預覽（v1.1.15）', async ({ page }) => {
  // 標題
  await expect(page.getByText('案件動態')).toBeVisible()
  // 日期 input 存在且 max=今天
  const dateInput = page.locator('.report-box input[type=date]')
  await expect(dateInput).toBeVisible()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  await expect(dateInput).toHaveAttribute('max', today)
  // 類別下拉
  await expect(page.locator('.report-box select')).toBeVisible()
  // 複製按鈕
  await expect(page.getByText('📋 複製')).toBeVisible()
  // textarea 預覽
  const preview = page.locator('.report-box textarea')
  await expect(preview).toBeVisible()
  await expect(preview).toBeDisabled()
})

test('改日期 → 訊息預覽更新（mock 不同日回不同 fixture）', async ({ page }) => {
  const preview = page.locator('.report-box textarea')
  await expect(preview).not.toHaveValue('', { timeout: 8000 })
  const before = await preview.inputValue()

  // 改日期為今天
  const today = new Date().toISOString().slice(0, 10)
  await page.locator('.report-box input[type=date]').fill(today)
  // 等預覽刷新
  await expect.poll(async () => {
    return (await preview.inputValue()) !== before
  }, { timeout: 8000 }).toBe(true)
})

test('切換類別 → 訊息預覽更新', async ({ page }) => {
  const preview = page.locator('.report-box textarea')
  await expect(preview).not.toHaveValue('', { timeout: 8000 })
  const before = await preview.inputValue()

  // 類別下拉切到第二個選項
  const options = page.locator('.report-box select option')
  const count = await options.count()
  if (count >= 2) {
    const secondValue = await options.nth(1).getAttribute('value')
    await page.locator('.report-box select').selectOption(secondValue)
    await expect.poll(async () => {
      return (await preview.inputValue()) !== before
    }, { timeout: 8000 }).toBe(true)
  }
})

test('複製按鈕點擊後 textarea 內容被複製（navigator.clipboard / execCommand fallback）', async ({ page, context }) => {
  // 授與 clipboard 權限
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const preview = page.locator('.report-box textarea')
  await expect(preview).not.toHaveValue('', { timeout: 8000 })
  const text = await preview.inputValue()

  await page.getByText('📋 複製').click()

  // toast 顯示「已複製」
  await expect(page.locator('.toast')).toHaveText('已複製', { timeout: 3000 })

  // clipboard 內容 = textarea 內容
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe(text)
})
