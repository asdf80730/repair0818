// tests/app.test.ts — app 組裝與 middleware 掛載順序（§1.3）
// 在真實 workerd runtime 跑（@cloudflare/vitest-pool-workers），D1 用 miniflare
// 0.5.41 新版：用 SELF（cloudflare:test）呼叫 main worker
import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'

const worker = SELF

// 攔截外部請求（ctx7 確認新版用 vi.spyOn(globalThis, 'fetch')）
afterEach(() => {
  vi.restoreAllMocks()
})

/** mock LINE ID token 驗證成功，回傳指定 payload */
function mockLineVerify(payload: Record<string, unknown>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (url.href.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw new Error('No mock found for ' + url.href)
  })
}

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

  it('POST /api/auth/session LINE 驗證成功 → 200 並建 pending user + Set-Cookie', async () => {
    mockLineVerify({
      iss: 'https://access.line.me',
      sub: 'U-mock-user-1',
      aud: 'test-channel', // 對應 vitest.config 的 LINE_CHANNEL_ID
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: '測試用戶',
    })
    const r = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: 'mock-id-token' }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.data.user_id).toBeTruthy()
    // 確認 Set-Cookie 有 session（HttpOnly）
    const setCookie = r.headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain('session=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('POST /api/auth/session LINE 驗證失敗（iss 不符）→ 401', async () => {
    mockLineVerify({
      iss: 'https://evil.example.com',
      sub: 'U-mock-user-2',
      aud: 'test-channel',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
    const r = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: 'mock-id-token' }),
    })
    expect(r.status).toBe(401)
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

  it('pending 打 /api/auth/me → 200（含 display_name）', async () => {
    // 先建立 pending user + 拿 session cookie
    mockLineVerify({
      iss: 'https://access.line.me',
      sub: 'U-pending-user',
      aud: 'test-channel',
      exp: Math.floor(Date.now() / 1000) + 3600,
      name: '等待開通用戶',
    })
    const session = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: 'mock-id-token' }),
    })
    expect(session.status).toBe(200)
    const cookie = session.headers.get('set-cookie')?.split(';')[0] ?? ''

    // 帶 cookie 打 /api/auth/me → 200 含 display_name
    const r = await worker.fetch('http://example.com/api/auth/me', {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.display_name).toBeTruthy()
  })

  it('無 Cookie 帶有效 sig 打 /api/exports/tickets.csv → 200', async () => {
    // 先 seed 一個 manager user（軌B 需要 manager/admin + active=1）
    await env.DB.prepare(
      "INSERT INTO users (line_user_id, display_name, role, active, created_at) VALUES ('U-csv-mgr', 'CSV管理', 'manager', 1, '2026-01-01T00:00:00.000Z')",
    ).run()
    const mgr = await env.DB.prepare("SELECT id FROM users WHERE line_user_id = 'U-csv-mgr'").first<{ id: number }>()
    if (!mgr) throw new Error('CSV manager seed 失敗')
    const uid = mgr.id

    // 用 JWT_SECRET 簽出有效 sig（對應 vitest.config 的 JWT_SECRET=test-secret）
    const secret = 'test-secret'
    const exp = Math.floor(Date.now() / 1000) + 300
    const msg = [uid, exp, '', '', ''].join('|')
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('export:v1|' + msg))
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const r = await worker.fetch(`http://example.com/api/exports/tickets.csv?uid=${uid}&exp=${exp}&sig=${sig}`)
    expect(r.status).toBe(200)
  })

  it('無 Cookie 且 sig 錯誤打 /api/exports/tickets.csv → 401', async () => {
    const r = await worker.fetch('http://example.com/api/exports/tickets.csv?uid=1&exp=9999999999&sig=wrong')
    expect(r.status).toBe(401)
  })
})
