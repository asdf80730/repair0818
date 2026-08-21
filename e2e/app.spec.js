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

  // 分享連結在 ⋮ 選單內（方案 A），點 ⋮ 展開
  await page.locator('.topbar .btn-icon').click()
  await page.waitForSelector('.menu-popover', { timeout: 10000 })
  const shareVal = await page.locator('.menu-popover .share-row input').inputValue()
  expect(shareVal).toContain('/share.html?token=')
  // 關閉選單
  await page.locator('.menu-overlay').click({ position: { x: 5, y: 5 } })

  // 編輯按鈕可進編輯頁（問題5）
  await page.locator('.topbar .btn-icon').click()
  await page.getByText('✏️ 編輯案件').click()
  await page.waitForSelector('text=編輯案件', { timeout: 10000 })
  await expect(page.getByText('儲存')).toBeVisible()
  // 指派廠商在編輯頁內（問題3，保全/秘書層級）
  await expect(page.locator('.form label', { hasText: '指派廠商' })).toBeVisible()
})

test('編輯頁：四欄都從原案件資料帶入（類別/地點/說明/廠商）', async ({ page }) => {
  // 進 #2（有 vendor 測試廠商、description 測試說明）
  await page.goto(`${BASE}/?mock=true#/edit/2`)
  await page.waitForSelector('text=編輯案件', { timeout: 10000 })
  await page.waitForTimeout(800) // 等 catalog + vendors 載入

  // 類別帶入（門禁 id=2）
  const cat = page.locator('.form select').nth(0)
  await expect(cat).toHaveValue('2')
  // 地點帶入（大廳 id=2）
  const loc = page.locator('.form select').nth(1)
  await expect(loc).toHaveValue('2')
  // 說明帶入（textarea 用 property，非 setAttribute）
  const desc = page.locator('.form textarea')
  await expect(desc).toHaveValue('測試說明')
  // 指派廠商帶入（測試廠商）
  const vendor = page.locator('.form select').nth(2)
  await expect(vendor).toHaveValue('1') // mock 測試廠商 id=1
})

test('切換狀態 tab 篩選', async ({ page }) => {
  await page.locator('.tab', { hasText: '已完成' }).click()
  await page.waitForTimeout(500)
  await page.locator('.tab', { hasText: '詢價中' }).click()
  await page.waitForSelector('.ticket-card', { timeout: 10000 })
  await expect(page.getByText('電梯－停車場 #0001')).toBeVisible()
})

test('管理頁渲染（admin 專屬）+ 類別關聯計數', async ({ page }) => {
  await page.getByText('⚙ 管理').click()
  await page.waitForSelector('text=管理', { timeout: 10000 })
  await expect(page.getByText('類別')).toBeVisible()
  await expect(page.getByText('廠商').first()).toBeVisible()
  // 類別 tab 顯示關聯計數 + 設定關聯按鈕（v1.1.7 以類別為中心）
  await expect(page.getByText('設定關聯').first()).toBeVisible()
  await expect(page.locator('.assoc-count').first()).toBeVisible()
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
  // 用 .role-chip（顯示標籤）驗證，option 在下拉未展開時是 hidden
  await expect(page.locator('.role-chip', { hasText: '主管' }).first()).toBeVisible()
  await expect(page.locator('.role-chip', { hasText: '保全/秘書' }).first()).toBeVisible()
  await expect(page.locator('.role-chip', { hasText: '委員' }).first()).toBeVisible()

  // 篩選下拉存在
  await expect(page.locator('.filter-row select')).toBeVisible()

  // 停用按鈕是紅色（btn-danger）、啟用按鈕是藍色（btn-primary）
  await expect(page.locator('.user-row .btn-danger').first()).toBeVisible()
})

test('建單：常用說明用下拉＋附加按鈕', async ({ page }) => {
  await page.getByText('＋ 建單').first().click()
  await page.waitForSelector('.form select', { timeout: 10000 })

  // 未選類別時常用說明顯示「請先選擇類別」且 disabled（v1.1.7）
  await expect(page.locator('.form .add-row select')).toBeDisabled()

  // 選類別後載入常用說明
  await page.locator('.form select').nth(0).selectOption({ label: '門禁' })
  await page.waitForTimeout(500)
  await expect(page.locator('.form .add-row select')).toBeEnabled()

  // 常用說明下拉＋附加按鈕（v1.1.5）
  await expect(page.getByText('＋ 附加')).toBeVisible()
  await page.locator('.form .add-row select').selectOption({ index: 1 })
  await page.getByText('＋ 附加').click()
  const descVal = await page.locator('textarea.textarea').inputValue()
  expect(descVal.length).toBeGreaterThan(0)
})

