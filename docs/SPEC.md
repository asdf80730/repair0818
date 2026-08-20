

# 社區修繕管理系統 開發文件

**版本：v1.1.7（定稿，可施工）** ｜ 日期：2026-08-20

> 本文件為 v1.0 → v1.1 → v1.1.1 → v1.1.2 → v1.1.3 → v1.1.4 → v1.1.5 → v1.1.6 → v1.1.7 九版合併後的完整規格，單獨即可作為施工依據，無需回查舊版。

---

## 0. 版本歷程與決策紀錄

### 0.1 版本歷程

| 版本 | 內容 |
|---|---|
| v1.0 | 初版：技術棧、schema、API、畫面、部署、里程碑 |
| v1.1 | 外部評審修訂（20 項）：Cookie session 取代 Bearer、時間格式統一 ISO8601、label 快照、刪除 ticket_no、void/編輯留痕、業主決策 D1–D4 等 |
| v1.1.1 | 二次評審修訂（20 項）：後端改 Hono 單一入口、前端套件一律 vendored、month_done 改從時間軸事件計算、CSV 改簽名下載連結等 |
| v1.1.2 | 三次評審修訂：回歸修復（補回 share 照片端點、P0 畫面、users 防呆、compatibility_date）＋決策補登（D5–D7）＋安全加強（CSV domain separation、5 分鐘效期、CHECK 約束等） |
| v1.1.3 | 四次評審修訂：**修復 middleware 順序架構錯誤**（`/auth` 與 CSV 下載移到全域 requireAuth 之上、`lib/auth.ts` 拆 `resolveUser`/`requireAuth`）＋補回 §7 官方帳號三步＋快取標頭修正（share 照片改 private、內部照片補回）＋CHECK 約束涵蓋 note＋CSV 欄位精簡＋P1 tab 改名 |
| v1.1.4 | 五次實測修訂（16 項，前端為主）：非手機登入、建單改下拉式、指派廠商 UI、留言/回報合一、詳情可編輯、分享連結指向人類頁面 `share.html?token=`、作廢重新開啟改選單、廠商管理獨立 tab、成員權限中文化＋篩選、停用紅/啟用藍、縮圖 lightbox、統計加未結案總數/完成率。**share_url 格式統一改 `/share.html?token={token}`**（v1.1.4 起） |
| v1.1.5 | 六次實測修訂：**權限中文化改對照**（主管=admin > 保全/秘書=manager > 委員=committee，v1.1.4 寫反已修正）、**指派廠商收斂進編輯頁**（保全/秘書層級，不再塞列表/詳情頁）、移除獨立「新增回報」按鈕（回報統一走留言框含狀態更新，委員不可變狀態）、常用說明改下拉＋附加按鈕、修復重新產生分享連結（引用不存在變數會 throw）。**preview 環境決策：關閉 preview 自動部署**（`preview_deployment_setting: none`），單人開發直接 push main 走 production，避免產生無 D1/R2/secret 的壞部署 |
| v1.1.6 | 七次實測修訂：**詳情頁重構（方案 A）**——右上角 ⋮ 選單（分享連結/複製/編輯/作廢/重新開啟/重新產生）、分享連結收進選單、留言/回報改隱藏式（點「💬 留言／回報」才展開）、案件資訊卡緊湊、時間軸為主角。**照片壓縮加強**：`maxSizeMB` 10→0.5、最長邊 1600→1280、品質 0.7（2MB 照片約縮到 200KB）。**seed 單一來源**：seed 併入 `migrations/0002_seed.sql`，刪除根目錄 seed.sql 與 `db:seed:remote` |
| v1.1.7 | **類別關聯 + 留言框常用說明**（詳見 `docs/v1.1.7-變更需求報告.md`）：新增 `option_categories` 多對多 join 表（0003，只建表不 seed）——建單選類別後地點/說明只顯示「該類別關聯＋通用」；`GET /api/options` 三種模式（active／category_id 過濾／include_inactive 附 category_ids 限 manager/admin）；`category_ids` 三態（undefined 不動/[] 清空/有值全量覆寫）；建單驗證 location 屬於 category 或通用；詳情回應補 category_id/location_id；P7 修停用顯示 bug＋勾選矩陣；manager/admin 留言框加常用說明下拉＋附加 |

### 0.2 業主決策紀錄（已確認，2026-08-18）

