# 社區修繕管理系統 — 施工規則

> 完整規格見 `docs/SPEC.md`（v1.1.20 定稿）。本檔為 AI 施工必讀的硬性規則摘要。

## 技術棧與結構
- 後端：Cloudflare Pages Functions + Hono。唯一入口 functions/api/[[path]].ts
  （export const onRequest = handle(app)）；路由在 src/routes/，共用層在 src/lib/。
- 語言分界：functions/、src/ 用 TypeScript；public/ 一律純 JS，禁止 import npm 套件。
- 前端第三方套件一律 vendored 至 public/vendor/ 以 <script src> 載入，禁止 CDN。
- **C4（v1.1.15）唯一例外**：LINE 官方 LIFF SDK（`https://static.line-scdn.net/liff/edge/2/sdk.js`）走 LINE 平台 CDN，是 LINE LIFF 平台的官方 SDK，必須從 LINE 載入（vendor 無法模擬 LIFF runtime）。liff-mock（測試用）仍 vendored 至 `public/vendor/liff-mock.js`。
- 允許依賴：hono, @hono/zod-validator, jose, zod, browser-image-compression。
- 禁止：Node.js 專屬 API 或套件（jsonwebtoken, bcrypt, fs, multer, sharp, crypto.createHmac）。
- 測試：@cloudflare/vitest-pool-workers（Workers 池跑測試，不用 Jest+mock）。
  ⚠ 執行環境需求：workerd 是 glibc binary，需在 glibc 環境（本機 mac/Windows/Linux、
  GitHub Actions 等）跑 `npm test`；Alpine musl 沙箱無法執行（缺 glibc + 1GB 對齊 mmap）。
  測試設定見 vitest.config.ts（main=Pages Functions build+asset binding + D1 migrations）。
- **本地快速迴圈：`npm run test:local`**（v1.1.15 新增，不用 workerd，~50 秒 170 tests）。
  - 原理：vitest.node.config.ts 用 resolve.alias 把 `cloudflare:test` 指到
    `tests/node/cloudflare-test-shim.ts`——測試檔零改動。SELF.fetch 轉發到 Hono
    `app.request()`；D1 用 `node:sqlite` in-memory shim（tests/node/d1.ts）；R2 用 Map stub。
    shim 在 module load 建 fresh DB＋全套 migrations，並 beforeEach 重置＝等價 workers pool 的 isolatedStorage。
  - `_icu-polyfill.ts` 只在精簡 ICU 的 Node 生效（full-ICU 自動 no-op），避免 en-CA 格式假失敗。
  - **語意警告**：shim 是近似而非真 D1（錯誤訊息格式、meta 細節有差）。
    `npm test`（workers pool / CI）仍是唯一真相；test:local 全綠不代表可跳過 CI。
- **CI 工作流（本專案硬性）**：`.github/workflows/test.yml` 在 **push 後由 GitHub Actions 自動執行**
  `npm ci → typecheck → npm test（單元）→ E2E`。本地驗證優先順序：
  `npm run typecheck` → `npm run test:local`（單元快速迴圈，見上節）→ commit + push 等 CI 綠燈。
  E2E（Playwright，對 production `?mock=true`）一律靠 CI；沙箱內本機可做的語法檢查另有
  `node --check <file>`。
  部署由 Cloudflare 整合自動處理（push main 走 production，preview 已關閉，見 §0.3）。

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
12.1 **討論中的設計不等於拍板**（v1.1.15 起）：變更需求清單（`docs/vX.X.X-變更需求清單.md` 等）
    是業主討論中的工作稿，**不得**將其中未明確拍板的設計細節寫入 SPEC.md / CLAUDE.md /
    lib-spec.md / page-api-map.md / test-cases.md 等正式規格檔。只有當業主明確指示
    「寫進規格」「這個定了」「這樣改」「動 SPEC」並點出具體內容時，才視為拍板；
    其他情況一律先在清單中討論。
