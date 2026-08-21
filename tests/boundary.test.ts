// tests/boundary.test.ts — 邊界與例外測試（§4.1 欄位規則表、§3.2 權限邊界、D7）
// 依 F.I.R.S.T：涵蓋邊界與例外，這些才是 bug 的溫床
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

/** 建立 session，回傳 cookie；role 可為 pending（不 UPDATE） */
async function loginAs(sub: string, name: string, role?: 'committee' | 'manager' | 'admin') {
  mockLineVerify(sub, name)
  const session = await worker.fetch('http://example.com/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ id_token: 'mock' }),
  })
  const body = await session.json()
  const userId = body.data.user_id
  if (role) {
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, userId).run()
  }
  return { userId, cookie: session.headers.get('set-cookie')?.split(';')[0] ?? '' }
}

async function getOptionId(type: 'category' | 'location'): Promise<number> {
  const row = await env.DB.prepare('SELECT id FROM options WHERE type = ? AND active = 1 ORDER BY id LIMIT 1').bind(type).first<{ id: number }>()
  if (!row) throw new Error('找不到選項')
  return row.id
}

async function createTicket(cookie: string, description = '邊界測試單'): Promise<number> {
  const cat = await getOptionId('category')
  const loc = await getOptionId('location')
  const r = await worker.fetch('http://example.com/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    body: JSON.stringify({ category_id: cat, location_id: loc, description }),
  })
  const body = await r.json()
  return body.data.id
}

describe('權限邊界（§3.2）', () => {
  it('pending 打 /api/tickets → 403 PENDING', async () => {
    const { cookie } = await loginAs('U-bd-p1', '待開通1') // 不 UPDATE role，保持 pending
    const r = await worker.fetch('http://example.com/api/tickets', { headers: { Cookie: cookie } })
    expect(r.status).toBe(403)
    const body = await r.json()
    expect(body.error.code).toBe('PENDING')
  })

  it('停用使用者打 /api/tickets → 403 DISABLED', async () => {
    const { userId, cookie } = await loginAs('U-bd-d1', '停用1', 'committee')
    await env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(userId).run()
    const r = await worker.fetch('http://example.com/api/tickets', { headers: { Cookie: cookie } })
    expect(r.status).toBe(403)
    const body = await r.json()
    expect(body.error.code).toBe('DISABLED')
  })

  it('停用使用者打 /api/auth/me → 403 DISABLED（allowPending 也擋）', async () => {
    const { userId, cookie } = await loginAs('U-bd-d2', '停用2', 'committee')
    await env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(userId).run()
    const r = await worker.fetch('http://example.com/api/auth/me', { headers: { Cookie: cookie } })
    expect(r.status).toBe(403)
    const body = await r.json()
    expect(body.error.code).toBe('DISABLED')
  })
})

describe('zod 欄位驗證邊界（§4.1）', () => {
  it('description 超過 500 字 → 400', async () => {
    const { cookie } = await loginAs('U-bd-v1', '驗證1', 'committee')
    const cat = await getOptionId('category')
    const loc = await getOptionId('location')
    const r = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: cat, location_id: loc, description: 'x'.repeat(501) }),
    })
    expect(r.status).toBe(400)
  })

  it('photo_ids 超過 5 張 → 400', async () => {
    const { cookie } = await loginAs('U-bd-v2', '驗證2', 'committee')
    const cat = await getOptionId('category')
    const loc = await getOptionId('location')
    const r = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: cat, location_id: loc, photo_ids: [1, 2, 3, 4, 5, 6] }),
    })
    expect(r.status).toBe(400)
  })

  it('留言 note 空字串 → 400（必填）', async () => {
    const { cookie } = await loginAs('U-bd-v3', '驗證3', 'committee')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ note: '' }),
    })
    expect(r.status).toBe(400)
  })

  it('回報 status 非法值 → 400', async () => {
    const { cookie } = await loginAs('U-bd-v4', '驗證4', 'manager')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'draft' }),
    })
    expect(r.status).toBe(400)
  })

  it('PATCH 指派無效 vendor_id → 400', async () => {
    const { cookie } = await loginAs('U-bd-v5', '驗證5', 'manager')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ vendor_id: 999 }),
    })
    expect(r.status).toBe(400)
  })

  it('列表 limit 超過 50 → 400', async () => {
    const { cookie } = await loginAs('U-bd-v6', '驗證6', 'committee')
    const r = await worker.fetch('http://example.com/api/tickets?limit=51', { headers: { Cookie: cookie } })
    expect(r.status).toBe(400)
  })
})