| # | 決策 | 內容 |
|---|---|---|
| D1 | 開放管委會留言 | 三種角色均可在案件下新增「留言」：只記錄內容與時間，**不改變案件狀態**，可附照片 |
| D2 | 新增 reopen 功能 | **管理員專屬**：已結案或已作廢的案件可重新開啟，並在時間軸留下紀錄 |
| D3 | CSV 匯出 | 提供案件 CSV 匯出（備份與開會用），權限為管理公司（manager/admin） |
| D4 | 保留「常用說明」為資料庫管理選項 | 類別、地點、常用說明三種選項皆由管理公司在管理頁自行新增／停用。理由：業主明示需求；三種選項共用同一張 options 表與同一支 API，成本趨近於零；前端硬寫會讓「改一條說明就要重新部署」，違背管理公司自助維護目標 |
| D5 | 選項／廠商管理權限下放 | 類別／地點／常用說明選項、廠商的新增／修改／停用，由 v1.0 的「僅 admin」放寬為 **manager/admin**。D4 精神延伸：管理公司自助維護 |
| D6 | 統計頁恢復三角色可讀 | `GET /api/stats/summary` 三角色皆可；**CSV 匯出仍維持 manager/admin**（D3 不變）。業主確認「管委會看得到」 |
| D7 | 編輯權限恢復 v1.0 | `PATCH /api/tickets/:id`：committee 可編輯**自己建的單**；manager/admin 全部。結案／作廢後仍不可編輯 |

### 0.3 產品規則（不可自行更動）

1. 狀態流：`open → in_progress → done`；另有 `void`（作廢）；done/void 僅 admin 可 reopen
2. 回報（kind=status）限 manager/admin；留言（kind=comment）三角色皆可、不改狀態
3. 編輯、void、reopen 都必須寫入時間軸；reopen 訊息須帶入實際前狀態（已完成／已作廢）
4. 時間軸（ticket_updates）只能新增，不可修改刪除（開會存檔用）
5. 選項與廠商不刪除，只停用
6. 建單不需填標題：類別＋地點必填、說明選填，標題由系統產生
7. 公開派工頁不顯示廠商名稱、不顯示時間軸、不顯示內部人員
8. 結案（done）後不可再回報，但可留言（留言不會重開案件）；作廢（void）案件不可留言

---

## 1. 技術棧與專案結構

### 1.1 技術棧

| 層 | 選型 |
|---|---|
| 平台 | Cloudflare Pages + Pages Functions |
| 後端框架 | Hono（單一 catch-all 入口） |
| 資料庫 | Cloudflare D1（SQLite） |
| 檔案儲存 | Cloudflare R2 |
| 認證 | LINE LIFF（ID token）→ 自簽 JWT 放 HttpOnly Cookie |
| 前端 | 原生 HTML/JS（無框架、無建置），hash router |
| 驗證 | zod（schema 即 API 契約唯一真相來源） |
| JWT | jose（Web Crypto 原生） |
| 前端圖片壓縮 | browser-image-compression（vendored） |
| 測試 | @cloudflare/vitest-pool-workers（Workers 池跑測試，不用 Jest+mock） |

允許依賴：`hono`、`@hono/zod-validator`、`jose`、`zod`、`browser-image-compression`。
禁止：Node.js 專屬 API 或套件（jsonwebtoken、bcrypt、fs、multer、sharp、crypto.createHmac）。

### 1.2 目錄樹

```
repair-system/
├── public/                        # 前端靜態檔（純 JS，無建置、無 npm import）
│   ├── index.html                 # 主系統（SPA 入口，hash router）
│   ├── share.html                 # 派工單公開頁（免登入）
│   ├── app.js / share.js
│   ├── style.css
│   ├── vendor/
│   │   └── browser-image-compression.js   # vendored UMD build（檔頭註明版本與來源）
│   ├── _routes.json               # 只讓 /api/* 走 Functions
│   └── _headers                   # 靜態檔標頭（CSP、安全標頭）
├── functions/
│   └── api/
│       └── [[path]].ts            # 唯一入口
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
│   └── 0001_init.sql              # 見 §2
├── seed.sql                       # 見 §2.3
├── CLAUDE.md                      # 見 §6
└── wrangler.toml                  # 見 §8
```

**語言邊界（硬性）**：`functions/` 與 `src/` 使用 TypeScript（Wrangler 以 esbuild 自動編譯，零設定）；`public/` 一律純 JS，禁止 `import` npm 套件。

**前端套件規則（硬性）**：一律 vendored——從 npm 套件 dist 取 UMD build 放 `public/vendor/`，鎖定版本、檔頭註明版本號與來源，以 `<script src="/vendor/...">` 載入（browser-image-compression 掛 `window.imageCompression`）。禁止 CDN。

### 1.3 唯一入口與 app 組裝

```ts
// functions/api/[[path]].ts —— 整支檔案就這三行
import { handle } from 'hono/cloudflare-pages'
import { app } from '../../src/app'
export const onRequest = handle(app)
```

