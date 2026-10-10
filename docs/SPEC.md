# 社區修繕管理系統 開發文件

**版本：v1.1.32（定稿，可施工）** ｜ 日期：2026-10-08

> 本文件為 v1.0～v1.1.25 各版合併後的完整規格，單獨即可作為施工依據；逐版變更見 §0.1 版本歷程，無需回查舊版。

---

## 0. 版本歷程與決策紀錄

### 0.1 版本歷程

| 版本    | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.1.33 | **列表標題去編號＋訊息模板合併**（2026-10-10，業主拍板）：① 列表卡：左欄 `#0000` 已顯編號，標題尾端 `#NNNN` 去除；② 訊息模板合併：`new_case`／`timeline` 兩支 → 單一支 `message_template_daily`（body 內含 header／新案件段／時間軸段／系統連結），migration `0003` 幂等取代 seed；`ALLOWED_LABELS=[daily]`、query 預設 `daily`、daily-report 回應 `templates:{ daily }`；③ 前端拼裝收口：`composeDailyMessage()` 統計頁與模板頁共用，空案以 dummy 列補位、無內容不放系統連結 |
| v1.1.32 | **seed 值集全量取代（T5／map #15）**（2026-10-08）：新增幂等增補層 `migrations/0002_replace_seed_from_new_excel.sql`，以新 Excel「報修清冊」對 category／location／vendors／users 做全量取代——category 補 冷氣空調／公設設備／健身器材（sort_order 10/11/12）、`消防設備` 停用（`active=0`）；vendors 補 政統工程(非簽約廠)／岱宇健身器材（sort_order 8/9）；users 依 production `repair-db0818` 實測補 id=2..8；`0001_initial.sql` 已套用 production 不可改。幂等：`options` 走 `INSERT OR IGNORE`、`vendors`／`users` 走 `WHERE NOT EXISTS`。 |
| v1.1.31 | **列表超寬修復＋測試 harness 收攏**（2026-10-05）：① 列表行超寬：`.row > div { min-width: 0 }`（style.css），e2e 補五路由 docW≤vw 收口斷言（390/375）；② 測試 harness 收攏：新增 `tests/harness.ts`（`mockLineVerify`／`mockLineVerifyRaw`／`loginAs`／`getOptionId`／`createTicket`／`bootMock`／`hasJsdom`）取代九支檔的檔內拷貝；DOM contract 由 jsdom ＋ Playwright 兩個 adapter 守（手拷 token 表退場）；③ 層二通用對：`restoreKey`／`remember` 收六鍵內聯（listStatus／listCategory／statsTab／dailyReportCatId／adminType／usersFilter）；④ message-templates 列表 query 折入 zv 缝（`listTemplatesQuerySchema`，同碼 `VALIDATION_ERROR`；daily-report 依 §4.0 留手動 `fail()`）。typecheck 0 errors、單測 13 檔／175、workers＋node 兩池全綠 |
| v1.1.30 | **層二範圍補齊（T12）**（2026-10-04）：① **P7 管理**的選項 tab 態納 `localStorage.adminType`（值限 `category`／`location`／`description`／`comment_desc`／`vendors`／`message_templates`，非白名單值落預設 `category`；tab 點擊寫入）；② **P6 成員**的角色篩選納 `localStorage.usersFilter`（值限 `all`／`pending`／`active`／`disabled`，非白名單值落預設 `all`；`change` 寫入）；③ **建單／編輯**的已選類別、地點、廠商屬一次性輸入，**不納**層二（随該次渲染，焦點由層一帶著走）。後端零改動；typecheck 0 errors、單測 173、e2e 32 全綠 |
| v1.1.29 | **刷新與焦點還原（T9）**（2026-10-03，依 wayfinder 選定）：① **單一刷新入口** `refresh()` → `router()`（冪，自带 `_pendingTimer` 清理），加 `refreshPending` 布林＋`setTimeout(…, 0)` 做同 tick 去重；② **push 來源**——LIFF 回調 `liff.onIsNewMessageCallback` 走**特徵偵測**（`typeof === 'function'` 才注册），缺失（含 `?mock=true` 的 vendored mock，其面無該回調）走 `pageshow` 兜底；③ **層一＝模組級單條快照**（`{route, scrollY, focusKey, caret}`，`router()` 於清 DOM 前寫入、頁面渲染完讀取；整頁重載即失落）——同 route 還原數值 `scrollY`（`window.scrollTo`）、focus 按穩定鍵 `[containerIndex, elementIndex]`（`#page` 直屬容器序＋容器內可聚焦元序）還原，同鍵已無則落該容器首個可聚焦元，caret 以 `Math.min(saved, value.length)` 鉗制；换 route 落頂、focus 不擾；④ **層二＝`localStorage`**——列表新增 `listStatus`／`listCategory` 兩鍵（失落落出廠預設 `active`／全部分類），與既有 `statsTab`／`dailyReportCatId` 同慣例；admin／users 的 tab 與篩選、詳情 ⋮ 選單／留言框展開態**不納層二**（後兩者由層一 focus 快照帶著走）；⑤ 後端零改動                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
> 更早版本（v1.1.28 與更早）見 `docs/archive/spec-changelog.md`。

### 0.2 業主決策紀錄（已確認，2026-08-18）

| #   | 決策                             | 內容                                                                                                                                                                                                          |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 開放管委會留言                   | 三種角色均可在案件下新增「留言」：只記錄內容與時間，**不改變案件狀態**，可附照片                                                                                                                              |
| D2  | 新增 reopen 功能                 | **管理員專屬**：已結案或已作廢的案件可重新開啟，並在時間軸留下紀錄                                                                                                                                            |
| D3  | CSV 匯出                         | 提供案件 CSV 匯出（備份與開會用），權限為管理公司（manager/admin）                                                                                                                                            |
| D4  | 保留「常用說明」為資料庫管理選項 | 類別、地點、常用說明三種選項皆由管理公司在管理頁自行新增／停用。理由：業主明示需求；三種選項共用同一張 options 表與同一支 API，成本趨近於零；前端硬寫會讓「改一條說明就要重新部署」，違背管理公司自助維護目標 |
| D5  | 選項／廠商管理權限下放           | 類別／地點／常用說明選項、廠商的新增／修改／停用，由 v1.0 的「僅 admin」放寬為 **manager/admin**。D4 精神延伸：管理公司自助維護                                                                               |
| D6  | 統計頁恢復三角色可讀             | `GET /api/stats/summary` 三角色皆可；**CSV 匯出仍維持 manager/admin**（D3 不變）。業主確認「管委會看得到」                                                                                                    |
| D7  | 編輯權限恢復 v1.0                | `PATCH /api/tickets/:id`：committee 可編輯**自己建的單**；manager/admin 全部。結案／作廢後仍不可編輯                                                                                                          |

### 0.3 產品規則（不可自行更動）

1. 狀態流：`open → in_progress → done`；另有 `void`（作廢）；done/void 僅 admin 可 reopen。**v1.1.14（F3）後端鎖死**：`in_progress→open` 退回禁、`open→open` 禁；`open→done` 可直結案、`in_progress→in_progress` 允許（多次發包覆寫金額）
2. 回報（kind=status）限 manager/admin；留言（kind=comment）三角色皆可、不改狀態
3. 編輯、void、reopen 都必須寫入時間軸；reopen 訊息須帶入實際前狀態（已完成／已作廢）
4. 時間軸（ticket_updates）只能新增，不可修改刪除（開會存檔用）
5. 選項與廠商不刪除，只停用
6. 建單不需填標題：類別＋地點必填、說明選填，標題由系統產生
7. 公開派工頁不顯示廠商名稱、不顯示時間軸、不顯示內部人員
8. 結案（done）後不可再回報，但可留言（留言不會重開案件）；作廢（void）案件不可留言
9. **廠商不進建單**：建單的 POST 不收 `vendor_id`；廠商僅在編輯頁 PATCH 由 manager/admin 指派
10. **廠商排序（v1.1.13）**：`vendors.sort_order` 排序用（與 options.sort_order 同模式），後台直接改資料庫、無前端排序介面；`GET /api/vendors` 依 `active DESC, sort_order, id`。**`vendors.phone` 欄位已移除（0008），勿再引用**
11. **指派廠商只在編輯頁（pages.edit）**（v1.1.5）：不塞進列表卡片或詳情頁
12. **編輯權限**：committee 僅自己建的單；manager/admin 全部（D7）
13. **統計頁三角色皆可**（D6）；**CSV 匯出限 manager/admin**（D3）
14. **vendor_name 刻意外露**：committee 在詳情頁/列表看得到 `vendor_name`，但 `GET /api/vendors` 限 manager/admin——刻意設計
15. **`month_done` 從 `ticket_updates` 計算**（v1.1.14 修正）：完成率方案②的分母用 `ticket_updates.kind='status' AND status='done'` 計算，**禁止用 `tickets.closed_at`**——reopen 改 `closed_at` 會污染完成率

**明確不做（v1.1.13 確認，勿擅自加入）**：

- **不上 React/Vue 等框架**：維持純原生 JS + vendored，避免建置與依賴。
- **不開 `nodejs_compat`**：維持 Workers 純 API，不引 Node 相容。
- **不做多社區／多 tenant**：單一社區，不建 tenant 隔離。
- **不做 LINE Messaging API 推播**：規格列 v1 不做；若未來要做需獨立後端＋OA 開通，非本專案範圍。
- **不做孤兒照片大清理**：v1 保留「未綁定照片只能本人 GET」政策，不設 cron 清掃。
- **不把 vendor 下拉塞回列表卡片/詳情頁**：指派廠商只在編輯頁（v1.1.5 定案）。
- **不建 staging 測試環境**（單人開發）；E2E 用 `?mock=true` 前端記憶體 mock，不碰正式資料（見 §8.7）。

---

## 1. 技術棧與專案結構

### 1.1 技術棧

| 層           | 選型                                                                |
| ------------ | ------------------------------------------------------------------- |
| 平台         | Cloudflare Pages + Pages Functions                                  |
| 後端框架     | Hono（單一 catch-all 入口）                                         |
| 資料庫       | Cloudflare D1（SQLite）                                             |
| 檔案儲存     | Cloudflare R2                                                       |
| 認證         | LINE LIFF（ID token）→ 自簽 JWT 放 HttpOnly Cookie                  |
| 前端         | 原生 HTML/JS（無框架、無建置），hash router                         |
| 驗證         | zod（schema 即 API 契約唯一真相來源）                               |
| JWT          | jose（Web Crypto 原生）                                             |
| 前端圖片壓縮 | browser-image-compression ＋ heic2any（v1.1.23 HEIC 轉換，皆 vendored）      |
| 測試         | @cloudflare/vitest-pool-workers（Workers 池跑測試，不用 Jest+mock） |

允許依賴：`hono`、`@hono/zod-validator`、`jose`、`zod`、`browser-image-compression`、`heic2any`（v1.1.23 起，HEIC/HEIF → JPEG）。
禁止：Node.js 專屬 API 或套件（jsonwebtoken、bcrypt、fs、multer、sharp、crypto.createHmac）。

### 1.1.5 工作區與檔案結構慣例（v1.1.15 起）

> 與 CLAUDE.md 規則 14/15 同源；本節說明「為什麼這樣規範」與實測依據，CLAUDE.md 是 AI 必讀的硬性規則摘要。

**規則 14：所有檔案放在 `/var/minis/workspace/` 之下**

- 正式施工目錄：`/var/minis/workspace/repair-system/`
- 備援（如 git clone 過渡）：可放 `/tmp/`，**但 `/tmp/` 不算正式位置**，重開 session 易丟
- `/tmp/` 僅允許當一次性搬遷/驗證的中繼站（CI log、單次 clone 測試、單次 git 實驗等）

**實測依據（2026-08-23）**：早期施工放在 `/tmp/repo-work`，業主於 2026-08-23 明確指示「正式施工目錄統一在 workspace/repair-system/」，搬遷後驗證 `.git` 在 workspace 下能正常運作（git init、add、commit、mv、log 皆可），**唯一限制**是 `rm` 系列系統呼叫被 Minis l2s 同步層擋住（不能用 `git gc`、不能重 pack），但日常 commit/branch/merge/push/mv/rename 都不會觸發 rm，**無實務影響**。

**規則 15：專案根目錄單層**

- 正確：`workspace/repair-system/`（根目錄即專案）
- 錯誤：`workspace/repair-system/repo/`、`workspace/repair-system/src/myapp/`（多層不必要）
- **理由**：AI 與人閱讀時找檔案的成本隨深度增加；minis://workspace/repair-system/ 已是最短可達路徑

**例外**（不違反 14/15）：

