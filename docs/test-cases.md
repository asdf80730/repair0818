# 核心端點測試案例

> 對應開發文件 §10「下一批文件」第 2 項。用 `@cloudflare/vitest-pool-workers` 在真實 workerd runtime 跑，D1 用 miniflare。
> 執行環境：需 glibc（本機 mac/Windows/Linux、GitHub Actions 等），Alpine musl 沙箱無法執行 workerd。
> 版本：v1.1.22（test:local 157 條＝v1.1.20 的 155 條＋v1.1.22 加 `category_id=all` 2 條；v1.1.16 起 SPEC 所載 12 條 `tests/templateEngine.test.js` 隨砍後端引擎而刪，計數以本行 test:local 為準）｜v1.1.19 起 E2E 另含 `e2e/cache-busting.spec.js`（根路徑動態 cache-busting 回歸測試，3 條）；另含 `scripts/check-migration-drift.py`（CI 直查 production D1 比對 migrations，防 schema 漂移——code 層測試抓不到的唯一防線）
> v1.1.21：`e2e/daily-report.spec.js`（4 條，v1.1.15 既有、本版對齊 stats 拆 sub-tab：先點「案件動態」tab 才載入、日期 max/預設值＝今日台灣（`formatToParts` 組 YYYY-MM-DD）、mock daily-render 前端拼裝、複製鈕）＋ `e2e/message-templates.spec.js`（5 條，v1.1.15 既有、本版對齊模板頁重構：管理頁 tab、完整簡報預覽＋模板來源兩行、點模板名稱超連結開 modal-mask 置中彈窗、即時預覽、G7 重置移入 modal 內）
> v1.1.22：`category_id=all`（全部類別合併）unit 測試 2 條（多類別當日案件合併＋`category_label=全部類別`/`category_id=null`；非正整數且非 all 的 `abc/0/1.5` → 400 `VALIDATION_ERROR`）＋ E2E 加 1 條（`e2e/daily-report.spec.js` 共 5 條：類別下拉預設 `all`、預設預覽同時含當日新建與既有案件時間軸）

## 執行方式

```bash
npm test   # 等於 vitest run
```

`tests/worker.ts` 包 Hono app 成標準 ExportedHandler，測試用 `SELF`（cloudflare:test）打真實 HTTP 流程；D1/R2 由 miniflare 提供。

## 回歸斷言（§10 必含）

| # | 情境 | 期望 |
|---|---|---|
| 1 | 未登入打 `GET /api/tickets` | `401 UNAUTHORIZED` |
| 2 | pending 打 `GET /api/auth/me` | `200`（含 display_name） |
| 3 | 無 Cookie 帶有效 sig 打 `GET /api/exports/tickets.csv` | `200` |
| 4 | 無 Cookie 且 sig 錯誤打 `GET /api/exports/tickets.csv` | `401` |

> 斷言 1–4 均已實作並通過（見 `tests/app.test.ts` 對應案例）；不再有 `it.skip` 或 501。

## 測試檔結構（v1.1.15，158 單元測試）

```
tests/
├── app.test.ts            # app 組裝 + middleware 掛載順序 + §10 回歸斷言 + CSV header（A2）（18）
├── tickets.test.ts        # M3 案件核心（建單/列表/詳情）（3）
├── ticket-actions.test.ts # M4 案件動作（回報/留言/作廢/reopen）＋F3 狀態流＋E3 雙寫（8）
├── share.test.ts          # M6 share 公開頁 + token 重發（4）
├── coverage.test.ts       # 覆蓋補齊（photos/users防呆/options/vendors/logout/void/篩選/share photos/編輯照片）（32）
├── boundary.test.ts       # 邊界與例外（權限/欄位/D7/reopen/comments/分頁/auth/session/404/已發包金額）＋A10（32）
├── assoc.test.ts          # v1.1.7 類別關聯（join 表/三模式/category_ids 三態/assoc 端點/catalog）（20）
├── share-html.test.ts     # v1.1.13 分享頁動態標題 + og 標籤（5）
├── stats.test.ts          # v1.1.15：A1 統計完成率 + F1 daily-report（date/category 必填、空態、半開區間）（13）
├── templateEngine.test.ts # v1.1.15：F8 純函式模板引擎（{{var}} 替換 + {{#each}} 迴圈 + 自動變數）（12）
├── messageTemplates.test.ts # v1.1.15：F6 CRUD（三角色讀、committee 不可寫、label 重複、空 body 拒收）（11）
├── apply-migrations.ts    # setup：套用 D1 migrations + PRAGMA FK（C7）
└── env.d.ts               # 測試環境型別（DB/PHOTOS/TEST_MIGRATIONS）
```

E2E（`e2e/app.spec.js`，Playwright，對正式網域 ?mock=true）：**19 個測試**涵蓋列表/卡片（維修內容＋日期＋天數）/建單（下拉式）/詳情（分享格式、編輯、指派廠商在編輯頁）/編輯頁四欄帶入/權限中文/篩選/按鈕顏色/常用說明下拉/回報範本附加寫入＋防重複/重新產生分享連結/狀態 tab/管理頁/統計頁/已發包金額＋必填/**A8 照片選擇器**/**A9 作廢（二次確認）與 reopen modal**。

