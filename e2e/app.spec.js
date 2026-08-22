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

test('卡片：顯示維修內容、建立/最後活動日期、標題補天數（v1.1.13）', async ({ page }) => {
  await page.waitForSelector('.ticket-card', { timeout: 10000 })
  // 維修內容一行
  const firstDesc = page.locator('.ticket-desc').first()
  await expect(firstDesc).toBeVisible()
  const descText = await firstDesc.textContent()
  expect(descText.trim().length).toBeGreaterThan(0)
  // 建立/最後活動同行、只顯示日期（第二個 .ticket-meta 是「建立… · 最後活動…」）
  const metaText = await page.locator('.ticket-meta').nth(1).textContent()
  expect(metaText).toContain('建立')
  expect(metaText).toContain('最後活動')
  expect(metaText).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/) // 日期格式 YYYY/M/D
  // 標題後補「(N 天)」（#1 建立於 08-18，距今 ≥1 天）
  const titleText = await page.locator('.ticket-card').first().locator('.ticket-title').textContent()
  expect(titleText).toMatch(/\(\d+ 天\)/)
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

test('縮圖 lightbox：詳情頁主照片牆點開放大（v1.1.13）', async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/ticket/1`)
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  // 主照片牆有縮圖（expect 自動重試，取代固定 waitForTimeout）
  const wall = page.locator('.photo-wall')
  await expect(wall).toBeVisible()
  await expect(wall.locator('.thumb').first()).toBeVisible()
  const thumbCount = await wall.locator('.thumb').count()
  expect(thumbCount).toBeGreaterThan(0)
  // 點縮圖 → lightbox 出現
  await wall.locator('.thumb').first().click()
  await expect(page.locator('.lightbox')).toBeVisible()
  await expect(page.locator('.lightbox .lightbox-img')).toBeVisible()
  // 點 lightbox 關閉
  await page.locator('.lightbox').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('.lightbox')).toHaveCount(0)
})

test('編輯頁：四欄都從原案件資料帶入（類別/地點/說明/廠商）', async ({ page }) => {
  // 進 #2（有 vendor 測試廠商、description 測試說明）
  await page.goto(`${BASE}/?mock=true#/edit/2`)
  await page.waitForSelector('text=編輯案件', { timeout: 10000 })
  // 等 catalog + vendors 載入：地點下拉被 populate（expect 自動重試）
  const loc = page.locator('.form select').nth(1)
  await expect(loc).toHaveValue('2', { timeout: 8000 })

  // 類別帶入（門禁 id=2）
  const cat = page.locator('.form select').nth(0)
  await expect(cat).toHaveValue('2')
  // 說明帶入（textarea 用 property，非 setAttribute）
  const desc = page.locator('.form textarea')
  await expect(desc).toHaveValue('測試說明')
  // 指派廠商帶入（測試廠商）
  const vendor = page.locator('.form select').nth(2)
  await expect(vendor).toHaveValue('1') // mock 測試廠商 id=1
})

test('切換狀態 tab 篩選', async ({ page }) => {
  await page.locator('.tab', { hasText: '已完成' }).click()
  await expect(page.locator('.tab.active')).toHaveText('已完成')
  await page.locator('.tab', { hasText: '詢價中' }).click()
  await expect(page.locator('.ticket-card').first()).toBeVisible({ timeout: 10000 })
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

  // 選類別後載入常用說明（expect 自動重試，取代固定等待）
  await page.locator('.form select').nth(0).selectOption({ label: '門禁' })
  await expect(page.locator('.form .add-row select')).toBeEnabled({ timeout: 8000 })

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

  // 選「電梯」→ 地點只剩通用(停車場)＋關聯(頂樓)，不含大廳（expect 自動重試取代固定等待）
  await page.locator('.form select').nth(0).selectOption({ label: '電梯' })
  await expect(page.locator('.form select').nth(1).locator('option', { hasText: '頂樓' })).toBeVisible({ timeout: 8000 })
  const locOptions = await page.locator('.form select').nth(1).locator('option').allTextContents()
  expect(locOptions).toContain('停車場') // 通用
  expect(locOptions).toContain('頂樓')   // 關聯
  expect(locOptions).not.toContain('大廳') // 非關聯
})

test('留言框：manager/admin 有常用說明下拉＋附加（v1.1.7）', async ({ page }) => {
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  // 展開隱藏式留言（expect 自動重試取代固定等待）
  await page.getByText('💬 留言／回報').click()
  // manager/admin（mock 為 admin）有常用說明下拉＋附加
  await expect(page.locator('.comment-box .add-row select')).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('＋ 附加').first()).toBeVisible()
})

test('留言框：回報範本附加寫入 textarea＋下拉清空（v1.1.12 兩個規則）', async ({ page }) => {
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  await page.getByText('💬 留言／回報').click()
  const cDesc = page.locator('.comment-box .add-row select')
  await expect(cDesc).toBeVisible({ timeout: 8000 })

  // 選回報範本 → 按「＋ 附加」→ textarea 出現文字（expect.poll 自動重試「包含」）
  await cDesc.selectOption({ index: 1 })
  const chosen = await cDesc.inputValue()
  expect(chosen.length).toBeGreaterThan(0)
  await page.getByText('＋ 附加').first().click()
  await expect.poll(async () => {
    const v = await page.locator('.comment-box .textarea').inputValue()
    return v.includes(chosen)
  }, { timeout: 8000 }).toBe(true)

  // 規則二：附加後下拉清空（回到 placeholder）
  await expect(page.locator('.comment-box .add-row select')).toHaveValue('')

  // 規則三：重複附加同一範本不會重複寫入（hasSegment 防重複）
  const afterFirstAppend = await page.locator('.comment-box .textarea').inputValue()
  await cDesc.selectOption({ index: 1 })
  await page.getByText('＋ 附加').first().click()
  const text2 = await page.locator('.comment-box .textarea').inputValue()
  expect(text2).toBe(afterFirstAppend)
})

