# 核心端點測試案例

> 對應開發文件 §10「下一批文件」第 2 項。用 `@cloudflare/vitest-pool-workers` 在真實 workerd runtime 跑，D1 用 miniflare。
> 執行環境：需 glibc（本機 mac/Windows/Linux、GitHub Actions 等），Alpine musl 沙箱無法執行 workerd。
> 版本：v1.1.9（已擴充至 110 單元測試 + 11 E2E）

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

> 斷言 2–4 依賴 M2/M5 實作（auth/session 目前 501、CSV 簽名需 JWT_SECRET），測試中先 `it.skip`，里程碑完成後移除 `.skip` 即可驗證。

## 測試檔結構（v1.1.9，110 單元測試）

```
tests/
├── app.test.ts            # app 組裝 + middleware 掛載順序 + §10 回歸斷言（19）
├── tickets.test.ts        # M3 案件核心（建單/列表/詳情）（4）
├── ticket-actions.test.ts # M4 案件動作（回報/留言/作廢/reopen）（4）
├── share.test.ts          # M6 share 公開頁 + token 重發（5）
├── coverage.test.ts       # 覆蓋補齊（photos/users防呆/options/vendors/logout/void/篩選/share photos）（29）
├── boundary.test.ts       # 邊界與例外（權限邊界/欄位驗證/D7/reopen/comments/分頁/auth/session/404）（28）
├── assoc.test.ts          # v1.1.7 類別關聯（join 表/三模式/category_ids 三態/assoc 端點/catalog）（21）
├── apply-migrations.ts    # setup：套用 D1 migrations（cloudflare:test）
└── env.d.ts               # 測試環境型別（DB/PHOTOS/TEST_MIGRATIONS）
```

E2E（`e2e/app.spec.js`，Playwright，對正式網域 ?mock=true）：**11 個測試**涵蓋列表/建單（下拉式）/詳情（分享格式、編輯、指派廠商在編輯頁）/權限中文/篩選/按鈕顏色/常用說明下拉/重新產生分享連結/狀態 tab/管理頁/統計頁。

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
期望：501（M2 未實作，進到 handler）
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

## 里程碑完成後補驗證

M2 完成後：
- pending 打 `GET /api/auth/me` → 200（含 display_name）
- 建立 pending user → 簽 JWT → 帶 Cookie 打 me

M5 完成後：
- 用 JWT_SECRET 簽出有效 sig → 帶 query 打 CSV → 200
- sig 錯誤 → 401
