// tests/messageTemplates.test.ts — F6 訊息模板 CRUD 測試（v1.1.15）
//
// 沿用既有 options 字典表（type='message_template'）
// GET 三角色可讀，PUT 限 manager/admin
// 不做新增、不做刪除、不做啟用切換（F7 業主決策）

import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'

const worker = SELF

afterEach(() => vi.restoreAllMocks())

function mockLineVerify(sub: string, name: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
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

describe('F6 GET /api/message-templates 行為鎖定（v1.1.15）', () => {
  async function ensureCat(label: string): Promise<number> {
    const exist = await env.DB.prepare(
      "SELECT id FROM options WHERE type='category' AND label=? AND active=1",
    ).bind(label).first<{ id: number }>()
    if (exist) return exist.id
    const r = await env.DB.prepare(
      "INSERT INTO options (type, label, sort_order, active, created_at) VALUES ('category', ?, 999, 1, ?)",
    ).bind(label, new Date().toISOString()).run()
    return Number(r.meta.last_row_id)
  }

  it('category_id 缺 → 400', async () => {
    const { cookie } = await loginAs('U-f6-nocat', '管', 'admin')
    const r = await worker.fetch('http://example.com/api/message-templates', {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(400)
  })

  it('label 不在白名單（report/empty）→ 400', async () => {
    const { cookie } = await loginAs('U-f6-badlabel', '管', 'admin')
    const cat = await ensureCat('F6-test-badlabel')
    const r = await worker.fetch(`http://example.com/api/message-templates?category_id=${cat}&label=foo`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(400)
  })

  it('三角色皆可讀', async () => {
    const cat = await ensureCat('F6-test-roles')
    for (const role of ['committee', 'manager', 'admin'] as const) {
      const u = await loginAs(`U-f6-roles-${role}`, role, role)
      const r = await worker.fetch(`http://example.com/api/message-templates?category_id=${cat}&label=report`, {
        headers: { Cookie: u.cookie },
      })
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body.data).toHaveProperty('templates')
    }
  })

  it('label 預設為 report', async () => {
    const { cookie } = await loginAs('U-f6-default', '管', 'admin')
    const cat = await ensureCat('F6-test-default')
    const r = await worker.fetch(`http://example.com/api/message-templates?category_id=${cat}`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.label).toBe('report')
  })
})

describe('F6 GET /api/message-templates/:id 行為鎖定（v1.1.15）', () => {
  it('無效 id → 400', async () => {
    const { cookie } = await loginAs('U-f6-idbad', '管', 'admin')
    const r = await worker.fetch('http://example.com/api/message-templates/foo', {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(400)
  })

  it('不存在 id → 404', async () => {
    const { cookie } = await loginAs('U-f6-id404', '管', 'admin')
    const r = await worker.fetch('http://example.com/api/message-templates/99999', {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(404)
  })

  it('存在 → 回 200 + 完整欄位', async () => {
    const { cookie } = await loginAs('U-f6-idok', '管', 'admin')
    const exist = await env.DB.prepare(
      "SELECT id FROM options WHERE type='message_template' AND active=1 LIMIT 1",
    ).first<{ id: number }>()
    if (!exist) {
      // 若 migration 0010 沒跑，這條 case 跳過
      return
    }
    const r = await worker.fetch(`http://example.com/api/message-templates/${exist.id}`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data).toHaveProperty('body')
    expect(typeof body.data.body).toBe('string')
  })
})

describe('F6 PUT /api/message-templates/:id 行為鎖定（v1.1.15）', () => {
  it('committee 不可寫 → 403', async () => {
    const cmt = await loginAs('U-f6-put-cmt', '委', 'committee')
    const exist = await env.DB.prepare(
      "SELECT id FROM options WHERE type='message_template' AND active=1 LIMIT 1",
    ).first<{ id: number }>()
    if (!exist) return
    const r = await worker.fetch(`http://example.com/api/message-templates/${exist.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cmt.cookie },
      body: JSON.stringify({ body: 'x' }),
    })
    expect(r.status).toBe(403)
  })

  it('manager 可寫 body → 200，回新內容', async () => {
    const mgr = await loginAs('U-f6-put-mgr', '管', 'manager')
    const exist = await env.DB.prepare(
      "SELECT id FROM options WHERE type='message_template' AND active=1 LIMIT 1",
    ).first<{ id: number }>()
    if (!exist) return
    const newBody = `測試 body ${Date.now()}`
    const r = await worker.fetch(`http://example.com/api/message-templates/${exist.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ body: newBody }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.body).toBe(newBody)
    expect(body.data.updated_at).toBeTruthy()
  })

  it('空 body + 空 label → 400 VALIDATION_ERROR', async () => {
    const mgr = await loginAs('U-f6-put-empty', '管', 'manager')
    const exist = await env.DB.prepare(
      "SELECT id FROM options WHERE type='message_template' AND active=1 LIMIT 1",
    ).first<{ id: number }>()
    if (!exist) return
    const r = await worker.fetch(`http://example.com/api/message-templates/${exist.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({}),
    })
    expect(r.status).toBe(400)
  })

  it('不存在 id → 404', async () => {
    const mgr = await loginAs('U-f6-put-404', '管', 'manager')
    const r = await worker.fetch('http://example.com/api/message-templates/99999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ body: 'x' }),
    })
    expect(r.status).toBe(404)
  })
})