```ts
// src/app.ts（骨架）—— middleware 掛載順序即安全邊界，勿更動
type Env = {
  Bindings: { DB: D1Database; PHOTOS: R2Bucket; LINE_CHANNEL_ID: string; JWT_SECRET: string }
  Variables: { user: { id: number; role: 'pending'|'committee'|'manager'|'admin' } }
}

export const app = new Hono<Env>().basePath('/api')

app.route('/share', shareRoutes)              // 公開唯讀：無 auth、無 csrf
app.get('/exports/tickets.csv', csvDownload)  // 雙軌自驗：軌A Cookie / 軌B 簽名（見 §4.8）
app.use('/*', csrfGuard)                      // 所有 mutation 驗 CSRF（GET/HEAD 直接放行）
app.route('/auth', authRoutes)   // session 不需登入；me / logout 內部各自掛 requireAuth({ allowPending: true })
app.use('/*', requireAuth())     // ⚠ 以下全部需已開通；此行之上的路由必須自驗權限
app.route('/tickets', ticketRoutes)
app.route('/photos', photoRoutes)
app.route('/options', optionRoutes)
app.route('/vendors', vendorRoutes)
app.route('/users', userRoutes)
app.route('/stats', statsRoutes)
app.route('/exports', exportRoutes)  // 僅 POST /sign（走標準 Cookie＋CSRF 流程）
```

**掛載規則（硬性）**：

1. **凡是可能在無 Cookie 或 pending 狀態被呼叫的端點，一律註冊於全域 `requireAuth()` 之上，並在端點內自驗**（本版共兩支：`GET /share/*` 公開白名單、`GET /exports/tickets.csv` 雙軌）
2. 全域 `requireAuth()` 之上的路由**必須自己完成權限驗證**，不得依賴外層 middleware
3. 角色限制在路由模組內以 `requireAuth({ roles: ['manager','admin'] })` 逐群掛載

> 背景：v1.1.2 曾將 `/auth` 與 `/exports` 整組放在全域 `requireAuth()` 之下——Hono middleware 依註冊順序執行，外層一旦回 403/401，內層的 `allowPending` 或簽名驗證**永遠不會被執行**。本版重排修復。

---

## 2. 資料庫 Schema

### 2.1 migrations/0001_init.sql

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
  phone      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE options (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                        -- category / location / description
  label      TEXT NOT NULL,
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
  closed_by        INTEGER REFERENCES users(id)
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

CREATE INDEX idx_tickets_list    ON tickets(status, last_activity_at DESC);
CREATE INDEX idx_tickets_created ON tickets(created_at);
CREATE INDEX idx_updates_ticket  ON ticket_updates(ticket_id, created_at);
CREATE INDEX idx_photos_target   ON photos(target_type, target_id);
CREATE INDEX idx_options_type    ON options(type, active, sort_order);
```

### 2.2 時間格式統一規則（寫入 side）

一律 ISO8601 UTC。應用層用 `new Date().toISOString()`；SQL 層（seed、bootstrap）用 `strftime('%Y-%m-%dT%H:%M:%fZ','now')` 或固定字串。**禁止 `datetime('now')`**。

### 2.3 seed.sql

> **seed 單一來源（v1.1.6）**：seed 併入 `migrations/0002_seed.sql`（INSERT OR IGNORE）作為唯一來源。vitest 自動套用全部 migration；production 用 `wrangler d1 migrations apply`。根目錄 seed.sql 與 `db:seed:remote` script 已刪除。

```sql
INSERT OR IGNORE INTO options (type, label, sort_order, active, created_at) VALUES
  ('category', '電梯', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '門禁', 2, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '水泵', 3, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '照明', 4, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '消防', 5, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '漏水', 6, 1, '2026-01-01T00:00:00.000Z'),
  ('category', '其他', 99, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '停車場', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '大廳',   2, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '梯廳',   3, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '頂樓',   4, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '中庭',   5, 1, '2026-01-01T00:00:00.000Z'),
  ('location', '其他',  99, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '水泵浦異音',   1, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '照明故障',     2, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '門禁感應不良', 3, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '水管滲漏',     4, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '油漆剝落',     5, 1, '2026-01-01T00:00:00.000Z'),
  ('description', '其他',        99, 1, '2026-01-01T00:00:00.000Z');
```

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
   - `active=0` → `403 DISABLED`（「帳號已停用，請洽管理員」）
   - `role='pending'` → `403 PENDING`（僅 `/api/auth/*` 可用，且 me/logout 需 allowPending）
   - 角色不符 → `403 FORBIDDEN`
3. 停用／降權因此**立即生效**

**`lib/auth.ts` 介面（v1.1.3 定案）**——拆為純函式＋middleware 兩層，讓需自驗的端點（如 CSV 下載）可重用驗證邏輯：

```ts
// src/lib/auth.ts

/** 純函式：解析 Cookie、驗 JWT、查 D1，回傳 user 或 null（不拋錯、不寫回應） */
export async function resolveUser(c: Context<Env>): Promise<
  { id: number; role: 'pending'|'committee'|'manager'|'admin' } | null
> {
  // 1. 從 Cookie 取 session JWT；無 Cookie → null
  // 2. jose 驗簽＋效期 → 失敗回 null
  // 3. 從 D1 查 user：SELECT id, role, active FROM users WHERE id = ?
  // 4. 查無此人或 active = 0 → null（停用者視同未登入；
  //    需區分 DISABLED 訊息的端點在 middleware 層另查）
  // 5. 回 { id, role }
}

/** middleware：內部呼叫 resolveUser，依 opts 判斷是否放行 */
export function requireAuth(opts?: {
  roles?: Array<'committee'|'manager'|'admin'>;
  allowPending?: boolean;
}): MiddlewareHandler<Env> {
  return async (c, next) => {
    const user = await resolveUser(c);
    if (!user) {
      return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: '請重新登入' } }, 401);
    }
    if (user.role === 'pending' && !opts?.allowPending) {
      return c.json({ ok: false, error: { code: 'PENDING', message: '帳號等待開通中' } }, 403);
    }
    if (opts?.roles && !opts.roles.includes(user.role as 'committee'|'manager'|'admin')) {
      return c.json({ ok: false, error: { code: 'FORBIDDEN', message: '權限不足' } }, 403);
    }
    c.set('user', user);
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
4. 重送後仍 401 → 顯示「請重新從 LINE 圖文選單開啟本系統」，**不再重試**
5. `403 DISABLED` / `403 PENDING` 不觸發重登（避免停用帳號無限重登迴圈），直接顯示對應訊息

