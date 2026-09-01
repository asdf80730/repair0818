// e2e/daily-report.spec.js — F10 案件動態訊息框 E2E（Playwright，mock 模式 v1.1.16）
// 跑正式網域 ?mock=true（與其他 e2e 同步）
//
// v1.1.16 對齊：daily-render 改「前端拼裝成品」——後端只回 new_cases / timeline_updates
// + templates.{new_case,timeline} body，前端用 templateEngine.render 渲染後疊上硬編
// header「修繕系統簡報：{X月Y日}」、空案文案與（僅有內容時）總系統連結。
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE_URL || 'https://repair-system-4re.pages.dev'

// v1.1.21：與 app.js 的 taipeiDateStr() 完全一致——formatToParts 組 YYYY-MM-DD，locale 無關。
// 舊法用 Intl 'en-CA' 字串，但 en-CA 顯示格式非 spec 保證（完整 ICU 回 MM/DD/YYYY、受限 ICU 回 ISO），
// 且 <input type=date> 只認 YYYY-MM-DD；用 formatToParts 才能兩邊對齊。
function taipeiToday() {
  const p = {}
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).forEach(x => { p[x.type] = x.value })
  return p.year + '-' + p.month + '-' + p.day
}

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/stats`)
  // v1.1.21：案件動態獨立成 sub-tab，先點進該 tab 才載入
  await page.getByRole('button', { name: '案件動態', exact: true }).click()
  await page.waitForSelector('.report-box input[type=date]', { timeout: 15000 })
})

test('案件動態區塊結構存在', async ({ page }) => {
  await expect(page.getByText('案件動態')).toBeVisible()
  const dateInput = page.locator('.report-box input[type=date]')
  await expect(dateInput).toBeVisible()
  await expect(dateInput).toHaveAttribute('max', taipeiToday())
  await expect(page.locator('.report-box select')).toBeVisible()
  await expect(page.getByText('📋 複製')).toBeVisible()
  const preview = page.locator('.report-box textarea')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('readonly', 'readonly')
})

test('日期選擇器預設值 = 今日台灣', async ({ page }) => {
  const dateInput = page.locator('.report-box input[type=date]')
  await expect(dateInput).toHaveValue(taipeiToday())
})

test('mock 攔截：daily-render 前端拼裝成品（header + 新案件 + 連結，v1.1.16）', async ({ page }) => {
  // 明確選電梯，確保 mock 當日新建案件 id=99（电梯－停車場）進入 new_cases
  await page.locator('.report-box select').selectOption({ label: '電梯' })
  // 等 mock fetch 完成 + 前端 render（不再回 template.body，改前端自行拼裝）
  await expect.poll(async () => {
    const v = await page.locator('.report-box textarea').inputValue()
    return v.length > 0
  }, { timeout: 8000 }).toBe(true)
  const preview = await page.locator('.report-box textarea').inputValue()
  // header「修繕系統簡報：{X月Y日}」（R-3：只有月／日、無年份、無星期）
  expect(preview).toContain('修繕系統簡報：')
  expect(preview).toMatch(/：\d+月\d+日/)
  expect(preview).not.toContain('📅')
  // mock fixture 有當日 ticket id=99（电梯－停車場，description=門開關異常）→ new_cases → s1
  expect(preview).toContain('99.')
  expect(preview).toContain('停車場')
  expect(preview).toContain('詢價中') // v1.1.16：新案件狀態固定為「詢价中」（前端文案）
  expect(preview).toContain('門開關異常')
  // R-2：僅在實際有內容時才把總系統連結放在訊息末尾
  expect(preview).toContain('https://liff.line.me/2008484338-AvdMWQQg')
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