- 備援的 `.git` 可放 `/tmp/gitdir/` 類位置（用 `--separate-git-dir`）
- 一次性實驗目錄如 `.gitlocktest`、`.gtest`、`.mvtest` 可放他處，事後必須清掉

**變更需求清單**：`docs/vX.X.X-變更需求清單.md` 是業主討論中的工作稿，未明確拍板的設計細節**不得**寫入本檔（SPEC）、CLAUDE.md、lib-spec.md、page-api-map.md、test-cases.md 等正式規格（見 CLAUDE.md 規則 12.1）。

### 1.2 目錄樹

```
repair-system/
├── public/                        # 前端靜態檔（純 JS，無建置、無 npm import）
│   ├── index.html                 # 主系統 SPA 入口（由 functions/index.ts + functions/lib/dynamic-index.ts 動態產出；無靜態檔）
│   ├── app.js / share.js
│   ├── style.css
│   ├── vendor/
│   │   ├── browser-image-compression.js   # vendored UMD build（檔頭註明版本與來源）
│   │   ├── heic2any.js                     # vendored UMD（v1.1.23，HEIC/HEIF → JPEG，wasm 內嵌）
│   │   └── liff-mock.js                    # 測試模式 ?mock=true 用（§1.2）
│   ├── _routes.json               # include 白名單：/ 與 /index.html（動態 cache-busting）、/api/*、/share.html
│   └── _headers                   # 靜態檔標頭（安全標頭；主站不設 CSP，見 §8.2）
├── functions/
│   ├── api/
│   │   └── [[path]].ts            # 唯一入口
│   ├── index.ts                   # 根路徑 / 動態 cache-busting（v1.1.19，見 §8.2）
│   ├── index.html.ts              # 路徑 /index.html（v1.1.19 起為薄入口，共用 lib/dynamic-index.ts）
│   ├── lib/dynamic-index.ts       # 動態 index HTML 共用產出（模板＋安全標頭）
│   └── share.html.ts              # 動態渲染派工單頁（v1.1.12，見 §5.8）
├── src/                           # Hono 應用（TypeScript）
│   ├── app.ts                     # app 組裝與 middleware 掛載
│   ├── routes/
│   │   ├── auth.ts                # session / me / logout
│   │   ├── tickets.ts             # 建單/列表/詳情/編輯/回報/留言/作廢/reopen/share-token
│   │   ├── photos.ts / options.ts / vendors.ts / users.ts / stats.ts
│   │   ├── exports.ts             # CSV 簽名（POST /sign）與下載（GET /tickets.csv）
│   │   └── share.ts               # 公開端點
│   └── lib/
│       ├── auth.ts                # resolveUser()、requireAuth()、JWT 簽驗、Cookie
│       ├── csrf.ts                # csrfGuard middleware
│       ├── respond.ts             # 統一回應信封
│       ├── validate.ts            # zod schemas
│       ├── time.ts                # taipeiMonthRangeUtc() 等
│       └── db.ts                  # 共用查詢
├── migrations/
│   └── 0001_initial.sql           # 單一 squash migration（淨最終態；原 0001~0013 已壓平，見 §2）
├── initial-data/                  # Excel 報修清冊 seed 來源留檔（已併入 0001_initial.sql，見 §2.3）
│   └── 001_excel_tickets.sql
├── scripts/
│   ├── check-migration-drift.py   # 直查 production D1 比對 migrations（v1.1.19 守門，見 §8.7）
│   └── sync-npm-lock.js           # bun.lock → package-lock.json 同步（CI `npm ci` 用）
├── tests/                         # 單元測試（13 檔 175 tests）
│   ├── *.test.ts                  # app/assoc/boundary/coverage/dom-classes/init-modal/messageTemplates/share-html/share/stats/ticket-actions/tickets/time
│   ├── worker.ts / env.d.ts       # workers pool 入口與型別
│   ├── harness.ts / apply-migrations.ts  # 共用測試 helper（v1.1.31 收攏）；migration 套用 setup
│   └── node/                      # test:local 的 node:sqlite shim（§8.7）
├── e2e/                           # Playwright E2E（37 條；對 production ?mock=true）
│   ├── app.spec.js                # 24 條（v1.1.23 加 HEIC 上傳；v1.1.31 加五路由 docW≤vw 收口斷言）
│   ├── daily-report.spec.js       # 5 條（案件動態日報，v1.1.22 加「全部類別」預設）
│   ├── message-templates.spec.js  # 5 條（模板頁，v1.1.16 重構後）
│   ├── cache-busting.spec.js      # 3 條（v1.1.19；本地 http.server 無 Functions 層故只 CI 跑）
│   └── fixtures/sample.heic       # v1.1.23 真實 HEIC fixture（ftyp/mif1）
├── CLAUDE.md                      # 見 §6
├── README.md                      # 專案入口（技術棧/結構/本機開發/文件導覽）
├── docs/
│   ├── SPEC.md                    # 最新規格（單一真相來源）
│   ├── lib-spec.md / test-cases.md / page-api-map.md
│   ├── index.html                 # 外部審查工具：完整專案總覽 Markdown 產生器（產出 project-overview.md 供外部審查，非修繕系統 runtime）
│   └── archive/                   # 歷史變更需求報告（已施工）
└── wrangler.toml                  # 見 §8
```

**語言邊界（硬性）**：`functions/` 與 `src/` 使用 TypeScript（Wrangler 以 esbuild 自動編譯，零設定）；`public/` 一律純 JS，禁止 `import` npm 套件。

**前端套件規則（硬性）**：一律 vendored——從 npm 套件 dist 取 UMD build 放 `public/vendor/`，鎖定版本、檔頭註明版本號與來源，以 `<script src="/vendor/...">` 載入（browser-image-compression 掛 `window.imageCompression`）。禁止 CDN。**唯一例外：LINE LIFF 官方 SDK**（`https://static.line-scdn.net/liff/edge/2/sdk.js`）——屬 LINE 平台必要元件、非第三方套件，且 LINE 官方不提供可 vendored 的離線 build，故允許直接以官方 CDN 載入（`public/index.html` 註解標明「LINE 官方 CDN，平台 SDK」）。其餘第三方套件一律不得走 CDN。

### 1.3 唯一入口與 app 組裝

```ts
// functions/api/[[path]].ts —— 整支檔案就這三行
import { handle } from "hono/cloudflare-pages";
import { app } from "../../src/app";
export const onRequest = handle(app);
```

```ts
// src/app.ts（骨架）—— middleware 掛載順序即安全邊界，勿更動
type Env = {
  Bindings: {
    DB: D1Database;
    PHOTOS: R2Bucket;
    LINE_CHANNEL_ID: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: { id: number; role: "pending" | "committee" | "manager" | "admin" };
  };
};

export const app = new Hono<Env>().basePath("/api");

app.route("/share", shareRoutes); // 公開唯讀：無 auth、無 csrf
app.get("/exports/tickets.csv", csvDownload); // 雙軌自驗：軌A Cookie / 軌B 簽名（見 §4.8）
app.use("/*", csrfGuard); // 所有 mutation 驗 CSRF（GET/HEAD 直接放行）
app.route("/auth", authRoutes); // session 不需登入；me / logout 內部各自掛 requireAuth({ allowPending: true })
app.use("/*", requireAuth()); // ⚠ 以下全部需已開通；此行之上的路由必須自驗權限
app.route("/tickets", ticketRoutes);
app.route("/photos", photoRoutes);
app.route("/options", optionRoutes);
app.route("/vendors", vendorRoutes);
app.route("/users", userRoutes);
app.route("/stats", statsRoutes);
app.route("/exports", exportRoutes); // 僅 POST /sign（走標準 Cookie＋CSRF 流程）
```

**掛載規則（硬性）**：

1. **凡是可能在無 Cookie 或 pending 狀態被呼叫的端點，一律註冊於全域 `requireAuth()` 之上，並在端點內自驗**（本版共兩支：`GET /share/*` 公開白名單、`GET /exports/tickets.csv` 雙軌）
2. 全域 `requireAuth()` 之上的路由**必須自己完成權限驗證**，不得依賴外層 middleware
3. 角色限制在路由模組內以 `requireAuth({ roles: ['manager','admin'] })` 逐群掛載

> 背景：v1.1.2 曾將 `/auth` 與 `/exports` 整組放在全域 `requireAuth()` 之下——Hono middleware 依註冊順序執行，外層一旦回 403/401，內層的 `allowPending` 或簽名驗證**永遠不會被執行**。本版重排修復。

---

## 2. 資料庫 Schema

### 2.1 `migrations/0001_initial.sql`（單一 squash migration，淨最終態）

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id  TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pending',   -- pending / committee / manager / admin
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,                     -- ISO8601 UTC
  approved_at   TEXT,
  approved_by   INTEGER REFERENCES users(id)       -- 保留欄位，v1 無畫面使用
);

CREATE TABLE vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0    -- 排序（v1.1.13，與 options.sort_order 同模式）
);

CREATE TABLE options (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                        -- category / location / description / comment_desc
                                                   -- ＋ message_template_daily（v1.1.33 合併單支；v1.1.20 起 type 當鍵）
  label      TEXT NOT NULL,                        -- 選項文字；message_template_% 列存模板內容（v1.1.20，body 欄已被 0013 砍掉）
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(type, label)
);

-- v1.1.7 類別關聯 join 表（多對多：location/description ↔ category）
CREATE TABLE option_categories (
  option_id   INTEGER NOT NULL REFERENCES options(id),
  category_id INTEGER NOT NULL REFERENCES options(id),
  PRIMARY KEY (option_id, category_id)
);
CREATE INDEX idx_oc_category ON option_categories(category_id);

CREATE TABLE tickets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id      INTEGER REFERENCES options(id),
  category_label   TEXT NOT NULL,                  -- 建單時快照，選項改名不影響歷史
  location_id      INTEGER REFERENCES options(id),
  location_label   TEXT NOT NULL,                  -- 同上
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'open',   -- open / in_progress / done / void
  vendor_id        INTEGER REFERENCES vendors(id),
  share_token      TEXT UNIQUE NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  closed_at        TEXT,        -- 結案或作廢時間；reopen 時清空
  closed_by        INTEGER REFERENCES users(id),
  amount           INTEGER,                         -- 發包金額（v1.1.12）
  amount_at        TEXT                             -- 發包時間（多次發包覆寫為最後一次）
  -- 無 ticket_no：顯示用 '#' + id 補零 4 位，由後端組 title 時產生
  -- 無 updated_at：刻意刪除，由 last_activity_at 涵蓋（非漏抄）
);

CREATE TABLE ticket_updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL CHECK (kind IN ('status','comment','system')),
  status     TEXT CHECK (
               (kind = 'status' AND status IN ('open','in_progress','done','void'))
               OR (kind IN ('comment','system') AND status IS NULL)
             ),
  note       TEXT CHECK (
               (kind = 'comment' AND note IS NOT NULL AND note <> '')
               OR (kind IN ('status','system'))
             ),
  amount     INTEGER,                 -- 發包金額（v1.1.12，0007 ALTER ADD；僅 kind='status' 且 in_progress 帶值）
  created_at TEXT NOT NULL
  -- 只能新增，不可修改刪除
  -- CHECK 約束讓資料庫成為第二道防線：AI 寫錯 kind/status/note 組合會在 INSERT 時被擋
);

CREATE TABLE photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type  TEXT,                          -- ticket / update；NULL = 尚未綁定
  target_id    INTEGER,
  r2_key       TEXT NOT NULL,                 -- photos/{uuid}，無副檔名
  content_type TEXT NOT NULL,                 -- image/jpeg | image/png | image/webp
  size_bytes   INTEGER NOT NULL,
  uploaded_by  INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_tickets_list    ON tickets(status, last_activity_at DESC, id DESC);
