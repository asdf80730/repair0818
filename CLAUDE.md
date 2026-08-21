# 社區修繕管理系統 — 施工規則

> 完整規格見 `docs/SPEC.md`（v1.1.12 定稿）。本檔為 AI 施工必讀的硬性規則摘要。

## 技術棧與結構
- 後端：Cloudflare Pages Functions + Hono。唯一入口 functions/api/[[path]].ts
  （export const onRequest = handle(app)）；路由在 src/routes/，共用層在 src/lib/。
- 語言分界：functions/、src/ 用 TypeScript；public/ 一律純 JS，禁止 import npm 套件。
- 前端第三方套件一律 vendored 至 public/vendor/ 以 <script src> 載入，禁止 CDN。
- 允許依賴：hono, @hono/zod-validator, jose, zod, browser-image-compression。
- 禁止：Node.js 專屬 API 或套件（jsonwebtoken, bcrypt, fs, multer, sharp, crypto.createHmac）。
- 測試：@cloudflare/vitest-pool-workers（Workers 池跑測試，不用 Jest+mock）。
  ⚠ 執行環境需求：workerd 是 glibc binary，需在 glibc 環境（本機 mac/Windows/Linux、
  GitHub Actions 等）跑 `npm test`；Alpine musl 沙箱無法執行（缺 glibc + 1GB 對齊 mmap）。
  測試設定見 vitest.config.ts（main=Pages Functions build + ASSETS binding + D1 migrations）。

## 硬性規則
1. SQL 一律 env.DB.prepare(...).bind(...)，禁止字串拼接；
   禁止 SELECT *（所有端點，逐欄列出）。
2. D1 不支援互動式交易；多步驟寫入一律 env.DB.batch([...])。
3. 時間寫入一律 new Date().toISOString()；禁止 datetime('now')；
   月份邊界只准用 src/lib/time.ts 的 taipeiMonthRangeUtc()（Asia/Taipei）。
4. API 回應信封統一走 lib/respond.ts：
   { ok:true, data } / { ok:false, error:{ code, message } }。
5. 權限：一律經 src/lib/auth.ts 的 resolveUser()/requireAuth()（每請求從 D1 讀 role/active）；
   禁止只信 JWT 內容；禁止只用前端藏按鈕當權限控制。
   auth/me、auth/logout 用 requireAuth({ allowPending: true })。
6. middleware 掛載順序即安全邊界（見 §1.3）：
   可能在無 Cookie 或 pending 狀態被呼叫的端點（share、GET /exports/tickets.csv），
   一律註冊於全域 requireAuth() 之上，並在端點內自驗（呼叫 resolveUser 或驗簽名）；
   禁止在全域 requireAuth() 之上新增未自驗權限的路由。
7. mutation 端點一律掛 csrfGuard：驗 X-Requested-With: fetch；
   Sec-Fetch-Site 有送且為 cross-site → 拒絕；沒送 → 僅驗 X-Requested-With（相容舊 WebView）。
8. 使用者內容（description, note, display_name, option label, vendor name）
   進 DOM 一律 textContent，禁止 innerHTML。
9. photo_ids 綁定必驗：uploaded_by=本人 && target_id IS NULL && ≤5 張；
   留言照片一律 target_type='update' + target_id=留言 id。
10. share 公開端點只回 §4.5 白名單欄位，禁止回傳時間軸與內部人員資料；
    share 照片端點必驗 target_type='ticket'。
11. ticket_updates 只有 INSERT，禁止 UPDATE/DELETE。
12. 不得自行新增資料表欄位或修改 API 回應格式；需要變更時輸出 diff 建議並停止，等待人工確認。
13. 不確定的 LINE / Cloudflare API 一律留 // TODO: verify against official docs，禁止猜測。

## 產品規則（不可自行更動）
- 狀態流：open → in_progress → done；另有 void；done/void 僅 admin 可 reopen。
- 回報（kind=status）限 manager/admin；留言（kind=comment）三角色皆可、不改狀態。
- 編輯、void、reopen 都必須寫入時間軸；reopen 訊息須帶入實際前狀態（已完成／已作廢）。
- month_done 從 ticket_updates 計算（見 §4.7），禁止用 tickets.closed_at。
- 建單不接受 vendor_id；廠商僅在 PATCH 由 manager/admin 指派。
- **指派廠商只在編輯頁（pages.edit）提供**（v1.1.5），不要塞進列表卡片或詳情頁；權限 manager/admin（保全/秘書層級）。
- **權限中文對照**：主管=admin、保全/秘書=manager、委員=committee（v1.1.5 定案，勿寫反）。
- 編輯權限：committee 僅自己建的單；manager/admin 全部（D7）。
- 統計頁三角色皆可（D6）；CSV 匯出限 manager/admin（D3）。
- committee 看得到 vendor_name 但 GET /api/vendors 限 manager/admin——刻意設計，勿「順手修掉」。

