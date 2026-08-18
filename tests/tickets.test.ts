// tests/tickets.test.ts — M3 案件核心端點測試（§4.3）
// 在真實 workerd runtime 跑，D1 用 miniflare
import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'

const worker = SELF

afterEach(() => {
  vi.restoreAllMocks()
})

/** mock LINE 驗證成功，回傳指定 sub/name */
function mockLineVerify(sub: string, name: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (url.href.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
      return new Response(JSON.stringify({
        iss: 'https://access.line.me',
        sub,
        aud: 'test-channel',
        exp: Math.floor(Date.now() / 1000) + 3600,
        name,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('No mock found for ' + url.href)
  })
}

/** 建立一個已開通使用者並回傳 session cookie（直接更新 D1 role 模擬審核） */
async function loginAs(sub: string, name: string, role: 'committee' | 'manager' | 'admin') {
  mockLineVerify(sub, name)
  const session = await worker.fetch('http://example.com/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ id_token: 'mock' }),
  })
  expect(session.status).toBe(200)
  const body = await session.json()
  const userId = body.data.user_id

  // 直接更新 D1 role（模擬管理員審核，users PATCH 屬 M2 後續）
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, userId).run()

  const cookie = session.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { userId, cookie }
}

/** 取第一個 active 的 category/location option id（seed 後動態查） */
async function getOptionId(type: 'category' | 'location'): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT id FROM options WHERE type = ? AND active = 1 ORDER BY id LIMIT 1',
  ).bind(type).first<{ id: number }>()
  if (!row) throw new Error('找不到 ' + type + ' 選項，seed 失敗')
  return row.id
}

describe('M3 案件核心（§4.3）', () => {
  it('建單 → 列表 → 詳情 完整流程', async () => {
    const { cookie } = await loginAs('U-m3-user', 'M3測試', 'committee')
    const categoryId = await getOptionId('category')
    const locationId = await getOptionId('location')

    // 建單
    const create = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: categoryId, location_id: locationId, description: '電梯故障' }),
    })
    expect(create.status).toBe(201)
    const created = await create.json()
    expect(created.data.title).toContain('電梯')
    expect(created.data.share_token).toBeTruthy()

    // 列表
    const list = await worker.fetch('http://example.com/api/tickets', {
      headers: { Cookie: cookie },
    })
    expect(list.status).toBe(200)
    const listBody = await list.json()
    expect(listBody.data.items.length).toBeGreaterThan(0)
    expect(listBody.data.items[0].title).toContain('電梯')

    // 詳情
    const detail = await worker.fetch(`http://example.com/api/tickets/${created.data.id}`, {
      headers: { Cookie: cookie },
    })
    expect(detail.status).toBe(200)
    const detailBody = await detail.json()
    expect(detailBody.data.description).toBe('電梯故障')
    expect(detailBody.data.share_url).toContain('/api/share/')
    expect(detailBody.data.updates).toEqual([])
  })

  it('建單時類別/地點無效 → 400', async () => {
    const { cookie } = await loginAs('U-m3-bad', '壞單', 'committee')
    const locationId = await getOptionId('location')
    const r = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: 999, location_id: locationId }),
    })
    expect(r.status).toBe(400)
  })

  it('未登入建單 → 401', async () => {
    const r = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ category_id: 1, location_id: 1 }),
    })
    expect(r.status).toBe(401)
  })
})