CREATE INDEX idx_tickets_created ON tickets(created_at);
CREATE INDEX idx_updates_ticket  ON ticket_updates(ticket_id, created_at);
CREATE INDEX idx_updates_stats   ON ticket_updates(kind, status, created_at);
CREATE INDEX idx_photos_target   ON photos(target_type, target_id);
CREATE INDEX idx_options_type    ON options(type, active, sort_order);
CREATE INDEX idx_vendors_active_sort ON vendors(active, sort_order, id);
-- 觸發器：ticket_updates 為 append-only（時間軸不可修改／刪除）
CREATE TRIGGER prevent_ticket_updates_update BEFORE UPDATE ON ticket_updates
BEGIN SELECT RAISE(ABORT, 'ticket_updates is append-only (UPDATE forbidden)'); END;
CREATE TRIGGER prevent_ticket_updates_delete BEFORE DELETE ON ticket_updates
BEGIN SELECT RAISE(ABORT, 'ticket_updates is append-only (DELETE forbidden)'); END;
```

### 2.2 時間格式統一規則（寫入 side）

一律 ISO8601 UTC。應用層用 `new Date().toISOString()`；SQL 層（seed、bootstrap）用 `strftime('%Y-%m-%dT%H:%M:%fZ','now')` 或固定字串。**禁止 `datetime('now')`**。

### 2.3 seed（併入 `migrations/0001_initial.sql` 的 INSERT 區塊）

> **單一來源**：所有預設資料以 `INSERT ... VALUES`（來源為 Excel「報修清冊」）併入 `0001_initial.sql`。原 `0002_seed`／`0004_comment_desc`／`0010`~`0013` 已壓平進此檔，不再另立檔；根目錄 `seed.sql` 與 `db:seed:remote` script 已刪除。

- `users`：id=1（王任鋒，admin）為 `created_by` 統一引用之 id；`0002` 依 production `repair-db0818` 實測補入 id=2..8（含 id=3 `active=0`、全部 `approved_by=NULL`）。
- `options.type='category'`（Excel J 欄）：弱電修繕／機電修繕／電梯修繕／園藝植栽／泳池設備／消防設備／漏水／地磚泥作／水電項目／其他（`其他` 的 sort_order=99）；`0002` 補入 冷氣空調／公設設備／健身器材（sort_order 10/11/12），`消防設備` 因新表無此值改 `active=0` 停用（非 DELETE）
- `options.type='location'`（Excel H 欄）：公共區域／一樓外圍／B1·B2·B3 地下室公設／三期 A~F 棟／四期 G~K 棟（共 16 列）
- `vendors`（Excel F 欄）：富華創新／順宏弱電／國霖機電／OTIS電梯／園藝／智生活／其它；`0002` 補入 政統工程(非簽約廠)／岱宇健身器材（sort_order 8/9）
- `options.type='description'`（建單說明範本）：水泵浦異音／照明故障／門禁感應不良／水管滲漏／油漆剝落／其他（99）
- `options.type='comment_desc'`（回報範本）：已通知廠商處理／已到場勘查／待料中／已修復完成／需追蹤
- `options.type='message_template_daily'`（v1.1.33 合併單支）：`label` 欄即模板內容（見 §4.9）；`0001` 舊兩行 `message_template_new_case`／`'message_template_timeline'` 由 `0003` 幂等取代

> **`0002_replace_seed_from_new_excel.sql`（幂等增補層）**：以新 Excel「報修清冊」對上述值集做「全量取代」——`options` 走 `INSERT OR IGNORE`（`UNIQUE(type,label)`）、`vendors`／`users` 走 `INSERT ... SELECT ... WHERE NOT EXISTS`。`0001_initial.sql` 已套用 production 不可改，取代內容承載於此檔；location（16 列）與 0001 現行相同、無需增補。

（預設選項為初始值，上線後由管理公司在 P7 自行維護。）

### 2.4 bootstrap 管理員

第一位管理員先正常登入一次（系統建 pending 帳號），再執行：

```sql
UPDATE users SET role='admin',
  approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE line_user_id='<他的 LINE user ID>';
```

---

## 3. 認證與權限

### 3.1 登入流程（Cookie Session 版）

```
使用者點圖文選單 → 開啟 LIFF → liff.getIDToken()
→ POST /api/auth/session { id_token }
    後端：向 LINE 驗證 id_token
      POST https://api.line.me/oauth2/v2.1/verify
      參數：id_token、client_id = LINE_CHANNEL_ID
      核對：aud == LINE_CHANNEL_ID、iss == 'https://access.line.me'、exp 未過期
    → users 表查無此人 → 建立 pending 使用者
      （display_name 取 ID token 的 name claim；缺省時填「LINE 用戶」）
    → 簽發 JWT（jose，HMAC-SHA256，效期 60 分鐘，
       payload 只放 { sub: user_id }，不放 role）
→ Set-Cookie: session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600
```

### 3.2 每支 API 請求的驗證流程

1. 驗 JWT 簽章與效期 → 失敗回 `401 UNAUTHORIZED`
2. **從 D1 讀取該 user 的 role 與 active**（禁止只信 JWT 內容）：
   - `active=0` → `403 DISABLED`（「帳號已停用，請洽管理員」）——v1.1.10：`resolveUser` 查到 active=0 時設 `disabledUser` 標記，`requireAuth` 直接讀標記回 403，**不再重查 D1**（移除 `isDisabledUser`）
   - `role='pending'` → `403 PENDING`（僅 `/api/auth/*` 可用，且 me/logout 需 allowPending）
   - 角色不符 → `403 FORBIDDEN`
3. 停用／降權因此**立即生效**

**v1.1.14（A6）session 滑動續期**：`requireAuth` 在 `resolveUser` 成功後，若 JWT 剩餘效期 < 900 秒（15 分鐘），以 `resolveUser` 所帶 `user.exp`（`User` 型別選填 `exp`）直讀比對（免二次 `decodeJwt`，v1.1.24 ②），換發新 JWT 並 `Set-Cookie`（屬性與登入一致：`Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`）。因 `resolveUser` 已查過 D1 active，停用者不會被續期繞過。

**`lib/auth.ts` 介面（v1.1.3 定案）**——拆為純函式＋middleware 兩層，讓需自驗的端點（如 CSV 下載）可重用驗證邏輯：

```ts
// src/lib/auth.ts

/** 純函式：解析 Cookie、驗 JWT、查 D1，回傳 user 或 null（不拋錯、不寫回應） */
export async function resolveUser(
  c: Context<Env>,
): Promise<{
  id: number;
  role: "pending" | "committee" | "manager" | "admin";
} | null> {
  // 1. 從 Cookie 取 session JWT；無 Cookie → null
  // 2. jose 驗簽＋效期 → 失敗回 null
  // 3. 從 D1 查 user：SELECT id, role, active FROM users WHERE id = ?
  // 4. 查無此人或 active = 0 → null（停用者視同未登入；
  //    需區分 DISABLED 訊息的端點在 middleware 層另查）
  // 5. 回 { id, role }
}