**非手機／外部瀏覽器登入（v1.1.4）**：不禁止非手機使用。`liff.init` 失敗時仍嘗試用既有 cookie 登入；若無 cookie 且 LIFF SDK 在，重試 init 後登入；完全無 LIFF 環境顯示提示＋重新整理按鈕。

### 3.5 登出

`POST /api/auth/logout` 清除 Cookie（Max-Age=0）。非必要功能，但保留端點。

### 3.6 權限矩陣

| 功能 | committee 委員 | manager 保全/秘書 | admin 主管 |
|---|:-:|:-:|:-:|
| 查看案件、建單、留言（D1）、上傳照片、複製分享連結 | ✓ | ✓ | ✓ |
| 編輯案件（D7） | **僅自己建的單** | ✓ 全部 | ✓ 全部 |
| 指派廠商（v1.1.5：僅編輯頁內，保全/秘書層級） | ✗ | ✓ | ✓ |
| 回報、結案、作廢、重新產生分享連結 | ✗ | ✓ | ✓ |
| **統計摘要（D6）** | **✓** | ✓ | ✓ |
| CSV 匯出（D3） | ✗ | ✓ | ✓ |
| 廠商／選項管理（D5） | ✗ | ✓ | ✓ |
| 成員審核、角色指派、停用、改名 | ✗ | ✗ | ✓ |
| reopen 重新開啟（D2） | ✗ | ✗ | ✓ |
| pending 或 active=0 | 所有 API 除 `/api/auth/*`（me/logout 需 allowPending）一律 `403 PENDING` / `403 DISABLED` | | |

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

| HTTP | code | 意義 |
|---|---|---|
| 400 | VALIDATION_ERROR | 欄位驗證失敗（依 §4.1 規則表） |
| 400 | ADMIN_LOCKED | 違反 users 防呆規則（不可停用自己／至少保留一位 admin） |
| 401 | UNAUTHORIZED | 未登入 / session 過期 / 簽名錯誤 |
| 401 | EXPORT_LINK_EXPIRED | 匯出下載連結已過期 |
| 403 | PENDING | 帳號待審核 |
| 403 | DISABLED | 帳號已停用 |
| 403 | FORBIDDEN | 角色權限不足（含 CSRF header 缺失） |
| 404 | NOT_FOUND | 資源不存在（含 share token 無效） |
| 500 | INTERNAL | 伺服器錯誤 |

### 4.1 欄位驗證規則表（所有 VALIDATION_ERROR 的判準）