## 部署與 preview（v1.1.5 決策）
- preview 自動部署已關閉（preview_deployment_setting: none）。單人開發直接 push main 走 production。
- production 的 D1/R2/JWT_SECRET/LINE_CHANNEL_ID 已設定；preview 未設（也不需設）。

## 類別關聯（v1.1.7，硬性規則）
- **0002_seed.sql 一字不可改**（已套用到 production，D1 d1_migrations 只套未套用）。關聯一律寫新的 migration。
- `option_categories` join 表：多對多，一個 option 可屬多個 category；**無關聯列 = 通用，所有類別可見**。
- **P7 以類別為中心**：類別列表顯示 `location_count`/`description_count`＋「設定關聯」按鈕，點開 modal 才載入該類別的地點/說明（`?type=X&category_id=N&include_inactive=1` 附 `associated`）——避免 N+1。`category_id` 與 `include_inactive` 可併用；寫入走 `POST /api/options/:id/assoc`（以類別為中心全量覆寫）。
- **回報範本（`comment_desc`，v1.1.9）不參與類別關聯**：建單的 `description`（使用範本，v1.1.11 正名）可綁類別；回報/留言的 `comment_desc`（回報範本）是通用追蹤說明，**一律全部顯示、不綁類別、不進 `option_categories`**。P7 類別的 `description_count` 只算 `type='description'`。兩者 label 不同，catalog 用 `comment_descs` 與 `descriptions` 分開回傳。
- **P2 catalog 分層快取**（v1.1.7，v1.1.8 優化）：`ensureCatalog()` 全域快取，依後端是否驗證分層——**建單/編輯頁 `ensureCatalog(true)` 用短 TTL（30 秒）**（category/location 後端驗證，避免 400）；**留言/列表頁 `ensureCatalog()` 用 10 分鐘 TTL 快取**（純 UI 不驗證）。無關聯類別 → alert 提示並 `ensureCatalog(true)` 強制重讀。**建單 submit 400 後 alert 並強制重讀更新下拉，不重整頁面保留已輸入資料**。
- 建單驗證 `location_id` 屬於 `category_id` **或為通用**；PATCH 僅當 category/location 有變動時才驗（歷史資料不鎖死）。
- `GET /api/options` 三模式：`?type`（僅 active）、`?type&category_id`（關聯+通用）、`?type&include_inactive=1`（附 category_ids，**限 manager/admin，handler 內判**）。
- `category_ids` 三態：**未帶=不動關聯、[]=清空、有值=全量覆寫**。zod 用 `.optional()` 不用 `.default([])`。
- `include_inactive` 用 `z.enum(['0','1']).transform()`，**不可用 `z.coerce.boolean()`**（`"false"` 也是 true）。

## 登入（硬性規則，勿再犯）
- **`cleanUrlParams()` 只能在登入成功（取 me）之後呼叫**，絕不可放 boot 開頭或 `liff.init()` 之前——LIFF 的 OAuth 授權需要 URL 上的 `code`/`state`，提前清掉會讓一般瀏覽器無法跳 LINE 登入頁（時好時壞的 bug）。
- 一般瀏覽器 `liff.init()` 其實會成功、`liff.login()` 能跳 LINE 登入頁（已實測），**不需**做網頁 OAuth。
- `option_categories` 的 INSERT/DELETE 只允許出現在 `POST`/`PATCH /api/options` 兩處；DELETE WHERE 只能是 `option_id = ?`。
- POST upsert 為「規則 2」明文例外（兩階段：先 `RETURNING id` 再 batch 寫關聯）；禁用 `meta.last_row_id` 當 upsert 後 id。
- join 表 type 由應用層強制（`assertValidAssoc`/`assertCategoryIds`），SQLite CHECK 不能跨表。
- 類別停用 → 僅下拉消失，`option_categories` 列保留（不 DELETE）。