/** middleware：內部呼叫 resolveUser，依 opts 判斷是否放行 */
export function requireAuth(opts?: {
  roles?: Array<"committee" | "manager" | "admin">;
  allowPending?: boolean;
}): MiddlewareHandler<Env> {
  return async (c, next) => {
    const user = await resolveUser(c);
    if (!user) {
      return c.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "請重新登入" } },
        401,
      );
    }
    if (user.role === "pending" && !opts?.allowPending) {
      return c.json(
        { ok: false, error: { code: "PENDING", message: "帳號等待開通中" } },
        403,
      );
    }
    if (
      opts?.roles &&
      !opts.roles.includes(user.role as "committee" | "manager" | "admin")
    ) {
      return c.json(
        { ok: false, error: { code: "FORBIDDEN", message: "權限不足" } },
        403,
      );
    }
    c.set("user", user);
    await next();
  };
}
```

- `GET /api/auth/me`、`POST /api/auth/logout` 使用 `requireAuth({ allowPending: true })`（讓 P0 畫面拿得到 display_name）
- 停用（active=0）使用者的 DISABLED 提示：由 `requireAuth` 在 resolveUser 回 null 前，對「JWT 有效但 active=0」的情況改回 `403 DISABLED`（實作時在 middleware 層補此分支；純函式 resolveUser 維持回 null）

### 3.3 CSRF 防護（改用 Cookie 後的必要措施）

- Cookie 設 `SameSite=Lax`
- 所有 mutation（POST/PATCH/DELETE）必須帶自訂 header `X-Requested-With: fetch`，缺 header 一律 `403`
- `Sec-Fetch-Site` **有送且為 cross-site → 拒絕；沒送 → 僅驗 X-Requested-With**（相容不送 Fetch Metadata 的舊版 WebView）
- mutation 只接受 `Content-Type: application/json`（照片上傳的 multipart 除外，同樣驗 header）
- 不開放 CORS

### 3.4 前端 401 處理（靜默重登）

1. 收到 `401 UNAUTHORIZED`
2. `liff.isLoggedIn()` 為 false → `liff.login()`（LINE 內無感完成；外部瀏覽器會出現 LINE 登入畫面）
3. 取 id_token → `POST /api/auth/session` 換新 Cookie → **重送原請求一次**
   - **v1.1.13：若 `POST /api/auth/session` 重建失敗**（LINE idToken 已過期等，後端回 401）→ **fallback 呼叫 `liff.login()` 強制重新授權**取得新 token，避免「後端 session 過期但 LINE 仍登入」時卡住不重登。LINE 內已授權過會無感取得新 token；外部瀏覽器會跳 LINE 登入頁。**v1.1.18 更正**：官方文件明訂 `liff.login()` 在 LIFF 瀏覽器內（已登入狀態）是 no-op，單調它拿不到新 token。故改為先 `liff.logout()` 清 LIFF 快取（之後 `liff.isLoggedIn()` 為 false），再 `liff.login()` 走完整 OAuth 拿真正新 token——不必手動清空瀏覽器資料即可登得上。`postSession`／`forceFreshLogin` 為此標準流程的共用 helper。
4. 重送後仍 401 → 顯示「請重新從 LINE 圖文選單開啟本系統」，**不再重試**
5. `403 DISABLED` / `403 PENDING` 不觸發重登（避免停用帳號無限重登迴圈），直接顯示對應訊息

**非手機／外部瀏覽器登入（v1.1.4）**：不禁止非手機使用。`liff.init` 失敗時仍嘗試用既有 cookie 登入；若無 cookie 且 LIFF SDK 在，重試 init 後登入；完全無 LIFF 環境顯示提示＋重新整理按鈕。

### 3.5 登出

`POST /api/auth/logout` 清除 Cookie（Max-Age=0），並掛 `requireAuth({ allowPending: true })`。端點**保留**（端點契約不變）。

**v1.1.21 移除前端登出鈕**（v1.1.17 加的「🚪 登出」底部 nav 按鈕）：LINE 憑證存於 LIFF 快取而非 cookie，此端點清 cookie 後重載仍會以 LIFF 快取的 id_token 無感自動重登——登出無實際效果。憑證過期時 `boot()` 已自動走 `forceFreshLogin()`（先 `liff.logout()` 清 LIFF 快取、再 `liff.login()` 重導 OAuth，受 C1 重登次數上限保護），不需手動登出。故移除按鈕、把底部 nav 空間還給功能 tab（admin 6 格→5 格、manager 5→4、committee 4→3）。

### 3.6 權限矩陣

| 功能                                               |                                      committee 委員                                       | manager 保全/秘書 | admin 主管 |
| -------------------------------------------------- | :---------------------------------------------------------------------------------------: | :---------------: | :--------: |
| 查看案件、建單、留言（D1）、上傳照片、複製分享連結 |                                             ✓                                             |         ✓         |     ✓      |
| 編輯案件（D7）                                     |                                     **僅自己建的單**                                      |      ✓ 全部       |   ✓ 全部   |
| 指派廠商（v1.1.5：僅編輯頁內，保全/秘書層級）      |                                             ✗                                             |         ✓         |     ✓      |
| 回報、結案、作廢、重新產生分享連結                 |                                             ✗                                             |         ✓         |     ✓      |
| **統計摘要（D6）**                                 |                                           **✓**                                           |         ✓         |     ✓      |
| CSV 匯出（D3）                                     |                                             ✗                                             |         ✓         |     ✓      |
| 廠商／選項管理（D5）                               |                                             ✗                                             |         ✓         |     ✓      |
| 成員審核、角色指派、停用、改名                     |                                             ✗                                             |         ✗         |     ✓      |
| reopen 重新開啟（D2）                              |                                             ✗                                             |         ✗         |     ✓      |
| pending 或 active=0                                | 所有 API 除 `/api/auth/*`（me/logout 需 allowPending）一律 `403 PENDING` / `403 DISABLED` |                   |            |

> **權限層級（v1.1.5 定案）**：主管（admin）> 保全/秘書（manager）> 委員（committee）。v1.1.4 曾誤將 admin 標為「保全/秘書」、manager 標為「主管」，已修正。
>
> **註記（非漏洞，勿誤判修掉）**：committee 在案件列表與詳情**看得到 `vendor_name`**（可知道誰在修），但 `GET /api/vendors` 限 manager/admin（不可指派、不可管理廠商資料）。這是刻意設計。

---

## 4. API 契約

### 4.0 通用規格

**回應信封**（統一走 `lib/respond.ts`）：

```json
成功：{ "ok": true, "data": ... }
失敗：{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

**前端 fetch 規則**：所有 mutation（POST/PATCH/DELETE）必帶自訂 header `X-Requested-With: fetch`，缺 header 後端一律 `403`（見 §3.3）。前端 fetch wrapper 必須統一自動帶上此 header。

**錯誤碼表**：

| HTTP | code                | 意義                                                    |
| ---- | ------------------- | ------------------------------------------------------- |
| 400  | VALIDATION_ERROR    | 欄位驗證失敗（依 §4.1 規則表）                          |
| 400  | ADMIN_LOCKED        | 違反 users 防呆規則（不可停用自己／至少保留一位 admin） |
| 401  | UNAUTHORIZED        | 未登入 / session 過期 / 簽名錯誤                        |
| 401  | EXPORT_LINK_EXPIRED | 匯出下載連結已過期                                      |
| 403  | PENDING             | 帳號待審核                                              |
| 403  | DISABLED            | 帳號已停用                                              |
| 403  | FORBIDDEN           | 角色權限不足（含 CSRF header 缺失）                     |
| 404  | NOT_FOUND           | 資源不存在（含 share token 無效）                       |
| 500  | INTERNAL            | 伺服器錯誤                                              |

> **統一 400 信封（v1.1.23）**——所有 400 皆走同一形 `{ ok:false, error:{ code, message } }`：
>
> - **手動 `fail()` 判準**（如 daily-report 的 `MISSING_DATE`／`INVALID_DATE`／`DATE_FUTURE`、`VALIDATION_ERROR`、users 的 `ADMIN_LOCKED`）→ 同一信封。
> - **欄位驗證失敗**——`lib/respond.ts` 的 `zv`（包 `@hono/zod-validator`，第三參為統一 hook）把 zod 的 `issues[0].message` 轉成 `error.message`，`code='VALIDATION_ERROR'`；前端一律讀 `body.error.code`／`body.error.message`。
>   其餘 HTTP 碼（401/403/404/500）一律走統一信封。

### 4.1 欄位驗證規則表（所有 VALIDATION_ERROR 的判準）

| 欄位                      | 規則                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| category_id / location_id | 必填，且必須是 active 的 option                                                                                              |
| description（建單）       | 選填，≤ 500 字                                                                                                               |
| note（回報）              | 選填，≤ 500 字                                                                                                               |
| note（留言）              | **必填**，1–500 字（資料庫 CHECK 為第二道防線）                                                                              |
| vendor_id                 | **僅 PATCH 適用**：選填，**三態**——不帶＝不變、`null`＝清空指派、正整數＝指派新廠商（須 active；D1/G1）                      |
| photo_ids                 | 選填，≤ 5 張，**每張須滿足 `uploaded_by=本人` 且 `target_id IS NULL`**（後端強制）                                           |
| status（回報）            | 必填：open / in_progress / done                                                                                              |
| 廠商 name                 | 必填，1–50 字（POST／PATCH 皆用）                                                                                            |
| 廠商 sort_order           | 選填，非負整數（**僅 PATCH** 帶；POST 未帶 → DB 預設 0）                                                                     |
| 選項 label                | 必填，1–30 字                                                                                                                |
| 成員 display_name         | 必填，1–20 字                                                                                                                |
| :id（path 參數）          | 正整數——`zv('param', idParam)`（coerce→int→positive）；非正整數 → 400 `VALIDATION_ERROR`，訊息『無效的 id』（§4.0 統一信封） |

### 4.2 Auth

**POST `/api/auth/session`** — 見 §3.1。需 CSRF header，不需已登入。

**GET `/api/auth/me`** — 使用 `requireAuth({ allowPending: true })`

```json
{ "ok": true, "data": { "id": 3, "display_name": "陳小姐", "role": "manager" } }
```

**POST `/api/auth/logout`** — 使用 `requireAuth({ allowPending: true })`，清除 Cookie。

### 4.3 Tickets

**POST `/api/tickets`**（三角色）

```json
請求：{ "category_id": 2, "location_id": 1, "description": "選填", "photo_ids": [11, 12] }
```

- **不接受 `vendor_id`**（建單不指派廠商；廠商僅在 PATCH 指派）
- 從 options 取出 label **快照**寫入 `category_label`／`location_label`
- 產生 `share_token`（crypto.randomUUID()）
- `photo_ids` 依 §4.1 驗證後綁定（`target_type='ticket'`）
- 建單＋照片綁定以 `env.DB.batch()` 一次完成
- title ＝ `{category_label}－{location_label} #{id 補零 4 位}`（全角「－」）

**GET `/api/tickets`**（三角色）

- Query：`status`、`category_id`、`page`（預設 1）、`limit`（預設 20，上限 50）
- **`status` 允許值寫死**：`active`（＝open+in_progress，**預設**）｜`open`｜`in_progress`｜`done`｜`void`｜`all`；未帶參數時預設 `active`
- 排序：`last_activity_at DESC`
- 回應：`{ items, page, limit, has_more }`（實作：查 `limit+1` 筆判斷）
- item 欄位：`id, title, status, category_label, location_label, description, vendor_name, created_at, last_activity_at`（v1.1.13 起列表含 `description`）
- **item 不含 `stale`**，由前端用 `last_activity_at` 計算
- v1 不做關鍵字搜尋（明示不做的範圍）

**GET `/api/tickets/:id`**（三角色）

- 案件本體＋`photos`（target_type='ticket' 的 url 陣列，格式 `/api/photos/{id}`）＋`updates` 時間軸
- `updates` 每筆：`{ id, kind, status, note, amount, display_name, created_at, photo_urls }`（`status`／`note`／`amount` 可為 NULL）
- 廠商已停用時 `vendor_name` 後綴「（已停用）」
- `share_url` 三角色皆回傳（僅查看／複製；重新產生限 manager/admin）。**格式 `/share.html?token={share_token}`**（指向人類可讀公開頁；v1.1.4 起，原先指向 JSON API `/api/share/{token}`）

**PATCH `/api/tickets/:id`**（**D7：committee 僅自己建的單；manager/admin 全部**）

- 可改：category_id、location_id、description、vendor_id
- **committee 即使編自己的單也不可改 vendor_id**（廠商指派權限仍限 manager/admin）
- 僅 open / in_progress 可編輯（已結案/作廢不可改）
- 改類別/地點時快照 label 同步更新
- **改類別後若原地點不屬於新類別且非通用 → 回 `400 VALIDATION_ERROR` 要求重選地點**（A1，不再清空 location）
- **vendor_id 三態**：不帶＝不變、`null`＝清空指派、正整數＝指派新廠商（D1/G1）
- 儲存後自動寫入時間軸：`kind='system'`、`status=NULL`、`note='已修改：類別 電梯→門禁；說明'`（before→after 摘要，無變動欄位不列出；**廠商變更留 `廠商 舊→新`**，G5）

**POST `/api/tickets/:id/updates`**（manager/admin）

```json
請求：{ "status": "in_progress", "note": "選填", "photo_ids": [21], "amount": 5000 }
```

- ticket.status 同步更新；done 時設 `closed_at`／`closed_by`
- **v1.1.12：`in_progress` 代表「已發包」，必填 `amount`（正整數）**；寫入 `tickets.amount` 與 `amount_at`（發包時間，統計月份基準），同時寫入該筆 `ticket_updates.amount`（時間軸顯示發包金額用）
- **v1.1.13：`amount/amount_at` 只在 in_progress 時更新，其他狀態（含 done）保留既有值不清空**（結案後發包金額與統計月份基準不消失）
- 更新 `last_activity_at`；照片綁定 `target_type='update'` + 該筆 update id
- 多步驟寫入用 `env.DB.batch()`
- 已結案（done）或作廢（void）的單 → 回 `VALIDATION_ERROR`
- **v1.1.14 狀態流限制（F3）**：後端驗證合法轉移——`open → [in_progress, done]`、`in_progress → [in_progress, done]`（in_progress→in_progress 允許＝多次發包覆寫金額）。**鎖死退回（`in_progress→open` 禁）、`open→open` 禁**；違反回 `VALIDATION_ERROR`。前端 comment-box 下拉依 `t.status` 過濾選項（與後端一致）

**POST `/api/tickets/:id/comments`**（三角色，D1）

```json
請求：{ "note": "必填，1–500 字", "photo_ids": [21] }
```

- 寫入 `kind='comment'`、`status=NULL`；**不改變 ticket.status**
- 留言照片一律 `target_type='update'`、`target_id=該留言 id`
- 更新 `last_activity_at`（留言算案件活動）
- open / in_progress / done 可留言（done 留言不會重開）；**void 不可留言**

**POST `/api/tickets/:id/void`**（manager/admin）

```json
請求：{ "note": "選填原因" }
```

- 寫入時間軸 `kind='status'`、`status='void'`、`note=原因`
- ticket 設 `status='void'`、`closed_at`／`closed_by`
- 前端需二次確認（同結案）

**POST `/api/tickets/:id/reopen`**（僅 admin，D2）

```json
請求：{ "status": "in_progress", "note": "選填" }   // status 只能 open 或 in_progress，預設 in_progress
```

- 僅限 done / void 的案件
- ticket：`status`＝指定狀態、`closed_at/closed_by` 清空、更新 `last_activity_at`
- **reopen 不接受 `amount`，也不動既有 `amount/amount_at`**（v1.1.13 語意鎖死）：若 reopen 回 `in_progress`（=已發包），沿用原發包金額與發包時間；統計月份基準不因 reopen 改變
- 時間軸寫入 `kind='status'`、指定 status，note 模板帶入**實際前狀態**：
  `重新開啟（原狀態：已完成）<備註>` 或 `重新開啟（原狀態：已作廢）<備註>`（備註選填，無備註不帶冒號，G6），禁止寫死

**POST `/api/tickets/:id/share-token`**（manager/admin）

- 重新產生 `share_token`，舊連結立即失效，回傳新 `share_url`（格式 `/share.html?token={token}`）

### 4.4 Photos

**POST `/api/photos`**（三角色，multipart）

- 白名單：`image/jpeg`、`image/png`、`image/webp`（**不含 HEIC**）
- 驗 magic bytes：JPEG `FF D8 FF`、PNG `89 50 4E 47`、WebP `RIFF????WEBP`
- ≤ 10MB；R2 key＝`photos/{uuid}`（無副檔名），`httpMetadata.contentType` 一併寫入
- photos 表存 `content_type`、`size_bytes`，`target_id=NULL`（待綁定）
- 回應：`{ id, url }`（url 格式 `/api/photos/{id}`）

**GET `/api/photos/:id`**（已開通使用者）

- Cookie 驗證（`<img>` 直接可用）
- 歸屬檢查：`target_id IS NULL`（未綁定）的照片僅上傳本人可取；已綁定照片所有已開通使用者可讀
- 回應標頭：`Content-Type` 依 DB 記錄、`X-Content-Type-Options: nosniff`、`Content-Disposition: inline; filename="photo-{id}.jpg"`（副檔名依 content_type 推斷）、**`Cache-Control: private, max-age=86400`**（24 小時，避免照片牆滑動時重打 R2）

### 4.5 Share（公開，免登入）

> **安全（v1.1.10）**：`GET /api/share/:token` 與 `/api/share/:token/photos/:photo_id` 只接受**標準 UUID 格式**的 token，非 UUID 直接回 404（防暴力掃描/列舉）。

**GET `/api/share/:token`**

- 回傳**僅白名單欄位**（逐欄 SELECT，禁止 `SELECT *`）：
  `title, status, category_label, location_label, description, photos（target_type='ticket' 的 url，格式 /api/share/{token}/photos/{id}）, created_at, last_activity_at`
  - `last_activity_at` 用途寫明：供 share.html 顯示「狀態更新於 ……」，讓廠商知道資訊時效
- **不回傳**：廠商名稱、時間軸、任何使用者資料
- 標頭：`X-Robots-Tag: noindex`、`Referrer-Policy: no-referrer`
- token 無效 → `404 NOT_FOUND`；share.html 顯示人讀的「連結已失效」頁面（非 JSON）
- Cloudflare Rate Limiting rule 列 v1.1 選配（Dashboard 設定，不寫程式）

**GET `/api/share/:token/photos/:photo_id`**（公開，免登入）

- 必須驗證：該 photo **屬於該 token 對應的 ticket**，且 `target_type='ticket'`
- **不得**回傳 `target_type='update'` 的照片（回報／留言照片屬內部進度，外洩風險）
- 驗證通過才從 R2 輸出；token 無效或 photo 不屬於該 ticket → `404`
- 標頭：**`Cache-Control: private, max-age=300`**（token 重發後舊連結的照片最多再被快取 5 分鐘，且不被共享快取；派工頁圖不多，放棄長快取代價可忽略）、`X-Content-Type-Options: nosniff`

### 4.6 Options／Vendors／Users

| 端點                                                                  | 權限          | 說明                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/api/options/catalog`                                            | 三角色        | 一次抓所有選項＋關聯：`{categories, locations, descriptions, comment_descs}`（v1.1.9 加 comment_descs）                                                                              |
| GET `/api/options?type=category\|location\|description\|comment_desc` | 三角色        | **三種模式**（v1.1.7）：① 不帶參數＝只回 active；② 帶 `category_id=N`＝只回該類別關聯＋通用；③ 帶 `include_inactive=1`（限 manager/admin）＝含停用並附 `category_ids`                |
| POST `/api/options`                                                   | manager/admin | `{ type, label, sort_order, category_ids? }`；若 `(type,label)` 已存在 → 該筆 `active=1` 並更新 `sort_order`，否則新增；`category_ids` 三態（undefined 不動／[] 清空／有值全量覆寫） |
| PATCH `/api/options/:id`                                              | manager/admin | 改 label／sort_order／active（停用）／category_ids                                                                                                                                   |
| POST `/api/options/:id/assoc`                                         | manager/admin | 以類別為中心全量覆寫關聯（v1.1.7）                                                                                                                                                   |
| GET `/api/vendors`                                                    | manager/admin | 列表（含停用）；排序 `active DESC, sort_order, id`（v1.1.13）                                                                                                                        |
| POST `/api/vendors`                                                   | manager/admin | 新增（name）                                                                                                                                                                         |
| PATCH `/api/vendors/:id`                                              | manager/admin | 修改／停用／改 `sort_order`                                                                                                                                                          |
| GET `/api/users`                                                      | admin         | 列表（含 pending 與停用）                                                                                                                                                            |
| PATCH `/api/users/:id`                                                | admin         | 可改 `role`、`active`、`display_name`；**防呆規則見下**                                                                                                                              |

**PATCH `/api/users/:id` 防呆規則**：

| 規則               | 說明                                                      |
| ------------------ | --------------------------------------------------------- |
| 不可停用自己       | `active` 由 1 改 0 且 `id == 自己` → 拒絕                 |
| 不可對自己降權     | `role` 由 admin 改非 admin 且 `id == 自己` → 拒絕         |
| 至少保留一位 admin | 操作後 `active=1 AND role='admin'` 的人數須 ≥ 1，否則拒絕 |

違反上述任一規則 → `400 ADMIN_LOCKED`（message 說明原因如「不可停用自己」「系統至少需保留一位管理員」）。

### 4.7 統計

**GET `/api/stats/summary`**（**三角色皆可**，D6）

| 欄位                               | 定義（寫死）                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `open_count` / `in_progress_count` | 目前狀態即時數                                                                               |
| `month_new`                        | 當月 `created_at` 的案件數                                                                   |
| `month_done`                       | **台灣當月內，時間軸出現過 done 回報的不重複案件數**（見下方 SQL）                           |
| `month_initial_open`               | **期初未結案**（v1.1.14 A3 方案②）：本月月初時點尚未結案（open+in_progress；done/void 不計） |

- **v1.1.14（A3 方案②）完成率分母**：完成率＝`month_done / (month_initial_open + month_new)`，由前端計算；分母為 0 顯示「—」
- `month_initial_open` 因 `tickets.status` 是現狀快照、reopen 會改狀態，以月初時點推導（見下方 SQL 註）

- 月份邊界＝**台灣時區**當月 1 日 00:00 起，由 `taipeiMonthRangeUtc()` 換算 UTC 後帶入 SQL
- `month_done` 依據 append-only 的 `ticket_updates` 計算：reopen 不回溯改變歷史月份數字；同案件同月「結案→reopen→再結案」只計 1 件；作廢自然不算完成

```sql
SELECT COUNT(DISTINCT ticket_id) AS month_done
FROM ticket_updates
WHERE kind = 'status' AND status = 'done'
  AND created_at >= :month_start_utc
  AND created_at <  :month_end_utc
```

**GET `/api/stats/amount-by-category?month=YYYY-MM`**（**三角色皆可**，v1.1.12）

| 欄位    | 定義                                                                                    |
| ------- | --------------------------------------------------------------------------------------- |
| `month` | 台灣當月（缺省為當月）                                                                  |
| `items` | `[{ category_label, total_amount, count }]`——以發包時間為月份基準，各類別 `amount` 加總 |

- **以發包時間（`tickets.amount_at`）為記錄基準**：某月內 `amount_at` 落點的案件，其金額納入該月該類別
- 缺省查當月（`taipeiMonthRangeUtc()`），可傳 `month=YYYY-MM` 查指定月份
- `amount_at` 為 NULL（未發包/詢價中）不計入
- **多次發包語意（v1.1.13 鎖死）**：同一張單若多次回報 `in_progress`，`tickets.amount/amount_at` 會被**覆寫為最後一次**；統計以最終 `amount_at` 落點月份計一次，**不加總歷史各次金額**（時間軸每筆 `ticket_updates.amount` 保留歷史，供詳情查看）

```sql
SELECT category_label, COALESCE(SUM(amount),0) AS total_amount, COUNT(*) AS count
FROM tickets WHERE amount IS NOT NULL AND amount_at >= :start AND amount_at < :end
GROUP BY category_label ORDER BY total_amount DESC
```

### 4.7.1 案件動態日報（F1，v1.1.15）

**GET `/api/stats/daily-report`**（**三角色皆可**）

| Query         | 必填     | 說明                                                                                                                                                                                                                                       |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `date`        | **必填** | `YYYY-MM-DD` 台灣時區；**不驗證真實日期以外的合法性**（前端 max=今天）                                                                                                                                                                     |
| `category_id` | **必填** | 正整數（該類別）或字串 `all`（**v1.1.22**：全部類別，合併所有類別當日案件、`category_label` 固定「全部類別」、`category_id` 回 `null`、模板固定取**全域預設**）；類別不存在 → `404 NOT_FOUND`；非正整數且非 `all` → `400 VALIDATION_ERROR` |

- **時間計算**：`taipeiDayRangeUtc(date)` 回 `{startMs, endMs}`（毫秒數字）
  - `startMs` = 該日**台灣 00:00** 的 UTC 對應 = 前一日 16:00:00.000Z
  - `endMs` = **明日台灣 00:00** 的 UTC 對應 = 該日 16:00:00.000Z
  - **半開區間 `[startMs, endMs)`**（F11-7）
  - 台灣時區 UTC+8，**不是** UTC 當天 00:00 — 見 `tests/time.test.ts` F2 統計語意 case
- **回應結構**（v1.1.33：純資料 + 合併模板 daily 單支 body，前端負責渲染成品）：
  ```jsonc
  {
    "date": 1787414400000, // taipeiDayRangeUtc(date).startMs（UTC 毫秒數字）
    "category_id": 1, // v1.1.22：category_id=all 時回 null
    "category_label": "水電", // v1.1.22：all 時固定「全部類別」
    "new_cases": [
      {
        "id": 7,
        "location_label": "頂樓",
        "status": "詢價中",
        "description": "水泵故障",
      },
    ],
    "timeline_updates": [
      {
        "id": 3,
        "location_label": "大廳",
        "status": "已發包",
        "note": "已通知廠商",
      },
    ],
    "has_content": true, // new_cases / timeline_updates 任一非空
    "templates": {
      "daily": {
        "id": 12,
        "body": "修繕系統簡報：{{date_label}}\n{{#each new_cases}}\n{{id}}. {{location_label}}　{{status}}　{{description}}\n{{/each}}\n{{#each timeline_updates}}\n{{id}}. {{location_label}}　{{status}}　{{note}}\n{{/each}}\n{{system_link}}",
      },
    },
  }
  ```
- **new_cases**：當日（`created_at` 在區間內）、屬該類別之新建案件；`status` 固定為「詢價中」（前端文案，非 tickets.status）
- **timeline_updates**：既有案件（`last_activity_at` 在區間內且 `created_at < startIso`，非當日新建）於當日 update **拉平成一維清單**，每筆含 `id`(案件編號)、`location_label`、`status`(原 status_label)、`note`(留言；null→空字串)。上限：每張既有案件當日 update 最多 3 筆，依 `created_at` 反序取最新 3 再 reverse 為時間正序（由舊到新）
- **業主決策（2026-08-23）**：當日新建 + 當日又有 update 的案件只進 `new_cases`，不進 `timeline_updates`
- **templates.daily**：可編輯合併模板（v1.1.33：`new_case`/`timeline` 併為單支，seed 於 migration 0003；**v1.1.20 起內容存 `label` 欄、`type` 欄當鍵**；active=1、全域）。body 內含 header／兩段 each／`{{system_link}}`；即使無案件也回傳（前端空案以 dummy 列補位、無內容時 `system_link` 為空字串）
- **has_content**：`new_cases` 與 `timeline_updates` 任一非空 → true。前端依此決定成品末尾是否追加總系統連結（R-2）
- **all 模式（v1.1.22）**：`category_id=all` 時新／既有兩組 SQL 皆不限類別（`WHERE` 跳過 `t.category_id` 過濾），`category_label` 固定「全部類別」、`category_id` 回 `null`；**模板固定取全域預設**（all 沒有單一類別可取樣專用模板——實作上以 `category_id = -1` 查 `option_categories`，必然無匹配 → 落全域）。前端統計頁「案件動態」類別下拉因此多一列「全部類別」（value=`all`）且**預設選取**

### 4.8 CSV 匯出（D3）

> 背景：iOS LINE WebView 對 `Content-Disposition: attachment` 支援不穩，而使用者 100% 從圖文選單進入。故採「簽名連結＋外部瀏覽器」方案。

**POST `/api/exports/sign`**（manager/admin，標準 Cookie＋CSRF 驗證）

```json
請求：{ "status": "done", "from": "2026-07-01", "to": "2026-07-31" }
回應：{ "ok": true, "data": { "url": "/api/exports/tickets.csv?uid=3&status=done&from=2026-07-01&to=2026-07-31&exp=1755612000&sig=..." } }
```

- 三個篩選參數全選填，與 CSV 端點共用同一個 zod schema
- `exp`＝當下 Unix 秒 + **300（5 分鐘）**
- `sig`＝`base64url(HMAC_SHA256(JWT_SECRET, "export:v1|" + [uid, exp, status||'', from||'', to||''].join('|')))`
  - **domain separation**：前綴 `"export:v1|"` 避免與 session JWT 產生跨用途碰撞

**GET `/api/exports/tickets.csv`**（**註冊於全域 requireAuth 之上**，端點內雙軌自驗，任一通過）

- **軌 A**：呼叫 `resolveUser(c)` 取得有效 session，且 role 為 manager/admin（供已登入的外部瀏覽器直接使用）
- **軌 B**（resolveUser 回 null 或角色不符時）：驗 `uid`/`exp`/`sig`
  1. `exp` 過期 → `401 EXPORT_LINK_EXPIRED`；偵測 `Accept: text/html` 時回極簡 HTML 頁（「下載連結已過期，請回系統重新匯出」），API 呼叫仍回 JSON
  2. 依查詢參數重算 sig，timing-safe 比對不符 → `401 UNAUTHORIZED`
  3. `uid` 對應使用者須存在、`active=1`、role 為 manager/admin（與「停用立即生效」原則一致）

**內容規格**：

- 編碼：**UTF-8 with BOM**（`\uFEFF` 開頭，Excel 開中文不亂碼）
- 欄位（**13 欄**，v1.1.14 加發包金額/時間）：
  `單號, 類別, 地點, 說明, 狀態, 廠商, 建立人, 建立時間, 最後活動, 結案時間, 回報次數, 發包金額, 發包時間`
  - 單號格式 `#0042`；時間格式 `YYYY-MM-DD HH:mm`（台灣時區）；回報次數＝該單 `kind='status'` 的筆數
  - 第 12/13 欄「發包金額／發包時間」＝ `tickets.amount/amount_at`（多次發包覆寫為最後一次；未發包為空字串）
- Query（皆選填）：`status`、`from`、`to`（台灣日期 YYYY-MM-DD，對 created_at 篩選）；無參數＝全部案件
- **日期真驗證（v1.1.14 F2）**：`from`/`to` 除 regex 外，須為真實日期（擋 `2026-02-31`、`2026-99-99`），否則 `400`；`from <= to` 否則 `400`
- **`to` 邊界（v1.1.14 F1）**：視 `to` 為「隔天 00:00 前」，`created_at < to+1天`，不漏 `to` 當天 23:59:59.999
- **CSV injection 防護**：以 `=`、`+`、`-`、`@`、`\t`、`\r` 開頭的儲存格前綴 `'`（v1.1.14 G2：**忽略前導空白**後再判，防 `"  =..."` 繞過）
- **Quoting 規則**：欄位含 `,`、`"`、`\n`、`\r` → 整欄以雙引號包住；欄位內 `"` → `""`
- Header：`Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="repair-tickets-2026-08-18.csv"`（檔名用 ASCII＋`taipeiDate()` 之 `en-CA` 短格式，即 `YYYY-MM-DD`）、`Cache-Control: no-store`、`X-Robots-Tag: noindex`
- v1 只匯出案件主表；時間軸明細匯出列 v2

**前端流程**：

1. 按「匯出 CSV」（帶目前篩選）→ `POST /api/exports/sign`
2. 取得 url 組成絕對網址 → `liff.openWindow({ url, external: true })`
3. 匯出鈕旁固定提示：「將於外部瀏覽器開啟下載」
4. 已在外部瀏覽器且已登入時：可直接 `window.open`（走軌 A）

### 4.9 訊息模板 CRUD（F6/F8，v1.1.15；v1.1.20 欄位重新分配）

> 不新開表，沿用既有 `options` 字典表。F12-2 業主決策。
> **v1.1.20（業主決策）**：`type` 欄直接當模板鍵（前綴 `message_template_`）、`label` 欄存模板內容，**砍掉 `body` 欄**（migration 0013）。舊的 `type='message_template'`＋`label` 當鍵＋`body` 存內容設計廢止；v1.1.15 的 `report` / `empty` 兩行一併刪除（無用途）。
> **v1.1.33（業主拍板）**：兩支模板合併為單一支 `message_template_daily`（migration 0003 幂等：DELETE 舊鍵＋`INSERT OR IGNORE` 新列）。對外 API 形狀不變：query/response 的 `label` 是鍵、`body` 是內容（取自 `label` 欄）。

**GET `/api/message-templates?category_id=N&label=daily`（`label` 選填，預設 `daily`）；`ALLOWED_LABELS = [daily]`，其它值 → `400 VALIDATION_ERROR`**

- 三角色皆可讀
- 回 `{ category_id, label, templates: [{ id, label, body, active, sort_order, is_category_specific }] }`（v1.1.20：`label` 由 `type` 前綴導出、`body` 取自 `label` 欄；`is_category_specific` 依當次查詢的 `category_id` 對 `option_categories` 的關聯計）
- **列表內容**：該 `type` 全部 `active=1` 列（`is_category_specific DESC, sort_order ASC, id ASC` 排序）——類別專用排前、全域預設排後

**GET `/api/message-templates/:id`**

- 三角色皆可讀；無效 id → `400`、不存在 → `404`

**PUT `/api/message-templates/:id`**

- **manager/admin** 限定；committee → `403`
- body 接受 `{ body?: string, label?: 'daily' }`（至少一欄）；空 body → `400 VALIDATION_ERROR`
- in-place overwrite（v1.1.20）：`body`→`UPDATE label`（內容）、`label`（鍵）→`UPDATE type`（加 `message_template_` 前綴，同鍵被其他 id 占用 → `400 VALIDATION_ERROR`）
- **不做**新增/刪除/啟用切換：編輯就是修改該筆 active=1 模板，存檔後直接覆寫生效

**模板語法（F8）**：

- `{{key}}` 替換；缺值 → 空字串
- `{{#each array}}...{{/each}}` 迴圈；支援巢狀
- `{{序}}` 為迴圈計數器（1-based）
- v1.1.16：模板渲染**全在前端**（`public/templateEngine.js`）。後端 `src/lib/templateEngine.ts` **已刪除**，API 不回傳渲染結果，只回純資料 + 合併模板 body
- v1.1.33 可編輯模板僅一支 **daily**（合併）：頂層變數 `{{date_label}}` `{{system_link}}`；new_cases 段 `{{id}} {{location_label}} {{status}} {{description}}`；timeline_updates 段 `{{id}} {{location_label}} {{status}} {{note}}`；各段以 `{{#each …}}…{{/each}}` 展開
- **變數解析順序**（F8 v1.1.15）：巢狀 each 內變數查找 = 當前 item → 外層 each item（遞迴向上）→ ctx 頂層。內層有同名變數時遮蔽外層。

---

## 5. 前端畫面

### 5.0 全域規則

- `index.html` 為 SPA 入口，hash router 切換 P0–P7；`share.html` 為獨立免登入頁
- 所有 `<img>` 直接使用 API URL（Cookie 自動帶上）
- 使用者內容進 DOM 一律 `textContent`，禁止 `innerHTML`
- 401 一律走 §3.4 靜默重登；403 依 code 顯示對應訊息
- 前端 fetch wrapper 統一自動帶 `X-Requested-With: fetch`（見 §4.0）
- 照片壓縮：`browser-image-compression`（最長邊 1280px、目標 ≤500KB、初始品質 0.7、輸出 JPEG）；**解碼失敗時**顯示「此照片無法處理（檔案可能損壞或不支援的格式），請改用相機拍攝或先在相簿轉存」
- **HEIC/HEIF 自動轉 JPEG（v1.1.23）**：`compressPhoto()` 進壓縮前先 `isHeicBlob()` 讀 magic bytes（`ftyp` ＋ brand 白名單 `heic/heix/hevc/hevx/heif/mif1/heim/heis`；不靠 `file.type`——部分 Android 裝置報 `application/octet-stream`），是則 `heic2any`（vendored §1.2）轉 JPEG 後**照舊**進上述壓縮管線；非 HEIC 不動
- 觸控目標 ≥ 44px、內文字級 ≥ 16px（input 也 16px，避免 iOS 自動縮放）
- 狀態色：🔴詢價中／🟡處理中（已發包）／🟢已完成／⚫作廢

**v1.1.13 觸控與可讀性補強**：

- **照片刪除鍵 `.thumb-del` ≥ 32px**（原 22px 過小，觸控不佳）
- **狀態徽章對比**：黃底改深琥珀字（`#92400e`）、紅底改淺紅底深紅字、綠底改淺綠底深綠字（WCAG AA 可讀）
- **`<select>` 統一 `padding-right: 32px`**：避免長文字被 iOS 原生箭頭覆蓋
- **`.modal` 加 `max-height: 85vh; overflow-y: auto; display:flex; flex-direction:column`**（選項多時不超出視窗）

**v1.1.13 提示統一**：操作回饋/錯誤改用既有 `toast()`（底部滑出、自動消失），**不再用原生 `alert()`**（WebView 中會中斷體驗）。

### 5.0.1 P0 等待開通頁

```
┌─────────────────────┐
│   🏘️ 社區修繕系統    │
│                     │
│  您好，{LINE 名稱}    │  ← 從 GET /api/auth/me 取得
│  您的帳號等待開通中    │
│  請通知管理公司審核    │
│                     │
│  [ 重新整理 ]         │
└─────────────────────┘
```

- 進入系統後，前端先打 `GET /api/auth/me`；若 `role === 'pending'` → 導向 P0
- P0 提供「重新整理」按鈕，重新打 me 檢查是否已開通

### 5.1 P1 案件列表

- 狀態篩選 tabs：**未結（=active，預設）／詢價（open）／處理（in_progress，代表已發包）／完成（done）／作廢（void）／全部（all）**——名稱與 status 值一一對應；類別下拉篩選
- 卡片：標題、狀態徽章、廠商、最後活動時間
- **指派廠商只在編輯頁**（v1.1.5：列表卡片不塞指派下拉）
- stale 提示**前端計算**：`now − last_activity_at > 7×24h`（僅 open/in_progress 顯示），文案含實際天數：「⚠ 12 天未更新」
- 分頁：依 `has_more` 顯示「載入更多」
- **tab／分類態持久化（v1.1.29）**：`localStorage.listStatus`（值限 `active`／`open`／`in_progress`／`done`／`void`／`all`，非白名單值落預設 `active`）＋`localStorage.listCategory`（`''` ＝全部分類）；整頁重載後仍回到剛才那批案件
- **刷新後的還原（v1.1.29）**：同 route 的刷新（LIFF push／`pageshow`）還原捲動位置（數值 `scrollY`）與焦點（穩定鍵 `[containerIndex, elementIndex]`＋caret，`Math.min` 鉗制越界）；换 route 落頂、焦點不擾

### 5.2 P2 建單

- **類別下拉、地點下拉**（v1.1.7 起用 `GET /api/options/catalog` 一次抓完所有選項＋關聯，**分層快取**：建單/編輯用短 TTL（30 秒），列表/留言用長 TTL（10 分鐘）——v1.1.8 優化，取代「每次進頁強制重讀」，避免每次進建單/編輯頁都吃一次 D1 連線延遲；換類別本地過濾即時）
- **使用範本下拉＋附加按鈕**（v1.1.5 改下拉＋附加；v1.1.9 正名「故障類型範本」；v1.1.11 改「使用範本」並移到說明之下）：選取後按「＋ 附加」將文字附加至 textarea，已有內容時以「、」串接；同一說明不重複附加。**順序：類別 → 地點 → 說明 → 使用範本（選填）→ 照片**，範本為選填輔助，位在主要說明欄位之下
- 說明 textarea（選填）、照片上傳（先壓縮 → POST /api/photos → 收 id）
- **照片上傳共用函式（v1.1.13）**：`attachPhotoPicker(photos, initialPhotos?)` 為全域共用（`public/app.js`），建單/留言框/編輯三處**共用同一份**照片選擇邏輯——壓縮、≤5 張上限、縮圖預覽、✕ 刪除鍵、上傳回傳 id。呼叫端持有 `photos` 陣列（mutable），函式同步 push/splice 維護；`initialPhotos`（選填）供編輯頁帶入既有照片。**禁止各頁複製貼上照片邏輯**
- **無廠商欄位**（建單不指派廠商；廠商僅在 PATCH 由 manager/admin 指派）
- **無關聯類別**（v1.1.7）：選到地點/說明全空的類別時，alert 提示並重新讀取 catalog（**不重整頁面，保留已輸入資料**）
- 送出 → POST /api/tickets → 跳 P3

### 5.3 P3 案件詳情

- **右上角 ⋮ 選單**（v1.1.6）：利用返回右邊空間，點開下拉顯示 **分享連結（複製）／✏️ 編輯／🗑 作廢／↩️ 重新開啟／🔄 重新產生分享連結**。分享連結不再佔主版面。
- 案件資訊卡（緊湊：detail-head/detail-line）、照片牆、**時間軸為主角**。時間軸依 `kind` 三種樣式：狀態回報（徽章＋說明＋照片）／💬 留言（姓名＋內容＋照片，無徽章）／系統紀錄（灰色小字，**v1.1.14 顯示實際操作者名字**，無名時 fallback「系統」）
- **發包金額顯示（v1.1.12）**：案件已發包（`amount` 非空）時，資訊卡顯示「發包金額：$X」；時間軸的「已發包(in_progress)」回報更新若帶 `amount`，也在該筆時間軸顯示「發包金額：$X」
- **底部留言框改隱藏式**（v1.1.6）：頁面底部只有「💬 留言／回報」按鈕，點開才展開留言框＋可選狀態更新（manager/admin 可標記處理中/完成，委員僅留言）
- **⋮ 選單**：編輯（**v1.1.14 E1 方案B**：詳情回應含 `can_edit`，由後端算好；committee 僅自己建的單、manager/admin 全部，open/in_progress）、作廢（manager/admin，二次確認含選填原因）、重新開啟（僅 admin 且 done/void → modal 選狀態＋備註）、重新產生分享連結（manager/admin，直接更新輸入框）
- 🟢 完成（P4 回報選 done）需二次確認彈窗
- **縮圖點開放大**（lightbox，v1.1.4）：詳情頁主照片牆、時間軸回報/留言照片、**公開派工頁（share.html）照片牆**三處共用同一 `thumb()`＋`openLightbox()` 邏輯。**v1.1.13 修復 share 頁縮圖點不開**——share.js 的 `el()` 缺 `onclick` 事件處理（`setAttribute` 傳函式無效），補 `addEventListener` 與 app.js 一致；share.html 引用 share.js 加版本參數防快取
- **指派廠商在編輯頁內**（v1.1.5：保全/秘書層級，不再塞列表/詳情頁）
- **編輯照片（v1.1.13）**：編輯頁可**補上傳新照片**（共用 `attachPhotoPicker`）、可**刪除既有照片**（✕ 移除清單）。儲存時送 `photo_ids`（**最終要保留的案件主照片清單，全量覆寫**）——新增的照片綁定到該案、被移除的照片**解除綁定（`target_id=NULL`），不刪 R2**。照片有增刪才送；時間軸以 `system` 紀錄「新增 N 張照片／移除 N 張照片」

### 5.4 P4 回報／留言（v1.1.5 起併入 P3 詳情頁留言框）

> **已移除獨立「新增回報」頁**（v1.1.5 起）：回報統一走 P3 詳情頁底部的「💬 留言／回報」留言框，含狀態更新。v1.1.8 清理死碼，移除 `pages.report` 與 `#/report` 路由。

- 狀態更新（kind=status）限 **manager/admin**，可選 詢價中／🟡 已發包（必填金額）／🟢 完成
- 按 🟢 完成即結案，需二次確認彈窗：「標記為已完成並結案？」
- 純留言（kind=comment）**三角色皆可**，不改狀態
- 委員不可變狀態，僅能留言（§0.3 規則 2）
- **回報範本下拉＋附加**（v1.1.7 加，v1.1.9 改 `type='comment_desc'`）：manager/admin 留言框有「選擇回報範本…」下拉，選取後按「＋ 附加」附加至留言 textarea；**通用不依類別過濾**（追蹤說明，全部顯示）

### 5.5 P5 統計（**三角色皆可**，D6）

- 六個數字卡片（v1.1.4）：詢價中、處理中、**未結案總數**、本月新增、本月完成、**本月完成率**（v1.1.14 A3 方案②改為 `= 本月完成 / (期初未結案 + 本月新增)`，分母 0 顯示「—」）
- **月份切換（v1.1.14 A4）**：近 12 個月下拉，切換時以 `Promise.all` 同步刷新 summary 與各類別金額（避免上下月不一致）
- **各類別金額區塊（v1.1.12）**：以發包時間（`amount_at`）為月份基準，各類別 `amount` 加總，顯示「類別／件數／金額」＋合計
- 「匯出 CSV」按鈕＋固定提示「將於外部瀏覽器開啟下載」（流程見 §4.8）——**僅 manager/admin 可見**（D3）
- **sub-tab 拆分（v1.1.21）**：統計頁拆成兩支 sub-tab（`.tabs`）——**「月度統計」**（六卡＋月份下拉＋各類別金額＋CSV 匯出）與**「案件動態」**（下方日報框），一次只看一塊（手機單屏可讀）；`localStorage.statsTab` 記憶上次選擇、預設月度；「案件動態」tab 活躍才發 daily-report 請求（月度預設時不打）
- **類別下拉預設「全部類別」（v1.1.22）**：「案件動態」日報框的類別下拉第一列為「全部類別」（value=`all`、對應端點 `category_id=all` 合併全部類別當日案件），**預設選取**；`localStorage.dailyReportCatId` 記憶上次選擇（含 `all`），有記憶值時以記憶值為準
- **案件動態區塊（F2/F3，v1.1.15；v1.1.21 起為 sub-tab 內容）**：
  ```
  [月度統計 | 案件動態]   ← sub-tab
  [日期 <input type="date" max=今天>] [類別下拉] [📋 複製]
  [訊息預覽 textarea readonly]
  ```
  - 日期選擇器：`<input type="date">`，**max=今天**（不允許選未來），onchange 重抓
  - 類別下拉：從 `ensureCatalog()` 拿 categories，**第一列為「全部類別」（v1.1.22 預設選取，值 `all`；取代 v1.1.15「預設第一個、不做全部」的決策）**，**不存 hash**，**用 `localStorage` 記住上次選擇**
  - 複製按鈕：`navigator.clipboard.writeText`；LIFF WebView / iOS Safari 權限問題 fallback `document.execCommand('copy')` + toast「已複製」
  - 訊息預覽（v1.1.33）：讀 daily-report 回傳的 `new_cases` / `timeline_updates` + `templates.daily` body → `composeDailyMessage()`（統計頁與模板頁共用）以 templateEngine 渲染整篇：header／兩段 each／系統連結皆在模板內；空案以 dummy 列補位（今天無新案件／今天沒有案件狀態更新）；僅有實際內容時 `{{system_link}}` 有值（R-2）
  - **空態**：`new_cases`、`timeline_updates` 皆空 → 對應段顯示「今天無新案件」「今天沒有案件狀態更新」（由拼裝函式以 dummy 列帶入），且末行無系統連結
  - **不做**今日/昨日/本週三選一，**單純日期選擇**就夠業主用了

### 5.6 P6 成員管理（admin）

- **權限分級中文化**（v1.1.5 定案）：主管（admin）／保全秘書（manager）／委員（committee）／待開通（pending）
- **篩選**（v1.1.4）：全部成員／待開通／已開通／已停用；**篩選態持久化（v1.1.30）**＝`localStorage.usersFilter`（值限 `all`／`pending`／`active`／`disabled`，非白名單值落預設 `all`；`change` 時寫入）
- 成員列表：改角色、停用／啟用（**停用紅、啟用藍**，v1.1.4）、改名
- **防呆提示**：停用自己或最後一位 admin 時，後端回 `ADMIN_LOCKED`，前端顯示對應訊息

### 5.6.1 P6.1 訊息模板管理（F7 + G7，v1.1.15，manager/admin）

- 入口：**top nav「📝 訊息模板」**（manager/admin）；獨立頁 `pages.messageTemplates()`
- v1.1.33：合併後單一支模板 **daily（「每日簡報」）**（原 new_case／timeline 兩支併為一支）
- v1.1.21 **版面重構**：進頁先組「**完整簡報預覽**」（合併模板套前端 fixture 即時渲染出整篇實際發送長相：header＋新案件段＋時間軸段＋系統連結，`.tmpl-full`）；下方「**模板來源**」一行（模板名稱＋此類別專用/全域預設）。**模板名稱是超連結**，點名稱或「編輯」才開編輯 modal
- 編輯 modal（`modal-mask` 置中彈窗）：`<textarea>`（可拖曳調整大小）+ **即時預覽**（用前端 fixture 資料渲染，无需 roundtrip）＋變數提示；**「重置出廠預設」（G7）移入 modal 內**（不再散在列表行）；**存檔後整篇簡報預覽同步刷新**（不再整頁重新載入）
- body 可用變數：**daily**＝頂層 `{{date_label}}` `{{system_link}}`＋`{{#each new_cases}}…{{/each}}`（`{{id}} {{location_label}} {{status}} {{description}}`）＋`{{#each timeline_updates}}…{{/each}}`（`{{id}} {{location_label}} {{status}} {{note}}`）
- 儲存：PUT /api/message-templates/:id（manager/admin 限定，body in-place overwrite）
- **不做**：下拉式變數插入、IntelliSense 自動完成、版本歷史（v1.1.16 簡化砍除）
- **重置為出廠預設（G7）**：seed body hardcode 在前端（與 migration 0003 合併模板對齊），確認後 PUT 覆寫

### 5.7 P7 管理（manager/admin，D5）

- 選項管理 tab：**類別／地點／使用範本／回報範本／廠商**（v1.1.4 起廠商獨立成 tab；v1.1.9 加「回報範本」tab 並正名「故障類型範本」；v1.1.11 統一「使用範本」）；**tab 態持久化（v1.1.30）**＝`localStorage.adminType`（值限 `category`／`location`／`description`／`comment_desc`／`vendors`／`message_templates`，非白名單值落預設 `category`；tab 點擊時寫入）
- 選項：新增、改名、排序、停用（停用紅）
- 廠商：新增、修改、停用（停用紅／啟用藍）
- **類別關聯（v1.1.7 以類別為中心）**：類別 tab 每列顯示「📍N 地點 · 💬N 說明」關聯計數＋「設定關聯」按鈕；點開 modal 才載入該類別的地點/說明（checkbox 勾選），儲存走 `POST /api/options/:id/assoc` 全量覆寫。**不在列表逐項載入，避免 N+1**。

### 5.8 share.html（公開）

- 進入方式：**`/share.html?token={share_token}`**（v1.1.4 起；share.js 從 query 取 token，相容從 pathname 取）
- 顯示白名單欄位＋照片（照片 url 指向 `/api/share/{token}/photos/{id}`）
- 顯示「狀態更新於 {last_activity_at 換算台灣時間}」（此為 share 回傳 last_activity_at 的用途）
- **動態頁標題（v1.1.12）**：`/share.html` 由 Pages Function（`functions/share.html.ts`）動態渲染，依 token 查 D1 把 `<title>` 組成為「{類別}－{地點} #{id}」，讓通訊軟體分享卡片顯示案件標題（而非寫死「派工單」）；token 無效時回「派工單」預設標題。`_routes.json` 已加入 `/share.html` 走 function
- token 無效顯示「連結已失效，請向管理公司索取新連結」
- 內建 print CSS：管理公司可用瀏覽器「列印→儲存為 PDF」
- 安全標頭：**v1.1.12 起由 `functions/share.html.ts` 內直接回傳**（CSP/nosniff/no-referrer/noindex/no-cache），不再走 `public/_headers`（function 回傳不套用靜態檔 _headers）

---

## 6. CLAUDE.md（放 repo 根目錄，AI 施工必讀）

> **施工規則全文以根目錄 `CLAUDE.md` 為準**（v1.1.23 起不再於 SPEC 內嵌副本——此前兩份各走各的、已漂移：根目錄版含 test:local/CI 工作流/依賴清單等 SPEC 副本沒有的一半，SPEC 副本含 2 條 SPEC 側細則根目錄版沒有）。此兩條 SPEC 側細則為 CLAUDE.md 未重複者：
>
> 1. **詳情連結走登入後路由 `/#/ticket/{id}`，不走 share_token**（避免把公開連結用於內部通訊）。
> 2. **模板變數語法（F8，v1.1.16；v1.1.33 合併）**：`{{key}}` 替換 / `{{#each array}}...{{/each}}` 迴圈；後端**完全不渲染**，API 只回純資料 + 合併模板（daily）單支 body，前端 `templateEngine.render()`＋`composeDailyMessage()` 負責管理頁預覽與統計頁成品拼裝。
>
> 產品規則（狀態流/權限/時間軸不可改等）以 §0.3 為唯一真相來源；CLAUDE.md 的「產品規則」段僅補 §0.3 未列的 AI 動作細則。

---

## 7. LINE 平台設定（人工作業）

1. LINE Developers Console 建立 **LINE Login Channel**，取得 Channel ID
2. 建立 **LIFF app**：Scope 勾選 `openid`＋`profile`（`display_name` 取自 ID token 的 `name` claim）；Endpoint URL 填正式網域
3. **preview 環境**：**已取消（v1.1.5）**——preview 部署已關閉，僅需正式 LIFF app，不需另建 preview LIFF
4. **開官方帳號（OA）**：LINE Official Account Manager 註冊，選輕用量免費方案（⚠ 方案名稱與費率以 LINE 官方帳號後台當下公告為準）
5. **OA 與 Login Channel 連動**：OA 後台 → Messaging API 頁 → 選擇與 Login Channel 相同的 Provider → 啟用
6. **圖文選單（Rich Menu）**：OA 後台設定，連結指向 LIFF URL（圖文選單屬官方帳號功能，沒有 OA 就沒有入口）
7. **請成員加入好友**：社區管委會、管理公司人員加入 OA 好友（才能從圖文選單進入系統）
8. Channel ID 設定為 Pages 環境變數 `LINE_CHANNEL_ID`

---

## 8. 部署與工程

### 8.1 wrangler.toml

```toml
name = "repair-system"
compatibility_date = "2026-08-01"
pages_build_output_dir = "public"
# compatibility_flags = ["nodejs_compat"] 目前刻意不開；
# hono/jose/zod 皆 Web API 原生，日後引入 Node 相依再開

[[d1_databases]]
binding = "DB"
database_name = "repair-db0818"
database_id = "99a4f274-d68c-4ad6-b382-6a6e449cf0ed"

[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "repair-photos"

[vars]
LINE_CHANNEL_ID = "2008484338"
```

> **preview 決策（v1.1.5）**：preview 自動部署已關閉（`preview_deployment_setting: none`），單人開發直接 push main 走 production。preview 環境不再需要另建 `repair-db-preview` 或設定 preview 的 D1/R2/secret。

### 8.2 _routes.json 與 _headers

**`public/_routes.json`**：

```json
{
  "version": 1,
  "include": ["/", "/index.html", "/api/*", "/share.html"],
  "exclude": []
}
```

> **⚠ 根路徑必須顯式列出（v1.1.19 實測修正）**：`include` 是白名單，沒列的路徑一律回靜態檔。v1.1.17 曾加 `functions/index.html.ts` 但沒列 `"/"`——CF Pages 檔案路由上根路徑 `/` 對應的檔名是 `functions/index.ts`（不是 `index.html.ts`），兩條件缺一不可，否則根路徑永遠回靜態 `public/index.html`（寫死 `?v=`），cache-busting 形同虛設。

**`public/_headers`**（Pages 靜態檔標頭設定；**v1.1.12 起 share.html 改由 Pages Function 動態渲染，其安全標頭在 `functions/share.html.ts` 內直接回傳**，`_headers` 不再含 `/share.html` 規則）：

```
/index.html
  Cache-Control: no-cache

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
```

> **⚠️ 主站不加 CSP（v1.1.13 實測後撤回）**：先前曾嘗試加主站 CSP，但**會導致 LINE 以外的瀏覽器無法開啟**（`script-src`/`connect-src` 白名單過嚴，擋掉 LINE 外環境的非 LIFF 載入）。主站維持「僅 nosniff + referrer-policy」、**不設 CSP**。share.html 的 CSP 由 Function 內獨立回傳（`functions/share.html.ts`），不受 `_headers` 影響，維持安全防護。

**`functions/index.ts`＋`functions/index.html.ts`（v1.1.19 重構；v1.1.17 新增）— 動態 cache-busting**：兩支薄入口共用 `functions/lib/dynamic-index.ts` 的 `serveDynamicIndex(env)`，請求時動態產生 index HTML，把本機 asset（`/style.css`、`/vendor/*.js`、`/templateEngine.js`、`/app.js`）的 `?v=` 設為 `CF_PAGES_COMMIT_SHA` 前 12 字（本機 `wrangler pages dev` fallback 取 `dev`），回應頭設 `Cache-Control: no-cache`＋與 `_headers` 一致的 `X-Content-Type-Options: nosniff`／`Referrer-Policy: no-referrer`（主站仍不加 CSP，同本節）。**目的：修復「每次部署看不到新程式」**——原本 `public/index.html` 寫死 `app.js?v=1.1.15`，即便 `_headers` 對 `/index.html` 設 `no-cache`，瀏覽器仍長快取舊版腳本；本 Function 讓每次部署產生唯一 `?v=<commit>` URL → 強制抓最新版、无需手動改版本號、永不忘。與 `functions/share.html.ts` 同属「function 動態渲染 HTML」模式，安全標頭皆於函式內直接回傳（不走 `_headers`）。

> ⚠ v1.1.19 實測修正：v1.1.17 只建了 `functions/index.html.ts`，但 CF Pages 檔案路由上**根路徑 `/` 對應的檔名是 `functions/index.ts`**、`/index.html` 路徑才對應 `index.html.ts`；加上 `_routes.json` include 白名單沒列根路徑 → 根路徑 `/` 一直回靜態 `public/index.html`，cache-busting 從未生效。v1.1.19 起兩支入口＋include 列 `"/"`、`"/index.html"` 才真正生效。
> ⚠ 修改 index HTML 結構（增減 `<script>`、`<link>`）時改 `functions/lib/dynamic-index.ts` 即可（兩支入口共用，勿再各改各的）。

> `X-Frame-Options`／`frame-ancestors`：LIFF 是 WebView 而非 iframe，理論上可設 `DENY`/`'none'`，但**實測確認不影響 LINE 開啟後再鎖**（避免誤擋）。故首版 `_headers` 先不加，列入施工驗證項。

### 8.3 migrations

```bash
npx wrangler d1 migrations create repair-db0818 init   # 產生檔案後貼入 §2.1 SQL
npx wrangler d1 migrations apply repair-db0818 --local      # 開發
npx wrangler d1 migrations apply repair-db0818 --remote     # 正式
```

> seed 已併入 migration（v1.1.6），無需手動執行 seed.sql。

### 8.4 secrets

- `JWT_SECRET` 只用 `wrangler pages secret put JWT_SECRET` 設定，不進版控
- 本機開發用 `.dev.vars`，並將 `.dev.vars` 加入 `.gitignore`

### 8.5 D1 備份

誤刪還原：

```bash
npx wrangler d1 time-travel repair-db0818 --timestamp <unix_timestamp>
```

建議每日記錄一次關鍵時間點的 timestamp，或操作前先記錄當下時間。

### 8.6 孤兒照片政策

v1 不處理（R2 免費額度足夠）；v2 若要清理，須另開**獨立 Worker** 設定 cron trigger（Pages Functions 不支援 cron）。

### 8.7 測試與 CI（v1.1.13 確認）

**E2E 不會碰正式資料**（審查曾誤判為「E2E 可能寫入 production」，實際不成立）：

- `public/app.js` 的 `api()` 開頭是 `if (IS_MOCK) return mockApi(path, options)`——**`?mock=true` 時所有 API 呼叫都走前端記憶體 mock（`mockApi`），完全不 `fetch` 正式網域**。
- `liff-mock.js` 僅模擬 LINE 登入；`mockTickets`/`mockOptions`/`mockVendors` 都是記憶體寫死，新增/留言/重發 token 只改記憶體，**不碰正式 D1/R2**。
- 因此**不建 staging 測試環境**（單人開發，見 §0.3 明確不做），E2E 對正式網域跑 `?mock=true` 是安全且正確的。

**單元測試**：`@cloudflare/vitest-pool-workers` 在本地 workerd runtime 跑真實 D1/R2（miniflare），不碰正式資料。

**本地單元測試快速迴圈 `npm run test:local`（v1.1.15 新增，不用 workerd）**：

- **用途**：本機立即驗證單元測試（13 檔 175 tests，約 10–60 秒視環境），不必等 push 後的 CI。workerd 跑不了的環境（如 Alpine musl 沙箱）也能跑。
- **原理**：`vitest.node.config.ts` 以 `resolve.alias` 把 `cloudflare:test` 指向 `tests/node/cloudflare-test-shim.ts`，**測試檔零改動**：
  - `SELF.fetch()` → Hono `app.request()`（不起 HTTP server）
  - `env.DB` → `tests/node/d1.ts`：以 Node 內建 `node:sqlite` 實作的 D1 shim（prepare/bind/run/all/first/raw/batch/exec；batch 經 `__execForBatch` 保留 INSERT 的 `meta.last_row_id`）
  - `env.PHOTOS` → `tests/node/r2.ts`：Map-based R2 stub
  - shim 於 module load 建立 fresh in-memory DB＋套用 `migrations/` 全套 SQL，並以 `beforeEach` 重置——等價 workers pool 的 isolatedStorage
  - `tests/node/_icu-polyfill.ts`：精簡 ICU 的 Node 上補 en-CA 的 `format`／`formatToParts`（full-ICU 環境自動 no-op），避免日期格式假失敗
- **語意警告**：shim 是近似而非真 D1——錯誤訊息格式、meta 欄位細節與真 D1 有差。**`npm test`（workers pool / CI）仍是唯一真相**；`test:local` 全綠不代表可略過 CI。

**CI 流程**（`.github/workflows/test.yml`）：`npm ci` → typecheck → `npm test`（單元）→ E2E（對正式網域 `?mock=true`）。E2E 現行規模：4 支 spec 共 37 條（app 24／daily-report 5／message-templates 5／cache-busting 3）；cache-busting 3 條在本地 `http.server`（無 Functions 層）必掛，屬環境限制、非代碼問題。

**E2E 效能（v1.1.14 優化）**：

- **等待方式**：E2E 一律用 Playwright 的 `expect(...)`／`expect.poll()` **自動重試**（DOM 出現即過），**禁止固定 `waitForTimeout()`**（v1.1.14 已移除全部 14 處固定等待，實際測試從 ~20s 降到 ~9s）。
- **瀏覽器快取**：workflow 對 `~/.cache/ms-playwright` 加 `actions/cache`（keyed on `package-lock.json`），命中後省 `npx playwright install` 的 ~22s 下載。
- **E2E 已知限制（勿再犯）**：mock 模式 `api()` 開頭 `if (IS_MOCK) return mockApi()` → **不走瀏覽器 fetch**，故 `page.on('request')` 攔不到。驗證「送出 API 是否觸發」只能用 UI 互動斷言（dialog/modal/toast 出現），不能攔截請求。

**人工驗收流程（v1.1.14 新增）**：CI 全綠後，另對正式網域 `?mock=true` 逐項實測（不碰正式資料，同 E2E 安全前提）。每次改版後至少跑一遍以下 checklist。

**驗收工具與方法（明確規格）**：

- **工具**：用瀏覽器自動化工具（Minis 內建 `browser_use`，或等價 Playwright / 手動瀏覽器 DevTools）開啟 `https://repair-system-4re.pages.dev/?mock=true`。**禁止用此方式對正式資料寫入**（僅檢視，mock 模式本來就不碰 D1/R2）。
- **方法**：以「讀取 DOM 狀態」為主——對目標元素下 `execute_js`（或 Playwright `locator`）取 `.textContent`／`.value`／元素數量／`.classList` 內含的 `active` 等，**與預期值比對**。不以肉眼描述截圖為準，改以**可斷言的文字/數值**判斷（避免誤判）。
- **判斷準則**：每一項下方列「預期」與「實測」；兩者相符＝PASS，不符＝FAIL（需修復後重跑）。非等到自動載入完的項目，實測前可用 `await sleep(500ms)` 等非同步渲染。

**checklist（工具：`execute_js` 取 DOM；預期如下）**：

| #   | 頁面                          | 動作                                                                    | 預期（DOM 斷言）                                                                                                             |
| --- | ----------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | 首頁 `/`                      | 讀 `.tab` 文字清單                                                      | 含「未結／詢價／處理／完成／作廢／全部」                                                                                     |
| 2   | 統計頁 `/stats`               | 讀 `.month-row select` options                                          | 近 12 個月（如 `2026-08`…`2025-09`）                                                                                         |
| 2b  | 統計頁                        | 選另一月（`change` 事件）後讀 `.stat-card` 與 `.section-title`          | 「本月新增」數與「各類別金額（YYYY-MM」標題**同步**變為該月（Promise.all，無上下月不一致）；完成率分母＝期初未結案＋本月新增 |
| 3   | 詳情 `/ticket/2`              | 點 ⋮ → 讀 `.menu-item`                                                  | 含「編輯案件」（`can_edit` 由後端算，E1 方案B）                                                                              |
| 4   | 編輯 `/edit/2`                | 讀 `.form label` 清單、`.form input[type=file]`、`.form .photo-preview` | label 含「照片」；有 file input＋preview；`.photo-thumb` 數 ≥0（既有照片）                                                   |
| 4b  | 編輯 `/edit/2`                | 讀廠商 `.form select` options                                           | 含「— 清空指派 —」（值 `_clear`，E5）                                                                                        |
| 5   | 詳情 `/ticket/1`(open)        | 開留言框讀狀態 select options                                           | 僅「僅留言／標記已發包／標記完成並結案」，無退回                                                                             |
| 5b  | 詳情 `/ticket/2`(in_progress) | 開留言框讀狀態 select options                                           | 僅「僅留言／更新發包金額／標記完成並結案」，無退回                                                                           |
| 6   | 建單 `/new`                   | 讀 `.form input[type=file]`＋`.photo-preview`                           | 兩者存在（照片選擇器正常）                                                                                                   |

> 上述為人工/瀏覽器實測（非自動化），與 §8.7 的 CI 自動化互補；實測結果記錄於當次改版報告。

---

## 10. v1 明確不做 與 後續工件

**v1 不做**：關鍵字搜尋、LINE 推播通知、時間軸明細匯出、孤兒照片清理、留言通知、多社區（多 tenant）、`approved_by` 畫面（欄位保留）。

**Rate Limiting（v1.1.13 確認，於 Cloudflare Dashboard 設定，非改程式）**：公開端點建議加每 IP 速率限制，避免被濫用（UUID 已擋列舉，但無每 IP 上限）：

- `GET /api/share/:token`
- `GET /api/share/:token/photos/:id`
- `POST /api/auth/session`
- `GET /api/exports/tickets.csv`（簽名連結）

設定方式：Cloudflare Dashboard → 該 Pages 專案 → Security/Rate limiting rules。**本專案不寫 code 實作**（靠 CF 邊緣層），故屬維運作業，非程式施工項。

**下一批文件（已產出）**：

1. `docs/lib-spec.md` — `src/lib/` 共用層介面規格（`resolveUser`／`requireAuth`／`csrfGuard`／`respond`／`taipeiMonthRangeUtc()` 正確實作範本）——§3.2 已定案 auth 介面，本文件補齊其餘四模組與細節
2. `docs/test-cases.md` — 核心端點測試案例（`@cloudflare/vitest-pool-workers`），已含以下回歸斷言：
   - 未登入打 `/api/tickets` → `401`
   - **pending 打 `/api/auth/me` → `200`（含 display_name）**
   - **無 Cookie 帶有效 sig 打 `/api/exports/tickets.csv` → `200`**
   - 無 Cookie 且 sig 錯誤打 `/api/exports/tickets.csv` → `401`

---

## ⚠️ 開發時請以官方文件核對的點

- LINE ID Token 驗證端點與參數：`POST https://api.line.me/oauth2/v2.1/verify`（搜尋「LINE Login verify ID token」）
- LIFF SDK 最新版本與 `liff.getIDToken()` 用法
- LINE 官方帳號方案名稱與費率（§7 第 4 步，以後台當下公告為準）
- Pages Functions 的 D1/R2 binding 語法（`env.DB.prepare()`、`env.PHOTOS.put()`）
- `hono/cloudflare-pages` 的 `handle()` 與 `basePath` 行為（M1