| 欄位 | 規則 |
|---|---|
| category_id / location_id | 必填，且必須是 active 的 option |
| description（建單） | 選填，≤ 500 字 |
| note（回報） | 選填，≤ 500 字 |
| note（留言） | **必填**，1–500 字（資料庫 CHECK 為第二道防線） |
| vendor_id | **僅 PATCH 適用**：選填，必須是 active 的 vendor（建單不指派廠商） |
| photo_ids | 選填，≤ 5 張，**每張須滿足 `uploaded_by=本人` 且 `target_id IS NULL`**（後端強制） |
| status（回報） | 必填：open / in_progress / done |
| 廠商 name | 必填，1–50 字；phone 選填 ≤ 20 字 |
| 選項 label | 必填，1–30 字 |
| 成員 display_name | 必填，1–20 字 |

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
- item 欄位：`id, title, status, category_label, location_label, vendor_name, created_at, last_activity_at`
- **item 不含 `stale`**，由前端用 `last_activity_at` 計算
- v1 不做關鍵字搜尋（明示不做的範圍）

**GET `/api/tickets/:id`**（三角色）

- 案件本體＋`photos`（target_type='ticket' 的 url 陣列，格式 `/api/photos/{id}`）＋`updates` 時間軸
- `updates` 每筆：`{ id, kind, status, note, display_name, created_at, photo_urls }`（`status` 可為 NULL）
- 廠商已停用時 `vendor_name` 後綴「（已停用）」
- `share_url` 三角色皆回傳（僅查看／複製；重新產生限 manager/admin）。**格式 `/share.html?token={share_token}`**（指向人類可讀公開頁；v1.1.4 起，原先指向 JSON API `/api/share/{token}`）

**PATCH `/api/tickets/:id`**（**D7：committee 僅自己建的單；manager/admin 全部**）

- 可改：category_id、location_id、description、vendor_id
- **committee 即使編自己的單也不可改 vendor_id**（廠商指派權限仍限 manager/admin）
- 僅 open / in_progress 可編輯（已結案/作廢不可改）
- 改類別/地點時快照 label 同步更新
- 儲存後自動寫入時間軸：`kind='system'`、`status=NULL`、`note='已修改：類別 電梯→門禁；說明'`（before→after 摘要，無變動欄位不列出）

**POST `/api/tickets/:id/updates`**（manager/admin）

```json
請求：{ "status": "in_progress", "note": "選填", "photo_ids": [21] }
```

- ticket.status 同步更新；done 時設 `closed_at`／`closed_by`
- 更新 `last_activity_at`；照片綁定 `target_type='update'` + 該筆 update id
- 多步驟寫入用 `env.DB.batch()`
- 已結案（done）或作廢（void）的單 → 回 `VALIDATION_ERROR`

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
- 時間軸寫入 `kind='status'`、指定 status，note 模板帶入**實際前狀態**：
  `重新開啟（原狀態：已完成）：<備註>` 或 `重新開啟（原狀態：已作廢）：<備註>`，禁止寫死

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

| 端點 | 權限 | 說明 |
|---|---|---|
| GET `/api/options?type=category\|location\|description` | 三角色 | 只回 active |
| POST `/api/options` | manager/admin | `{ type, label, sort_order }`；若 `(type,label)` 已存在 → 該筆 `active=1` 並更新 `sort_order`，否則新增 |
| PATCH `/api/options/:id` | manager/admin | 改 label／sort_order／active（停用） |
| GET `/api/vendors` | manager/admin | 列表（含停用） |
| POST `/api/vendors` | manager/admin | 新增 |
| PATCH `/api/vendors/:id` | manager/admin | 修改／停用 |
| GET `/api/users` | admin | 列表（含 pending 與停用） |
| PATCH `/api/users/:id` | admin | 可改 `role`、`active`、`display_name`；**防呆規則見下** |

**PATCH `/api/users/:id` 防呆規則**：

| 規則 | 說明 |
|---|---|
| 不可停用自己 | `active` 由 1 改 0 且 `id == 自己` → 拒絕 |
| 不可對自己降權 | `role` 由 admin 改非 admin 且 `id == 自己` → 拒絕 |
| 至少保留一位 admin | 操作後 `active=1 AND role='admin'` 的人數須 ≥ 1，否則拒絕 |

違反上述任一規則 → `400 ADMIN_LOCKED`（message 說明原因如「不可停用自己」「系統至少需保留一位管理員」）。

### 4.7 統計

**GET `/api/stats/summary`**（**三角色皆可**，D6）

| 欄位 | 定義（寫死） |
|---|---|
| `open_count` / `in_progress_count` | 目前狀態即時數 |
| `month_new` | 當月 `created_at` 的案件數 |
| `month_done` | **台灣當月內，時間軸出現過 done 回報的不重複案件數**（見下方 SQL） |