describe('D7 編輯權限（§4.3）', () => {
  it('committee 改別人建的單 → 403', async () => {
    const owner = await loginAs('U-bd-d7a', '建單者', 'committee')
    const other = await loginAs('U-bd-d7b', '他人', 'committee')
    const ticketId = await createTicket(owner.cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: other.cookie },
      body: JSON.stringify({ description: '想改' }),
    })
    expect(r.status).toBe(403)
  })

  it('committee 改自己建的單 → 200', async () => {
    const { cookie } = await loginAs('U-bd-d7c', '自己', 'committee')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ description: '改自己的' }),
    })
    expect(r.status).toBe(200)
  })

  it('已結案案件不可編輯 → 400', async () => {
    const { cookie } = await loginAs('U-bd-d7d', '結案', 'manager')
    const ticketId = await createTicket(cookie)
    await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'done', note: '完成' }),
    })
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ description: '想改' }),
    })
    expect(r.status).toBe(400)
  })
})

describe('reopen / comments 邊界（§4.3）', () => {
  it('reopen 非 done/void 的案件 → 400', async () => {
    const { cookie } = await loginAs('U-bd-r1', '重開1', 'admin')
    const ticketId = await createTicket(cookie) // status=open
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(r.status).toBe(400)
  })

  it('committee 不可 reopen（限 admin）→ 403', async () => {
    const { cookie } = await loginAs('U-bd-r2', '重開2', 'committee')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'in_progress' }),
    })
    expect(r.status).toBe(403)
  })

  it('void 案件不可留言 → 400', async () => {
    const { cookie } = await loginAs('U-bd-r3', '留言3', 'manager')
    const ticketId = await createTicket(cookie)
    await worker.fetch(`http://example.com/api/tickets/${ticketId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ note: '作廢' }),
    })
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ note: '想留言' }),
    })
    expect(r.status).toBe(400)
  })
})

describe('列表分頁邊界（§4.3）', () => {
  it('has_more：超過 limit 筆才 true', async () => {
    const { cookie } = await loginAs('U-bd-pg1', '分頁1', 'committee')
    // 建 3 張單，limit=2 → has_more=true
    for (let i = 0; i < 3; i++) await createTicket(cookie, `分頁單${i}`)
    const r = await worker.fetch('http://example.com/api/tickets?limit=2', { headers: { Cookie: cookie } })
    const body = await r.json()
    expect(body.data.items.length).toBe(2)
    expect(body.data.has_more).toBe(true)
  })

  it('has_more：剛好 limit 筆 → false', async () => {
    const { cookie } = await loginAs('U-bd-pg2', '分頁2', 'committee')
    for (let i = 0; i < 2; i++) await createTicket(cookie, `分頁單${i}`)
    const r = await worker.fetch('http://example.com/api/tickets?limit=2', { headers: { Cookie: cookie } })
    const body = await r.json()
    expect(body.data.items.length).toBe(2)
    expect(body.data.has_more).toBe(false)
  })
})

describe('photos 其他邊界（§4.4）', () => {
  it('缺 file 欄位 → 400', async () => {
    const { cookie } = await loginAs('U-bd-ph1', '照片邊1', 'committee')
    const form = new FormData()
    form.append('other', 'not-a-file') // 讓請求是 multipart，但缺 file 欄位
    const r = await worker.fetch('http://example.com/api/photos', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Requested-With': 'fetch' },
      body: form,
    })
    expect(r.status).toBe(400)
  })

  it('GET 無效照片 id（0）→ 400', async () => {
    const { cookie } = await loginAs('U-bd-ph2', '照片邊2', 'committee')
    const r = await worker.fetch('http://example.com/api/photos/0', { headers: { Cookie: cookie } })
    expect(r.status).toBe(400)
  })

  it('GET 不存在的照片 id → 404', async () => {
    const { cookie } = await loginAs('U-bd-ph3', '照片邊3', 'committee')
    const r = await worker.fetch('http://example.com/api/photos/99999', { headers: { Cookie: cookie } })
    expect(r.status).toBe(404)
  })
})

describe('auth/session 邊界（§3.1）', () => {
  it('aud 不符 → 401', async () => {
    mockLineVerify('U-bd-a1', 'aud錯')
    // 覆寫 mock 回傳錯誤 aud
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.href.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
        return new Response(JSON.stringify({
          iss: 'https://access.line.me', sub: 'U-bd-a1', aud: 'wrong-channel',
          exp: Math.floor(Date.now() / 1000) + 3600, name: 'aud錯',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error('No mock found for ' + url.href)
    })
    const r = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: 'mock' }),
    })
    expect(r.status).toBe(401)
  })

  it('exp 過期 → 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.href.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
        return new Response(JSON.stringify({
          iss: 'https://access.line.me', sub: 'U-bd-a2', aud: 'test-channel',
          exp: Math.floor(Date.now() / 1000) - 3600, name: '過期',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error('No mock found for ' + url.href)
    })
    const r = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: 'mock' }),
    })
    expect(r.status).toBe(401)
  })

  it('name 缺省 → display_name 回「LINE 用戶」', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.href.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
        return new Response(JSON.stringify({
          iss: 'https://access.line.me', sub: 'U-bd-a3', aud: 'test-channel',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error('No mock found for ' + url.href)
    })
    const session = await worker.fetch('http://example.com/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: 'mock' }),
    })
    expect(session.status).toBe(200)
    const cookie = session.headers.get('set-cookie')?.split(';')[0] ?? ''
    const me = await worker.fetch('http://example.com/api/auth/me', { headers: { Cookie: cookie } })
    const meBody = await me.json()
    expect(meBody.data.display_name).toBe('LINE 用戶')
  })
})

describe('資源不存在（§4.6）', () => {
  it('PATCH 不存在的 user → 404', async () => {
    const { cookie } = await loginAs('U-bd-nf1', '不存在1', 'admin')
    const r = await worker.fetch('http://example.com/api/users/99999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ role: 'manager' }),
    })
    expect(r.status).toBe(404)
  })

  it('PATCH 不存在的 option → 404', async () => {
    const { cookie } = await loginAs('U-bd-nf2', '不存在2', 'manager')
    const r = await worker.fetch('http://example.com/api/options/99999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ label: 'X' }),
    })
    expect(r.status).toBe(404)
  })

  it('PATCH 不存在的 vendor → 404', async () => {
    const { cookie } = await loginAs('U-bd-nf3', '不存在3', 'manager')
    const r = await worker.fetch('http://example.com/api/vendors/99999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(r.status).toBe(404)
  })
})

describe('v1.1.12 已發包必填金額（§4.3）', () => {
  it('回報 in_progress 缺 amount → 400', async () => {
    const { cookie } = await loginAs('U-bd-am1', '金額1', 'manager')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'in_progress', note: '已發包' }),
    })
    expect(r.status).toBe(400)
  })

  it('回報 in_progress 帶 amount → 200，詳情回傳 amount/amount_at，時間軸帶 amount', async () => {
    const { cookie } = await loginAs('U-bd-am2', '金額2', 'manager')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'in_progress', note: '已發包', amount: 5000 }),
    })
    expect(r.status).toBe(200)

    // 詳情回傳 amount + amount_at
    const detail = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, {
      headers: { Cookie: cookie },
    })
    const detailBody = await detail.json()
    expect(detailBody.data.amount).toBe(5000)
    expect(detailBody.data.amount_at).toBeTruthy()
    // 時間軸該筆帶 amount
    const update = detailBody.data.updates.find((u: any) => u.status === 'in_progress')
    expect(update).toBeTruthy()
    expect(update.amount).toBe(5000)
  })

  it('回報 done 不需 amount → 200', async () => {
    const { cookie } = await loginAs('U-bd-am3', '金額3', 'manager')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'done', note: '完成' }),
    })
    expect(r.status).toBe(200)
  })

  it('reopen 到 in_progress 不重置 amount/amount_at（v1.1.13 金額語意鎖死）', async () => {
    const mgr = await loginAs('U-bd-am4', '金額4', 'manager')
    const admin = await loginAs('U-bd-am5', '金額5', 'admin')
    const ticketId = await createTicket(mgr.cookie)
    // 發包 5000
    const r1 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'in_progress', note: '已發包', amount: 5000 }),
    })
    expect(r1.status).toBe(200)
    // 結案
    const r2 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: mgr.cookie },
      body: JSON.stringify({ status: 'done', note: '完成' }),
    })
    expect(r2.status).toBe(200)
    // admin reopen 回 in_progress（reopen 不接受 amount，不該動舊金額）
    const r3 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/reopen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ status: 'in_progress', note: '重新檢查' }),
    })
    expect(r3.status).toBe(200)
    // 金額/發包時間保留
    const detail = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, { headers: { Cookie: mgr.cookie } })
    const detailBody = await detail.json()
    expect(detailBody.data.status).toBe('in_progress')
    expect(detailBody.data.amount).toBe(5000)
    expect(detailBody.data.amount_at).toBeTruthy()
  })

  it('同一張單多次發包，amount 覆寫為最後一次（統計取最終 amount_at）', async () => {
    const { cookie } = await loginAs('U-bd-am6', '金額6', 'manager')
    const ticketId = await createTicket(cookie)
    // 第一次發包 5000
    const r1 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'in_progress', note: '第一次發包', amount: 5000 }),
    })
    expect(r1.status).toBe(200)
    // 第二次發包 9000 → 覆寫
    const r2 = await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'in_progress', note: '第二次發包', amount: 9000 }),
    })
    expect(r2.status).toBe(200)
    const detail = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, { headers: { Cookie: cookie } })
    const detailBody = await detail.json()
    // tickets.amount 被覆寫為最後一次（9000）
    expect(detailBody.data.amount).toBe(9000)
    // 時間軸保留兩筆歷史金額（5000 與 9000）
    const inProgress = detailBody.data.updates.filter((u: any) => u.status === 'in_progress')
    expect(inProgress.length).toBe(2)
    expect(inProgress.map((u: any) => u.amount).sort()).toEqual([5000, 9000])
  })
})