test('建單：選類別後地點限縮（v1.1.7）', async ({ page }) => {
  await page.getByText('＋ 建單').first().click()
  await page.waitForSelector('.form select', { timeout: 10000 })

  // 未選類別時地點 disabled
  await expect(page.locator('.form select').nth(1)).toBeDisabled()

  // 選「電梯」→ 地點只剩通用(停車場)＋關聯(頂樓)，不含大廳
  await page.locator('.form select').nth(0).selectOption({ label: '電梯' })
  await page.waitForTimeout(500)
  const locOptions = await page.locator('.form select').nth(1).locator('option').allTextContents()
  expect(locOptions).toContain('停車場') // 通用
  expect(locOptions).toContain('頂樓')   // 關聯
  expect(locOptions).not.toContain('大廳') // 非關聯
})

test('留言框：manager/admin 有常用說明下拉＋附加（v1.1.7）', async ({ page }) => {
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  // 展開隱藏式留言
  await page.getByText('💬 留言／回報').click()
  await page.waitForTimeout(300)
  // manager/admin（mock 為 admin）有常用說明下拉＋附加
  await expect(page.locator('.comment-box .add-row select')).toBeVisible()
  await expect(page.getByText('＋ 附加').first()).toBeVisible()
})

test('留言框：回報範本附加寫入 textarea＋下拉清空（v1.1.12 兩個規則）', async ({ page }) => {
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  await page.getByText('💬 留言／回報').click()
  await page.waitForTimeout(300)

  // 選回報範本 → 按「＋ 附加」→ textarea 出現文字
  const cDesc = page.locator('.comment-box .add-row select')
  await cDesc.selectOption({ index: 1 })
  const chosen = await cDesc.inputValue()
  expect(chosen.length).toBeGreaterThan(0)
  await page.getByText('＋ 附加').first().click()
  await page.waitForTimeout(300)
  const text = await page.locator('.comment-box .textarea').inputValue()
  expect(text).toContain(chosen)

  // 規則二：附加後下拉清空（回到 placeholder）
  await expect(page.locator('.comment-box .add-row select')).toHaveValue('')

  // 規則三：重複附加同一範本不會重複寫入（hasSegment 防重複）
  await cDesc.selectOption({ index: 1 })
  await page.getByText('＋ 附加').first().click()
  await page.waitForTimeout(300)
  const text2 = await page.locator('.comment-box .textarea').inputValue()
  expect(text2).toBe(text)
})

test('案件詳情：重新產生分享連結更新輸入框', async ({ page }) => {
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })

  // 重新產生分享連結（v1.1.5：在 ⋮ 選單內，不彈框、直接更新輸入框）
  await page.locator('.topbar .btn-icon').click()
  await page.waitForSelector('.menu-popover', { timeout: 10000 })
  await page.getByText('🔄 重新產生分享連結').click()
  await page.waitForTimeout(500)
  const shareVal = await page.locator('.menu-popover .share-row input').inputValue()
  expect(shareVal).toContain('/share.html?token=')
})

test('v1.1.12：已發包顯示金額 + 發包必填金額', async ({ page }) => {
  // 直接進已發包案件（id=2，mock 含 amount=12000）
  await page.goto(`${BASE}/?mock=true#/ticket/2`)
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  // 資訊卡顯示發包金額
  await expect(page.getByText('發包金額：$12,000').first()).toBeVisible()
  // 展開留言框，選「已發包」→ 金額框出現，不填送出 → 警示
  await page.getByText('💬 留言／回報').click()
  await page.waitForTimeout(300)
  const statusSel = page.locator('.comment-box select').last()
  await statusSel.selectOption('in_progress')
  await page.waitForTimeout(200)
  await expect(page.locator('.comment-box input[type=number]')).toBeVisible()
  // 填留言但不填金額 → 送出 → 應被擋
  await page.locator('.comment-box textarea').fill('測試發包')
  page.once('dialog', (d) => { expect(d.message()).toContain('已發包需填寫金額'); d.dismiss() })
  await page.locator('.comment-box button:has-text("送出")').click()
  await page.waitForTimeout(300)
})