- 月份邊界＝**台灣時區**當月 1 日 00:00 起，由 `taipeiMonthRangeUtc()` 換算 UTC 後帶入 SQL
- `month_done` 依據 append-only 的 `ticket_updates` 計算：reopen 不回溯改變歷史月份數字；同案件同月「結案→reopen→再結案」只計 1 件；作廢自然不算完成

```sql
SELECT COUNT(DISTINCT ticket_id) AS month_done
FROM ticket_updates
WHERE kind = 'status' AND status = 'done'
  AND created_at >= :month_start_utc
  AND created_at <  :month_end_utc
```

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
- 欄位（**11 欄**，v1.1.3 精簡：title 已含單號，砍「標題」欄）：
  `單號, 類別, 地點, 說明, 狀態, 廠商, 建立人, 建立時間, 最後活動, 結案時間, 回報次數`
  - 單號格式 `#0042`；時間格式 `YYYY-MM-DD HH:mm`（台灣時區）；回報次數＝該單 `kind='status'` 的筆數
- Query（皆選填）：`status`、`from`、`to`（台灣日期 YYYY-MM-DD，對 created_at 篩選）；無參數＝全部案件
- **CSV injection 防護**：以 `=`、`+`、`-`、`@`、`\t`、`\r` 開頭的儲存格前綴 `'`
- **Quoting 規則**：欄位含 `,`、`"`、`\n`、`\r` → 整欄以雙引號包住；欄位內 `"` → `""`
- Header：`Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="repair-tickets-20260818.csv"`（檔名用 ASCII＋匯出日期）、`Cache-Control: no-store`、`X-Robots-Tag: noindex`
- v1 只匯出案件主表；時間軸明細匯出列 v2

**前端流程**：

1. 按「匯出 CSV」（帶目前篩選）→ `POST /api/exports/sign`
2. 取得 url 組成絕對網址 → `liff.openWindow({ url, external: true })`
3. 匯出鈕旁固定提示：「將於外部瀏覽器開啟下載」
4. 已在外部瀏覽器且已登入時：可直接 `window.open`（走軌 A）

---

## 5. 前端畫面

### 5.0 全域規則

- `index.html` 為 SPA 入口，hash router 切換 P0–P7；`share.html` 為獨立免登入頁
- 所有 `<img>` 直接使用 API URL（Cookie 自動帶上）
- 使用者內容進 DOM 一律 `textContent`，禁止 `innerHTML`
- 401 一律走 §3.4 靜默重登；403 依 code 顯示對應訊息
- 前端 fetch wrapper 統一自動帶 `X-Requested-With: fetch`（見 §4.0）
- 照片壓縮：`browser-image-compression`（最長邊 1280px、目標 ≤500KB、初始品質 0.7、輸出 JPEG）；**解碼失敗時**顯示「此照片格式無法處理，請改用相機拍攝或先在相簿轉存」
- 觸控目標 ≥ 44px、內文字級 ≥ 16px（input 也 16px，避免 iOS 自動縮放）
- 狀態色：🔴待處理／🟡處理中／🟢已完成／⚫作廢

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

- 狀態篩選 tabs：**未結案（=active，預設）／待處理（open）／處理中（in_progress）／已完成（done）／已作廢（void）／全部（all）**——名稱與 status 值一一對應，避免「進行中／處理中」混淆；類別下拉篩選
- 卡片：標題、狀態徽章、廠商、最後活動時間
- **指派廠商只在編輯頁**（v1.1.5：列表卡片不塞指派下拉）
- stale 提示**前端計算**：`now − last_activity_at > 7×24h`（僅 open/in_progress 顯示），文案含實際天數：「⚠ 12 天未更新」
- 分頁：依 `has_more` 顯示「載入更多」

### 5.2 P2 建單

- **類別下拉、地點下拉**（v1.1.7 起用 `GET /api/options/catalog` 一次抓完所有選項＋關聯，本地過濾，換類別即時無延遲；v1.1.4 起由 chips 改下拉式）
- **常用說明下拉＋附加按鈕**（v1.1.5）：選取後按「＋ 附加」將文字附加至 textarea，已有內容時以「、」串接；同一說明不重複附加
- 說明 textarea（選填）、照片上傳（先壓縮 → POST /api/photos → 收 id）
- **無廠商欄位**（建單不指派廠商；廠商僅在 PATCH 由 manager/admin 指派）
- **無關聯類別**（v1.1.7）：選到地點/說明全空的類別時，alert 提示並重新讀取 catalog（**不重整頁面，保留已輸入資料**）
- 送出 → POST /api/tickets → 跳 P3

