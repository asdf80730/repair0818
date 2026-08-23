// e2e/daily-report.spec.js — F10 v1.1.15 案件動態訊息框 E2E（Playwright，mock 模式）
// 跑正式網域 ?mock=true（與其他 e2e 同步）
//
// F10 對齊：本版有 mock 攔截（mockOptions.message_template + mockApi daily-report handler）
// 可驗：UI 結構、日期預設、mock 渲染訊息、複製按鈕
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/stats`)
  await page.waitForSelector('text=案件動態', { timeout: 15000 })
})

test('案件動態區塊結構存在', async ({ page }) => {
  await expect(page.getByText('案件動態')).toBeVisible()
  const dateInput = page.locator('.report-box input[type=date]')
  await expect(dateInput).toBeVisible()
  const todayTaipei = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  await expect(dateInput).toHaveAttribute('max', todayTaipei)
  await expect(page.locator('.report-box select')).toBeVisible()
  await expect(page.getByText('📋 複製')).toBeVisible()
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

test('mock 攔截：daily-report 回傳 template.body 渲染到 textarea', async ({ page }) => {
  // 等 mock fetch 完成 + 渲染
  await expect.poll(async () => {
    const v = await page.locator('.report-box textarea').inputValue()
    return v.length > 0 && !v.includes('尚未設定啟用模板') && !v.includes('選擇日期')
  }, { timeout: 8000 }).toBe(true)
  const preview = await page.locator('.report-box textarea').inputValue()
  // 預設模板會渲染成多行（empty 或 report body）
  // mock fixture 條件：date 預設今日 → 對應 mockTickets 沒 last_activity_at 在今日 → empty template body
  // empty body 範例：「今日 2026-08-23 電梯 無案件動態」
  expect(preview).toMatch(/今日 \d{4}-\d{2}-\d{2} \S+ 無案件動態/)
})

test('複製按鈕：textarea 內容被複製到 clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await expect.poll(async () => {
    const v = await page.locator('.report-box textarea').inputValue()
    return v.length > 0
  }, { timeout: 8000 }).toBe(true)
  const text = await page.locator('.report-box textarea').inputValue()
  await page.getByText('📋 複製').click()
  await expect(page.locator('.toast')).toHaveText('已複製', { timeout: 3000 })
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe(text)
})
