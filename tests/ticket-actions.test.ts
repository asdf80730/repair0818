// tests/ticket-actions.test.ts — M4 案件動作測試（§4.3）
// 回報/留言/作廢/reopen/編輯留痕
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

async function createTicket(cookie: string): Promise<number> {
  const cat = await getOptionId('category')
  const loc = await getOptionId('location')
  const r = await worker.fetch('http://example.com/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    body: JSON.stringify({ category_id: cat, location_id: loc, description: '測試單' }),
  })
  const body = await r.json()
  return body.data.id
}

describe('M4 案件動作（§4.3）', () => {
  it('完整流程：回報 in_progress → 留言 → 回報 done → reopen', async () => {
    const mgr = await loginAs('U-m4-mgr', '管理公司', 'manager')
    const admin = await loginAs('U-m4-admin', '管理員', 'admin')
    const ticketId = await createTicket(mgr.cookie)

    // 回報 in_progress（v1.1.12：已發包需填金額）
    const r1 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'in_progress', note: '已派員處理', amount: 5000 }),
    })
    expect(r1.status).toBe(200)

    // 留言（三角色）
    const r2 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ note: '請加快處理' }),
    })
    expect(r2.status).toBe(201)

    // 回報 done（結案）
    const r3 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'done', note: '已完成' }),
    })
    expect(r3.status).toBe(200)

    // 結案後不可回報
    const r4 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(r4.status).toBe(400)

    // admin reopen
    const r5 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ status: 'in_progress', note: '重新檢查' }),
    })
    expect(r5.status).toBe(200)
    const reopenBody = await r5.json()
    expect(reopenBody.data.status).toBe('in_progress')

    // 詳情時間軸含 system + status 多筆
    const detail = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      headers: { Cookie: mgr.cookie },
    })
    const detailBody = await detail.json()
    expect(detailBody.data.updates.length).toBeGreaterThanOrEqual(4)
    const reopenUpdate = detailBody.data.updates.find((u: any) => u.note?.includes('重新開啟（原狀態：已完成）'))
    expect(reopenUpdate).toBeTruthy()
  })

  it('committee 不可回報（回報限 manager/admin）', async () => {
    const comm = await loginAs('U-m4-comm', '管委', 'committee')
    const ticketId = await createTicket(comm.cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: comm.cookie },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(r.status).toBe(403)
  })

  it('committee 可留言但不可指派廠商（編輯）', async () => {
    const comm = await loginAs('U-m4-comm2', '管委2', 'committee')
    const ticketId = await createTicket(comm.cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: comm.cookie },
      body: JSON.stringify({ vendor_id: 1 }),
    })
    expect(r.status).toBe(403)
  })

  // F3（v1.1.14 決策）：狀態流限制——鎖死退回、允許 open→done
  it('F3：open 案件可直結 done（跳過已發包）', async () => {
    const mgr = await loginAs('U-f3-open-done', '管理', 'manager')
    const ticketId = await createTicket(mgr.cookie) // status=open
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'done', note: '直接結案' }),
    })
    expect(r.status).toBe(200)
  })

  it('F3：in_progress 不可退回 open', async () => {
    const mgr = await loginAs('U-f3-back', '管理', 'manager')
    const ticketId = await createTicket(mgr.cookie)
    // 先發包
    const r1 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'in_progress', amount: 5000 }),
    })
    expect(r1.status).toBe(200)
    // 退回 open → 應 400
    const r2 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'open' }),
    })
    expect(r2.status).toBe(400)
  })

  it('F3：open→open 禁、in_progress→in_progress 允許（多次發包覆寫）', async () => {
    const mgr = await loginAs('U-f3-same', '管理', 'manager')
    const ticketId = await createTicket(mgr.cookie)
    // open→open 禁
    const r1 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'open' }),
    })
    expect(r1.status).toBe(400)
    // 發包後 in_progress→in_progress 允許（覆寫金額，v1.1.13 語意）
    await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'in_progress', amount: 5000 }),
    })
    const r2 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'in_progress', amount: 6000 }),
    })
    expect(r2.status).toBe(200)
  })

  // E3（v1.1.14）：void/reopen 競態——狀態已變更時不寫入假時間軸
  it('E3：雙 void——第二個回 400 且不新增時間軸', async () => {
    const mgr = await loginAs('U-e3-void', '管理', 'manager')
    const ticketId = await createTicket(mgr.cookie)
    // 第一次作廢成功
    const r1 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ note: '作廢' }),
    })
    expect(r1.status).toBe(200)
    // 第二次作廢（狀態已 void）→ 400，且不新增時間軸
    const r2 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ note: '再作廢' }),
    })
    expect(r2.status).toBe(400)
    const detail = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      headers: { Cookie: mgr.cookie },
    })
    const detailBody = await detail.json()
    const voidUpdates = detailBody.data.updates.filter((u: any) => u.kind === 'status' && u.status === 'void')
    expect(voidUpdates.length).toBe(1) // 只有第一次那筆
  })

  it('E3：雙 reopen——第二個回 400 且不新增時間軸', async () => {
    const admin = await loginAs('U-e3-reopen', '管理', 'admin')
    const ticketId = await createTicket(admin.cookie)
    // 結案
    await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ status: 'done', note: '完成' }),
    })
    // 第一次 reopen 成功
    const r1 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(r1.status).toBe(200)
    // 第二次 reopen（狀態已 in_progress）→ 400，且不新增時間軸
    const r2 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(r2.status).toBe(400)
    const detail = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      headers: { Cookie: admin.cookie },
    })
    const detailBody = await detail.json()
    const reopenUpdates = detailBody.data.updates.filter((u: any) => u.note?.includes('重新開啟'))
    expect(reopenUpdates.length).toBe(1) // 只有第一次那筆
  })
})