### 5.3 P3 案件詳情

- **右上角 ⋮ 選單**（v1.1.6）：利用返回右邊空間，點開下拉顯示 **分享連結（複製）／✏️ 編輯／🗑 作廢／↩️ 重新開啟／🔄 重新產生分享連結**。分享連結不再佔主版面。
- 案件資訊卡（緊湊：detail-head/detail-line）、照片牆、**時間軸為主角**。時間軸依 `kind` 三種樣式：狀態回報（徽章＋說明＋照片）／💬 留言（姓名＋內容＋照片，無徽章）／系統紀錄（灰色小字）
- **底部留言框改隱藏式**（v1.1.6）：頁面底部只有「💬 留言／回報」按鈕，點開才展開留言框＋可選狀態更新（manager/admin 可標記處理中/完成，委員僅留言）
- **⋮ 選單**：編輯（D7：committee 僅自己建的單；manager/admin 全部，open/in_progress）、作廢（manager/admin，二次確認含選填原因）、重新開啟（僅 admin 且 done/void → modal 選狀態＋備註）、重新產生分享連結（manager/admin，直接更新輸入框）
- 🟢 完成（P4 回報選 done）需二次確認彈窗
- **縮圖點開放大**（lightbox，v1.1.4）
- **指派廠商在編輯頁內**（v1.1.5：保全/秘書層級，不再塞列表/詳情頁）

### 5.4 P4 新增回報

- 狀態選擇（待處理／處理中／🟢 完成，預設選中目前狀態）、說明（選填）、照片
- 按 🟢 送出即結案，需二次確認彈窗：「標記為已完成並結案？」

### 5.5 P5 統計（**三角色皆可**，D6）

- 六個數字卡片（v1.1.4）：待處理、處理中、**未結案總數**、本月新增、本月完成、**本月完成率**（= 本月完成/本月新增）
- 「匯出 CSV」按鈕＋固定提示「將於外部瀏覽器開啟下載」（流程見 §4.8）——**僅 manager/admin 可見**（D3）

### 5.6 P6 成員管理（admin）

- **權限分級中文化**（v1.1.5 定案）：主管（admin）／保全秘書（manager）／委員（committee）／待開通（pending）
- **篩選**（v1.1.4）：全部成員／待開通／已開通／已停用
- 成員列表：改角色、停用／啟用（**停用紅、啟用藍**，v1.1.4）、改名
- **防呆提示**：停用自己或最後一位 admin 時，後端回 `ADMIN_LOCKED`，前端顯示對應訊息

### 5.7 P7 管理（manager/admin，D5）

- 選項管理 tab：**類別／地點／常用說明／廠商**（v1.1.4 起廠商獨立成 tab，不再每個類別都顯示在最底部）
- 選項：新增、改名、排序、停用（停用紅）
- 廠商：新增、修改、停用（停用紅／啟用藍）
- **類別關聯（v1.1.7 以類別為中心）**：類別 tab 每列顯示「📍N 地點 · 💬N 說明」關聯計數＋「設定關聯」按鈕；點開 modal 才載入該類別的地點/說明（checkbox 勾選），儲存走 `POST /api/options/:id/assoc` 全量覆寫。**不在列表逐項載入，避免 N+1**。

### 5.8 share.html（公開）

- 進入方式：**`/share.html?token={share_token}`**（v1.1.4 起；share.js 從 query 取 token，相容從 pathname 取）
- 顯示白名單欄位＋照片（照片 url 指向 `/api/share/{token}/photos/{id}`）
- 顯示「狀態更新於 {last_activity_at 換算台灣時間}」（此為 share 回傳 last_activity_at 的用途）
- token 無效顯示「連結已失效，請向管理公司索取新連結」
- 內建 print CSS：管理公司可用瀏覽器「列印→儲存為 PDF」
- 安全標頭由 `public/_headers` 設定（見 §8.2）

---

## 6. CLAUDE.md（放 repo 根目錄，AI 施工必讀）

````markdown
# 社區修繕管理系統 — 施工規則

## 技術棧與結構
- 後端：Cloudflare Pages Functions + Hono。唯一入口 functions/api/[[path]].ts
  （export const onRequest = handle(app)）；路由在 src/routes/，共用層在 src/lib/。