E2E（`e2e/cache-busting.spec.js`，v1.1.19 新增，不需 mock 登入、直接取 HTML）：**3 個測試**鎖死動態 cache-busting——① `GET /` 應回 200 動態 HTML（asset `?v=<12 位 commit>`、非寫死 `?v=1.1.14/1.1.15`、`Cache-Control: no-cache`、`nosniff`）；② `GET /index.html` 應由 Function 直接回 200（非靜態 308 → /）；③ asset `?v` 應等於本 commit 前 12 字（CI 有 `GITHUB_SHA` 時，本機跑跳過）。

## 核心端點案例（輸入 → 期望輸出）

### 1. 未登入 `GET /api/tickets`
```
輸入：無 Cookie
期望：401 { "ok": false, "error": { "code": "UNAUTHORIZED", "message": "請重新登入" } }
```
驗證：全域 `requireAuth()` 擋下未登入請求。

### 2. 未登入 `POST /api/tickets`
```
輸入：無 Cookie，帶 X-Requested-With: fetch
期望：401 UNAUTHORIZED
```
驗證：mutation 也走 requireAuth。

### 3. 公開 `GET /api/share/badtoken`
```
輸入：無效 token
期望：404 { "ok": false, "error": { "code": "NOT_FOUND", "message": "連結已失效" } }
```
驗證：share 公開端點不需登入即可到達（註冊於 requireAuth 之上）。

### 4. 無簽名 `GET /api/exports/tickets.csv`
```
輸入：無 Cookie、無 sig
期望：401 UNAUTHORIZED
```
驗證：CSV 端點軌 B 簽名驗證。

### 5. 無 CSRF header `POST /api/auth/session`
```
輸入：無 X-Requested-With: fetch
期望：403 FORBIDDEN
```
驗證：csrfGuard 擋下缺 CSRF header 的 mutation。

### 6. 帶 CSRF header `POST /api/auth/session`
```
輸入：{ "id_token": "x" }，帶 X-Requested-With: fetch
期望：LINE 驗證成功 → 200 並建 pending user + Set-Cookie（見 tests/app.test.ts）
```
驗證：csrfGuard 放行後進到 handler。

### 7. 未登入 `POST /api/exports/sign`
```
輸入：無 Cookie，帶 X-Requested-With: fetch
期望：401 UNAUTHORIZED
```
驗證：sign 端點 requireAuth({ roles: ['manager','admin'] }) 擋下。

### 8. `GET /api/hello`
```
輸入：無
期望：200 { "ok": true, "data": "hello" }
```
驗證：M1 部署驗證端點。

> 上述 M1–M5 里程碑案例均已實作並有對應單元測試（見 `tests/app.test.ts`、`tests/coverage.test.ts`），不再有「補驗證」未完成項。

---

## v1.1.15 新增端點案例

### F1-9. `GET /api/stats/daily-report` date 缺 / 格式錯
```
輸入：?category_id=1（缺 date）
期望：400 { "error": { "code": "MISSING_DATE", ... } }

輸入：?date=2026-13-99&category_id=1
期望：400 INVALID_DATE（isValidDate 擋下）

輸入：?date=2030-01-01&category_id=1（晚於台灣今天）
期望：400 DATE_FUTURE
```
驗證：F11-2 業主決策錯誤碼。對應測試：`tests/stats.test.ts` F1 describe。

### F1-10. `GET /api/stats/daily-report` 跨日不混
```
輸入：date=2026-08-23，category=水電（mock fixture 一新建 + 一既有 + 一空類別）
期望：date 回 "2026-08-23"、半開區間 [startIso, endIso) = [2026-08-23T16:00Z, 2026-08-24T16:00Z)
     new_count=1、existing_count=1、total_count=2
```
驗證：F11-7 半開區間、F1 SQL 策略。

### F1-11. `GET /api/stats/daily-report` 當日無更新
```
輸入：date=2026-08-23，category=水電（無任何 ticket）
期望：200 { "total_count": 0, "new_tickets": [], "existing_tickets": [], "template": { "id": N, "body": "..." } }
```
驗證：total_count=0 → 仍回 template.body（**empty** 模板，不是 report）；對應測試：`tests/stats.test.ts` F1「當日無任何案件」。

### F6-1. `GET /api/message-templates?category_id=N&label=new_case`
```
輸入：manager 登入、category_id=1、label=new_case
期望：200 { "templates": [{ "id": 1, "label": "new_case", "body": "{{#each new_cases}}...{{/each}}", "is_category_specific": false }] }
```
驗證：三角色皆可讀；類別關聯優先 / 全域預設 fallback。（v1.1.16 起 label 僅 new_case/timeline；v1.1.20 起 label=鍵、body=內容，內容存於 options.label 欄、type 欄當鍵，body 欄已 DROP）

### F6-2. `PUT /api/message-templates/:id` committee 不可寫
```
輸入：committee 登入、id=1、body="..."
期望：403 FORBIDDEN
```
驗證：PUT 限定 manager/admin。對應測試：`tests/messageTemplates.test.ts`。

### F6-3. `PUT /api/message-templates/:id` 空 body 拒收
```
輸入：manager 登入、id=1、body=""
期望：400 VALIDATION_ERROR
```
驗證：空 body 不更新（清單 F6「唯一改模板方式」）。
