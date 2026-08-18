// tests/app.test.ts — app 組裝與 middleware 掛載順序（§1.3）
// 在真實 workerd runtime 跑（@cloudflare/vitest-pool-workers），D1 用 miniflare
// 參考官方 fixture：pages-functions-unit-integration-self/test/integration-self.test.ts
import { exports } from 'cloudflare:workers'
import { describe, it, expect } from 'vitest'

// `exports.default` 指向目前 isolate 內跑的 Worker（main 選項指定）
const worker = exports.default

describe('app 組裝與 middleware 掛載順序（§1.3）', () => {
  it('未登入 GET /api/tickets → 401（全域 requireAuth 擋下）', async () => {
    const r = await worker.fetch('http://example.com/api/tickets')
    expect(r.status).toBe(401)
    const body = await r.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('未登入 POST /api/tickets → 401', async () => {
    const r = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: '{}',
    })
    expect(r.status).toBe(401)
  })

  it('公開 GET /api/share/badtoken → 404（不需登入即可到達，token 無效）', async () => {
    const r = await worker.fetch('http://example.com/api/share/badtoken')
    expect(r.status).toBe(404)
  })

  it('無簽名 GET /api/exports/tickets.csv → 401（軌B 簽名錯誤）', async () => {
    const r = await worker.fetch('http://example.com/api/exports/tickets.csv')
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/auth/me → 401（無 JWT）', async () => {
    const r = await worker.fetch('http://example.com/api/auth/me')
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/stats/summary → 401', async () => {
    const r = await worker.fetch('http://example.com/api/stats/summary')
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/options → 401', async () => {
    const r = await worker.fetch('http://example.com/api/options?type=category')
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/vendors → 401', async () => {
    const r = await worker.fetch('http://example.com/api/vendors')
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/users → 401', async () => {
    const r = await worker.fetch('http://example.com/api/users')
    expect(r.status).toBe(401)
  })

  it('無 CSRF header POST /api/auth/session → 403（csrfGuard 擋）', async () => {
    const r = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(r.status).toBe(403)
  })

  it('帶 CSRF header POST /api/auth/session → 501（進到 handler，M2 未實作）', async () => {
    const r = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: 'x' }),
    })
    expect(r.status).toBe(501)
  })

  it('未登入 POST /api/exports/sign → 401（requireAuth roles 擋）', async () => {
    const r = await worker.fetch('http://example.com/api/exports/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: '{}',
    })
    expect(r.status).toBe(401)
  })

  it('GET /api/hello → 200（M1 部署驗證端點）', async () => {
    const r = await worker.fetch('http://example.com/api/hello')
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
  })
})

// §10 要求的 4 個回歸斷言
describe('§10 回歸斷言', () => {
  it('未登入打 /api/tickets → 401', async () => {
    const r = await worker.fetch('http://example.com/api/tickets')
    expect(r.status).toBe(401)
  })

  // 以下 3 個依賴 M2/M5 實作（auth/session 目前 501、CSV 簽名需 JWT_SECRET），
  // 里程碑完成後移除 .skip 即可驗證
  it.skip('pending 打 /api/auth/me → 200（含 display_name）', async () => {
    // M2 後：建立 pending user → 簽 JWT → 帶 Cookie 打 /api/auth/me
    const r = await worker.fetch('http://example.com/api/auth/me')
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.display_name).toBeTruthy()
  })

  it.skip('無 Cookie 帶有效 sig 打 /api/exports/tickets.csv → 200', async () => {
    // M5 後：用 JWT_SECRET 簽出有效 sig → 帶 query 打 CSV 端點
    const r = await worker.fetch('http://example.com/api/exports/tickets.csv?uid=1&exp=9999999999&sig=valid')
    expect(r.status).toBe(200)
  })

  it.skip('無 Cookie 且 sig 錯誤打 /api/exports/tickets.csv → 401', async () => {
    const r = await worker.fetch('http://example.com/api/exports/tickets.csv?uid=1&exp=9999999999&sig=wrong')
    expect(r.status).toBe(401)
  })
})