- 語言分界：functions/、src/ 用 TypeScript；public/ 一律純 JS，禁止 import npm 套件。
- 前端第三方套件一律 vendored 至 public/vendor/ 以 <script src> 載入，禁止 CDN。
- 允許依賴：hono, @hono/zod-validator, jose, zod, browser-image-compression。
- 禁止：Node.js 專屬 API 或套件（jsonwebtoken, bcrypt, fs, multer, sharp, crypto.createHmac）。

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
- 編輯權限：committee 僅自己建的單；manager/admin 全部（D7）。
- 統計頁三角色皆可（D6）；CSV 匯出限 manager/admin（D3）。
- committee 看得到 vendor_name 但 GET /api/vendors 限 manager/admin——刻意設計，勿「順手修掉」。
````

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
{ "version": 1, "include": ["/api/*"], "exclude": [] }
```

**`public/_headers`**（Pages 靜態檔標頭的唯一設定管道，Functions 碰不到 share.html）：

```
/share.html
  Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
```

> `X-Frame-Options`／`frame-ancestors`：LIFF 是 WebView 而非 iframe，理論上可設 `DENY`/`'none'`，但**實測確認不影響 LINE 開啟後再鎖**（避免誤擋）。故首版 `_headers` 先不加，列入施工驗證項。

### 8.3 migrations

```bash
npx wrangler d1 migrations create repair-db init   # 產生檔案後貼入 §2.1 SQL
npx wrangler d1 migrations apply repair-db --local      # 開發
npx wrangler d1 migrations apply repair-db --remote     # 正式
npx wrangler d1 execute repair-db --remote --file=seed.sql
```

### 8.4 secrets

- `JWT_SECRET` 只用 `wrangler pages secret put JWT_SECRET` 設定，不進版控
- 本機開發用 `.dev.vars`，並將 `.dev.vars` 加入 `.gitignore`

### 8.5 D1 備份

誤刪還原：

```bash
npx wrangler d1 time-travel repair-db --timestamp <unix_timestamp>
```

建議每日記錄一次關鍵時間點的 timestamp，或操作前先記錄當下時間。

### 8.6 孤兒照片政策

v1 不處理（R2 免費額度足夠）；v2 若要清理，須另開**獨立 Worker** 設定 cron trigger（Pages Functions 不支援 cron）。

---

## 9. 里程碑

| # | 範圍 | 驗收 |
|---|---|---|
| **M0** | **LINE 後台開通**（§7 全部 8 步）：Login Channel、正式 LIFF app（**preview LIFF 已取消，v1.1.5**）、開官方帳號、OA 與 Channel 連動、圖文選單連結。**另：準備 2–3 個測試 LINE 帳號（可用家人／同事）** | 拿到 Channel ID＋LIFF ID；測試帳號已加入 OA 好友 |
| M1 | 專案骨架：repo、wrangler、Hono 入口、D1/R2 binding、部署打通 | `GET /api/hello` 在正式網域回 200，**且 `GET /api/tickets`（未實作）回 404 而非 200**（順手驗證 basePath 無重複） |
| M2 | 認證＋成員審核（依賴 M0 的 Channel ID 與測試帳號） | 三支角色帳號各自看到正確權限畫面；**pending 使用者打 `/api/auth/me` 回 200 且取得 display_name**，前端正確顯示 P0 |
| M3 | 案件核心：options、建單（P2）、列表（P1）、詳情（P3）、照片上傳/讀取 | 建一單附 2 照片，三角色可見 |
| M4 | 回報（P4）、留言、void、reopen、時間軸三 kind、編輯留痕 | 走完 open→in_progress→done→reopen→done，時間軸完整 |
| M5 | 廠商/選項管理（P7）、統計（P5）、CSV 匯出 | **無 Cookie 的外部瀏覽器帶簽名連結成功下載 CSV**（軌 B），Excel 開啟無亂碼；已登入的外部瀏覽器直接下載（軌 A）；管委會可看統計但無匯出鈕 |
| M6 | share 公開頁、token 重發、收尾驗收 | 無痕視窗開 share 連結僅見白名單內容，**照片可正常顯示**；token 重發後舊連結 404 |

---

## 10. v1 明確不做 與 後續工件

**v1 不做**：關鍵字搜尋、LINE 推播通知、時間軸明細匯出、孤兒照片清理、留言通知、多社區（多 tenant）、`approved_by` 畫面（欄位保留）。

**v1.1 選配**：Cloudflare Rate Limiting rule（Dashboard 設定，標的含 share 公開端點與 `/api/auth/session`）。

**下一批文件（開工前產出）**：
1. `src/lib/` 共用層介面規格（`resolveUser`／`requireAuth`／`csrfGuard`／`respond`／`taipeiMonthRangeUtc()` 正確實作範本）——§3.2 已定案 auth 介面，本工件補齊其餘四模組與細節
2. 核心端點測試案例（輸入 JSON → 期望輸出，3–5 支端點，用 `@cloudflare/vitest-pool-workers`），**必含以下回歸斷言**：
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