test('案件詳情：重新產生分享連結更新輸入框', async ({ page }) => {
  await page.locator('.ticket-card').first().click()
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })

  // 重新產生分享連結（v1.1.5：在 ⋮ 選單內，不彈框、直接更新輸入框）
  await page.locator('.topbar .btn-icon').click()
  await page.waitForSelector('.menu-popover', { timeout: 10000 })
  await page.getByText('🔄 重新產生分享連結').click()
  // 輸入框 token 更新（expect.poll 自動重試取代固定等待）
  await expect.poll(async () => {
    return (await page.locator('.menu-popover .share-row input').inputValue()).includes('/share.html?token=')
  }, { timeout: 8000 }).toBe(true)
})

test('v1.1.12：已發包顯示金額 + 發包必填金額', async ({ page }) => {
  // 直接進已發包案件（id=2，mock 含 amount=12000）
  await page.goto(`${BASE}/?mock=true#/ticket/2`)
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  // 資訊卡顯示發包金額
  await expect(page.getByText('發包金額：$12,000').first()).toBeVisible()
  // 展開留言框，選「已發包」→ 金額框出現，不填送出 → 警示
  await page.getByText('💬 留言／回報').click()
  const statusSel = page.locator('.comment-box select').last()
  await expect(statusSel).toBeVisible({ timeout: 8000 })
  await statusSel.selectOption('in_progress')
  await expect(page.locator('.comment-box input[type=number]')).toBeVisible({ timeout: 8000 })
  // 填留言但不填金額 → 送出 → 應被擋（E9：改用 toast 元素監聽，原 dialog 從不觸發假綠）
  await page.locator('.comment-box textarea').fill('測試發包')
  await page.locator('.comment-box button:has-text("送出")').click()
  await expect(page.locator('.toast')).toHaveText('已發包需填寫金額', { timeout: 3000 })
})

// A9（v1.1.14）：void 作廢 UI E2E——⋮ 選單作廢，二次確認流程觸發
// 注意：mock 模式 api() 直接回 mockApi，不走瀏覽器 fetch，故不能攔截 request。
// 改用驗證「二次確認 dialog 出現」＝確認流程有被觸發。
test('v1.1.14 A9：作廢案件（⋮ 選單 + 二次確認 dialog）', async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/ticket/1`)
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  // 攔截 prompt（作廢原因）與 confirm（二次確認）
  let dialogCount = 0
  page.on('dialog', async (d) => {
    dialogCount++
    if (d.type() === 'prompt') await d.accept('測試作廢')
    else await d.accept() // confirm → 確定作廢
  })
  await page.locator('.topbar .btn-icon').click()
  await page.waitForSelector('.menu-popover', { timeout: 10000 })
  await page.getByText('🗑 作廢案件').click()
  // 應觸發 prompt（作廢原因）→ confirm（二次確認），expect.poll 自動重試
  await expect.poll(() => dialogCount, { timeout: 8000 }).toBeGreaterThanOrEqual(2) // prompt + confirm
})

// A9（v1.1.14）：reopen UI E2E——reopen modal 互動
test('v1.1.14 A9：重新開啟案件（reopen modal 互動）', async ({ page }) => {
  // 進已結案/作廢案件 #5（done）
  await page.goto(`${BASE}/?mock=true#/ticket/5`)
  await page.waitForSelector('text=案件詳情', { timeout: 10000 })
  await page.locator('.topbar .btn-icon').click()
  await page.waitForSelector('.menu-popover', { timeout: 10000 })
  await page.getByText('↩️ 重新開啟').click()
  // modal 出現，可選狀態＋填備註
  await page.waitForSelector('.modal', { timeout: 10000 })
  await expect(page.locator('.modal select')).toBeVisible()
  await page.locator('.modal select').selectOption('in_progress')
  await page.locator('.modal textarea').fill('重新檢查')
  // 點取消應關閉 modal（驗證互動可操作，不觸發 reload 避免重置）
  await page.getByText('取消').click()
  await expect(page.locator('.modal')).toHaveCount(0)
})

// A8（v1.1.14）：照片選擇器 E2E——選照片（mock 回 id）＋縮圖
test('v1.1.14 A8：建單照片選擇器（選照片）', async ({ page }) => {
  await page.goto(`${BASE}/?mock=true#/new`)
  await page.waitForSelector('.form select', { timeout: 10000 })
  await page.locator('.form select').nth(0).selectOption({ label: '門禁' })
  await page.locator('.form select').nth(1).selectOption({ label: '大廳' })
  // 等 catalog 載入，照片輸入框出現
  await page.waitForSelector('.form input[type=file]', { timeout: 10000 })
  // 選 2 張真實 1x1 PNG（browser-image-compression 需可解碼影像）
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await page.locator('.form input[type=file]').setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: png },
    { name: 'b.png', mimeType: 'image/png', buffer: png },
  ])
  // 縮圖預覽出現（expect 自動重試取代固定等待）
  const thumbs = page.locator('.form .photo-preview .photo-thumb')
  await expect(thumbs).toHaveCount(2, { timeout: 8000 })
})