12.2 **每輪審查意見必附可達連結**（v1.1.15 起）：當使用者提供審查意見、要求「整合進變更
    報告」「幫我加進去」「參考這份審查」等情境時，回覆**必須**在文末附上受影響變更文件的
    `minis://workspace/repair-system/...` Markdown 連結，讓使用者可直接點選預覽。
    不只給檔名、不只給 shell 路徑——給的是 Markdown 連結語法（App 會渲染為可點選）。
    理由：使用者多在 App 內操作，純檔名路徑無法點選；強制給 Markdown 連結才是「對使用者友善」。
    例：
    - ✅ `📄 [v1.1.15-變更需求清單.md](minis://workspace/repair-system/docs/v1.1.15-變更需求清單.md)`
    - ❌ `請查看 docs/v1.1.15-變更需求清單.md`（沒連結，使用者找不到）
13. 不確定的 LINE / Cloudflare API 一律留 // TODO: verify against official docs，禁止猜測。

## 工作區與檔案結構（v1.1.15 起，硬性規則）
14. **所有原始碼、規格、測試、開發工具**一律放在 `/var/minis/workspace/` 之下；
    禁止使用 `/tmp` 或其他位置當正式施工目錄。`/tmp` 只允許當一次性搬遷/驗證的中繼站。
15. **專案根目錄單層**：放在 `workspace/repair-system/`（單層），不要再加深層次
    （不要 `workspace/repair-system/repo/`、`workspace/repair-system/src/myapp/`）。
    例外：備援的 `.git` 可放他處；當下不適用的搬遷測試 `.gitlocktest`/`.gtest`/`.mvtest` 等
    可放他處，事後必須清掉。

## 產品規則（見 SPEC §0.3 為主，本段僅補 §0.3 未列的 AI 動作相關細則）
- **產品契約**（狀態流、回報/留言權限、時間軸 append-only、廠商不刪除只停用、權限中文對照、指派廠商只編輯頁、編輯權限等）→ **見 SPEC §0.3**，本檔不重複。
- `month_done` 從 `ticket_updates` 計算（見 SPEC §4.7），**禁止用 `tickets.closed_at`**——這是計算「本月完成」的權威來源。
- **廠商排序（v1.1.13）**：`GET /api/vendors` 依 `active DESC, sort_order, id`；後台直接改資料庫、無前端排序介面。**`vendors.phone` 欄位已移除（0008），勿再引用**。
- **統計頁三角色皆可（D6）**；**CSV 匯出限 manager/admin（D3）**。
- **vendor_name 刻意外露**：committee 在詳情頁/列表看得到 `vendor_name`，但 `GET /api/vendors` 限 manager/admin——刻意設計，**勿「順手」開放 list 端點**。

## 部署與 preview（v1.1.5 決策）
- preview 自動部署已關閉（preview_deployment_setting: none）。單人開發直接 push main 走 production。
- production 的 D1/R2/JWT_SECRET/LINE_CHANNEL_ID 已設定；preview 未設（也不需設）。
- **Migrations 不會自動套用（v1.1.19 事故）**：Cloudflare 部署只上程式碼，`migrations/` 新增檔**不會自動跑進 production D1**——寫完 migration 後必須 `npx wrangler d1 migrations apply repair-db0818 --remote` 並實測（v1.1.15 曾漏套 0010–0012 導致 daily-report 500，壞了兩週）。CI 有 `scripts/check-migration-drift.py` 直查 production 比對，缺即紅（需 GitHub secret `CLOUDFLARE_API_TOKEN`）；**新 migration 一律寫成幂等**（`INSERT OR IGNORE`／`CREATE INDEX IF NOT EXISTS`／`ALTER` 前先確認）。**apply 與 deploy 的順序**：原則先 apply 後 deploy，但**若 migration 會砍掉舊 code 還在讀的欄位（如 0013 DROP COLUMN body），必須先 deploy 新 code 再 apply**——反向會 500（舊 code `no such column`）；正向風險僅新 code 對舊 DB 查不到新 type → 模板暫空不 500。以 SPEC 該版「部署順序」註記為準。

