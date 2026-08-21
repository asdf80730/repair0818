# src/lib/ 共用層介面規格

> 對應開發文件 §10「下一批文件」第 1 項。§3.2 已定案 auth 介面，本文件補齊其餘模組與細節，作為施工正確實作範本。
> 版本：v1.1.12 對應

## 總覽

`src/lib/` 是 Hono 應用的共用層，所有路由模組（`src/routes/`）與唯一入口（`functions/api/[[path]].ts`）都依賴它。模組間依賴方向單向：`env.ts`（型別）→ `respond.ts` / `time.ts` / `validate.ts`（純工具）→ `auth.ts` / `csrf.ts` / `db.ts`（依賴 env 與 respond）。

```
env.ts ──► respond.ts ──► auth.ts ──► (routes)
   │          │            │
   │          └──► csrf.ts │
   └──► time.ts            │
   └──► validate.ts        │
   └──► db.ts ─────────────┘
```

## 1. env.ts — 全域環境型別

定義 Hono 的 `Env`（Bindings + Variables）與共用型別。所有路由與 middleware 用 `AppContext = Context<Env>` 取得型別安全。

```ts
export type Role = 'pending' | 'committee' | 'manager' | 'admin'
export type User = { id: number; role: Role }

export type Env = {
  Bindings: {
    DB: D1Database
    PHOTOS: R2Bucket
    LINE_CHANNEL_ID: string
    JWT_SECRET: string
  }
  Variables: { user: User }   // requireAuth 設定
}
export type AppContext = Context<Env>
```

**規則**：`Variables.user` 只由 `requireAuth` 設定；路由內用 `c.get('user')` 讀取。

## 2. respond.ts — 統一回應信封（§4.0）

所有 API 回應統一走此模組，禁止在路由內手寫 `c.json({...})`。

```ts
ok<T>(c, data, status = 200)          // → { ok: true, data }
fail(c, status, code, message)        // → { ok: false, error: { code, message } }
```

**規則**：`status` 用 Hono 的 `ContentfulStatusCode` 型別（非 `number`），確保型別安全。所有路由一律用 `fail()` 回錯誤（無 `errors` 速記物件，避免死碼）。

## 3. time.ts — 時間工具（§2.2、§4.7）

```ts
nowIso(): string                       // new Date().toISOString()，寫入 side 一律用這個
taipeiMonthRangeUtc(): { startMs, endMs }  // 台灣當月邊界（UTC 毫秒），§4.7 統計用
taipeiDate(): string                   // 台灣時區 YYYY-MM-DD（CSV 檔名用）
toTaipeiDisplay(iso): string           // UTC ISO → 台灣 'YYYY-MM-DD HH:mm'（CSV 內容用）
```

**規則**：
- 寫入一律 `nowIso()`，禁止 `datetime('now')`
- 月份邊界只准用 `taipeiMonthRangeUtc()`（Asia/Taipei），禁止自行算時區
- 純 Web API（`Intl`），無 Node.js 專屬 API

## 4. validate.ts — zod schemas（§4.1）

schema 即 API 契約唯一真相來源。每個 mutation 端點用 `zValidator('json', schema)` 驗證，查詢用 `zValidator('query', schema)`。

```ts
createTicketSchema      // POST /api/tickets
updateTicketSchema      // PATCH /api/tickets/:id
createUpdateSchema      // POST /api/tickets/:id/updates
createCommentSchema     // POST /api/tickets/:id/comments
voidTicketSchema        // POST /api/tickets/:id/void
reopenTicketSchema      // POST /api/tickets/:id/reopen
createOptionSchema      // POST /api/options
updateOptionSchema      // PATCH /api/options/:id
createVendorSchema      // POST /api/vendors
updateVendorSchema      // PATCH /api/vendors/:id
updateUserSchema        // PATCH /api/users/:id
exportQuerySchema       // POST /api/exports/sign + GET /api/exports/tickets.csv 共用
listTicketsQuerySchema  // GET /api/tickets
```

**規則**：欄位規則嚴格對照 §4.1 規則表（長度、必填、枚舉、`photo_ids ≤ 5`）。

## 5. auth.ts — 認證（§3.2 定案介面）

拆為純函式＋middleware 兩層，讓需自驗的端點（如 CSV 下載）可重用驗證邏輯。

```ts
resolveUser(c): Promise<User | null>
  // 純函式：解析 Cookie、驗 JWT、查 D1，回傳 user 或 null（不拋錯、不寫回應）
  // 停用者（active=0）視同未登入 → 回 null
  // 需區分 DISABLED 訊息的端點在 middleware 層另查

requireAuth(opts?: { roles?, allowPending? }): MiddlewareHandler
  // middleware：內部呼叫 resolveUser，依 opts 判斷是否放行
  // 無 user → 401 UNAUTHORIZED（若 JWT 有效但 active=0 → 403 DISABLED）
  // pending 且 !allowPending → 403 PENDING
  // roles 不符（admin 除外）→ 403 FORBIDDEN
  // 通過 → c.set('user', user)

signSessionJWT(user, secret): Promise<string>   // 簽發 session JWT（payload 只放 sub）
setSessionCookie(c, jwt)                        // 設定 HttpOnly Cookie（§3.1）
clearSessionCookie(c)                            // 清除 Cookie（§3.5）
```

**規則**：
- JWT payload 只放 `{ sub: user_id }`，不放 role（每請求從 D1 讀 role/active，禁止只信 JWT）
- `auth/me`、`auth/logout` 用 `requireAuth({ allowPending: true })`
- DISABLED 區分：`resolveUser` 查到 active=0 時設 `disabledUser` 標記，維持回 null，middleware 層讀標記回 403 DISABLED（不再重查 D1）

## 6. csrf.ts — CSRF 防護（§3.3）

```ts
csrfGuard(): MiddlewareHandler
  // 所有 mutation（POST/PATCH/DELETE）驗 X-Requested-With: fetch，缺 → 403
  // Sec-Fetch-Site 有送且為 cross-site → 403；沒送 → 僅驗 X-Requested-With
  // mutation 只接受 application/json（multipart 照片上傳除外）
  // GET/HEAD 直接放行
```

**規則**：掛載於全域 `requireAuth()` 之上（見 §1.3 掛載順序）。

## 7. db.ts — 共用查詢

```ts
activeOptionLabel(c, type, id): Promise<string | null>   // active 的 option label
activeVendor(c, id): Promise<{id, name} | null>           // active 的 vendor
ticketNo(id): string                                      // '#' + id 補零 4 位
makeTitle(catLabel, locLabel, id): string                // {cat}－{loc} #{id}
validateOwnUnboundPhotos(c, photoIds, userId): Promise<boolean>  // §4.1 照片綁定驗證
optionAllowedInCategory(c, optionId, categoryId): Promise<boolean> // v1.1.7 建單驗證 location 屬 category 或通用
assertValidAssoc(c, optionId, categoryIds): Promise<{ok:true}|{ok:false,reason}> // v1.1.7 PATCH 關聯驗證
assertCategoryIds(c, categoryIds): Promise<{ok:true}|{ok:false,reason}> // v1.1.7 POST 關聯驗證
```

**規則**：SQL 一律 `prepare().bind()`，禁止字串拼接；禁止 `SELECT *`（逐欄列出）。

## 施工驗證

- `npx tsc --noEmit` 通過（無 `as any`）
- 測試用 `@cloudflare/vitest-pool-workers`（見 §10 第 2 項），在 glibc 環境跑 `npm test`
