// app 組裝 smoke test — 驗證 middleware 掛載順序與路由行為（§1.3）
// 用 Hono 的 app.request()，D1/R2 用 stub
import { describe, it, expect } from 'vitest'
import { app } from '../src/app'

// 假的 env（D1/R2 stub，避免真實連線）
const fakeEnv = {
  DB: {
    prepare: () => ({
      bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }),
    }),
  },
  PHOTOS: {},
  LINE_CHANNEL_ID: 'test',
  JWT_SECRET: 'test-secret',
}

const jsonHeaders = { 'Content-Type': 'application/json' }
const csrfHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }

describe('app 組裝與 middleware 掛載順序（§1.3）', () => {
  it('未登入 GET /api/tickets → 401（全域 requireAuth 擋下）', async () => {
    const r = await app.request('/api/tickets', {}, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('未登入 POST /api/tickets → 401', async () => {
    const r = await app.request('/api/tickets', { method: 'POST', headers: csrfHeaders, body: '{}' }, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('公開 GET /api/share/badtoken → 404（不需登入即可到達，token 無效）', async () => {
    const r = await app.request('/api/share/badtoken', {}, fakeEnv)
    expect(r.status).toBe(404)
  })

  it('無簽名 GET /api/exports/tickets.csv → 401（軌B 簽名錯誤）', async () => {
    const r = await app.request('/api/exports/tickets.csv', {}, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/auth/me → 401（無 JWT）', async () => {
    const r = await app.request('/api/auth/me', {}, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/stats/summary → 401', async () => {
    const r = await app.request('/api/stats/summary', {}, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/options → 401', async () => {
    const r = await app.request('/api/options?type=category', {}, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/vendors → 401', async () => {
    const r = await app.request('/api/vendors', {}, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('未登入 GET /api/users → 401', async () => {
    const r = await app.request('/api/users', {}, fakeEnv)
    expect(r.status).toBe(401)
  })

  it('無 CSRF header POST /api/auth/session → 403（csrfGuard 擋）', async () => {
    const r = await app.request('/api/auth/session', { method: 'POST', headers: jsonHeaders, body: '{}' }, fakeEnv)
    expect(r.status).toBe(403)
  })

  it('帶 CSRF header POST /api/auth/session → 501（進到 handler，M2 未實作）', async () => {
    const r = await app.request('/api/auth/session', { method: 'POST', headers: csrfHeaders, body: JSON.stringify({ id_token: 'x' }) }, fakeEnv)
    expect(r.status).toBe(501)
  })

  it('未登入 POST /api/exports/sign → 401（requireAuth roles 擋）', async () => {
    const r = await app.request('/api/exports/sign', { method: 'POST', headers: csrfHeaders, body: '{}' }, fakeEnv)
    expect(r.status).toBe(401)
  })
})