## 沙箱 git push 限制與解法（v1.1.15 發現）

**目標 repo**：`https://github.com/asdf80730/repair0818.git`（`asdf80730/repair0818`，origin = `https://github.com/asdf80730/repair0818.git`）。

沙箱（Alpine PRoot）對 `https://github.com/` 沒有預設認證，裸 `git push` 會撞：
```
fatal: could not read Username for 'https://github.com': No such device or address
```

**解法**：
1. 環境變數有專案專用 token：`GITHUB_TOKEN_REPAIR0818`（**不可 echo / cat / print 它的值**；只引用 `$GITHUB_TOKEN_REPAIR0818`）
2. push 時用注入式 URL（避免污染 `git remote` config）：
   ```bash
   REMOTE_URL="https://x-access-token:${GITHUB_TOKEN_REPAIR0818}@github.com/asdf80730/repair0818.git"
   git -c user.name='asdf80730' -c user.email='asdf80730@users.noreply.github.com' push "$REMOTE_URL" main
   ```
3. 身份用 `-c user.name/-c user.email` 注入，**不要** `git config --global` 改（會污染未來所有 commit）
4. 身份用**遠端歷史最後一位作者**（`git log -1 --format='%an <%ae>' origin/main`），不要自己掰
5. token **值**不寫進 memory / CLAUDE.md / commit message（可能 rotate；每次 push 前重新讀 env）；變數名（`GITHUB_TOKEN_REPAIR0818`）可寫，方便未來 AI 知道要用哪個

## 類別關聯（v1.1.7 起，AI 動作約束；設計契約見 SPEC §P7 與 §4.x API）
- **0002_seed.sql 一字不可改**（已套用到 production，D1 d1_migrations 只套未套用）。任何關聯變更一律寫新的 migration。
- **`option_categories` 的 INSERT/DELETE 只允許出現在 `POST` / `PATCH /api/options` 兩處**（兩階段 batch：先 RETURNING id 再寫關聯）；DELETE WHERE 只能是 `option_id = ?`。**禁止**在其他端點動關聯。
- **`category_ids` 三態**：未帶 = 不動關聯、`[]` = 清空、有值 = 全量覆寫。zod schema 用 `.optional()` 不用 `.default([])`。
- **`include_inactive`** 用 `z.enum(['0','1']).transform()`，**不可用 `z.coerce.boolean()`**（`"false"` 也是 true）。
- **join 表 `type` 由應用層強制**（`assertValidAssoc` / `assertCategoryIds`）：SQLite CHECK 不能跨表。
- **類別停用 → 僅下拉消失**，`option_categories` 列**保留**（不 DELETE），停用類別重啟仍保留關聯。
- **回報範本（`comment_desc`）不參與類別關聯**：建單的 `description`（使用範本，v1.1.11 正名）可綁類別；`comment_desc`（回報範本）是通用追蹤說明，**一律全部顯示、不綁類別、不進 `option_categories`**。

## 登入（硬性規則，勿再犯）
- **`cleanUrlParams()` 只能在登入成功（取 me）之後呼叫**，絕不可放 boot 開頭或 `liff.init()` 之前——LIFF 的 OAuth 授權需要 URL 上的 `code`/`state`，提前清掉會讓一般瀏覽器無法跳 LINE 登入頁（時好時壞的 bug）。
- 一般瀏覽器 `liff.init()` 其實會成功、`liff.login()` 能跳 LINE 登入頁（已實測），**不需**做網頁 OAuth。
- `option_categories` 的 INSERT/DELETE 只允許出現在 `POST`/`PATCH /api/options` 兩處；DELETE WHERE 只能是 `option_id = ?`。
- POST upsert 為「規則 2」明文例外（兩階段：先 `RETURNING id` 再 batch 寫關聯）；禁用 `meta.last_row_id` 當 upsert 後 id。
- join 表 type 由應用層強制（`assertValidAssoc`/`assertCategoryIds`），SQLite CHECK 不能跨表。
- 類別停用 → 僅下拉消失，`option_categories` 列保留（不 DELETE）。
