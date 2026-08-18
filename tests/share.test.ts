// tests/share.test.ts — M6 share 公開頁 + token 重發測試（§4.3/§4.5）
import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'

const worker = SELF

afterEach(() => vi.restoreAllMocks())

function mockLineVerify(sub: string, name: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (url.href.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
      return new Response(JSON.stringify({
        iss: 'https://access.line.me', sub, aud: 'test-channel',
        exp: Math.floor(Date.now() / 1000) + 3600, name,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('No mock found for ' + url.href)
  })
}

async function loginAs(sub: string, name: string, role: 'committee' | 'manager' | 'admin') {
  mockLineVerify(sub, name)
  const session = await worker.fetch('http://example.com/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ id_token: 'mock' }),
  })
  const body = await session.json()
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, body.data.user_id).run()
  return { userId: body.data.user_id, cookie: session.headers.get('set-cookie')?.split(';')[0] ?? '' }
}

async function getOptionId(type: 'category' | 'location'): Promise<number> {
  const row = await env.DB.prepare('SELECT id FROM options WHERE type = ? AND active = 1 ORDER BY id LIMIT 1').bind(type).first<{ id: number }>()
  if (!row) throw new Error('找不到選項')
  return row.id
}

async function createTicket(cookie: string): Promise<{ id: number; share_token: string }> {
  const cat = await getOptionId('category')
  const loc = await getOptionId('location')
  const r = await worker.fetch('http://example.com/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    body: JSON.stringify({ category_id: cat, location_id: loc, description: '分享測試' }),
  })
  const body = await r.json()
  return { id: body.data.id, share_token: body.data.share_token }
}

describe('M6 share 公開頁 + token 重發（§4.3/§4.5）', () => {
  it('share 公開端點回白名單欄位（免登入）', async () => {
    const mgr = await loginAs('U-m6-mgr', '管理', 'manager')
    const { share_token } = await createTicket(mgr.cookie)

    // 免登入打 share
    const r = await worker.fetch(`http://example.com/api/share/${share_token}`)
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.title).toContain('電梯')
    expect(body.data.status).toBe('open')
    expect(body.data.description).toBe('分享測試')
    // 白名單：不該有 vendor_name / updates / 內部資料
    expect(body.data.vendor_name).toBeUndefined()
    expect(body.data.updates).toBeUndefined()
  })

  it('share token 無效 → 404', async () => {
    const r = await worker.fetch('http://example.com/api/share/badtoken')
    expect(r.status).toBe(404)
  })

  it('manager 重發 share-token → 舊連結失效', async () => {
    const mgr = await loginAs('U-m6-mgr2', '管理2', 'manager')
    const { id, share_token: oldToken } = await createTicket(mgr.cookie)

    // 重發
    const r = await worker.fetch(`http://example.com/api/tickets/${id}/share-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.share_url).toContain('/api/share/')
    const newToken = body.data.share_url.split('/').pop()

    // 舊 token 失效 → 404
    const old = await worker.fetch(`http://example.com/api/share/${oldToken}`)
    expect(old.status).toBe(404)

    // 新 token 有效 → 200
    const fresh = await worker.fetch(`http://example.com/api/share/${newToken}`)
    expect(fresh.status).toBe(200)
  })

  it('committee 不可重發 share-token（限 manager/admin）', async () => {
    const comm = await loginAs('U-m6-comm', '管委', 'committee')
    const { id } = await createTicket(comm.cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${id}/share-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: comm.cookie },
    })
    expect(r.status).toBe(403)
  })
})
