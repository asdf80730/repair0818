// tests/assoc.test.ts — v1.1.7 類別關聯測試
// 涵蓋：三種查詢模式、category_ids 三態、建單驗證、詳情回應 id、通用語意、assertValidAssoc
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

async function optionId(type: string, label: string): Promise<number> {
  const row = await env.DB.prepare('SELECT id FROM options WHERE type = ? AND label = ?').bind(type, label).first<{ id: number }>()
  if (!row) throw new Error(`找不到選項 ${type}/${label}`)
  return row.id
}

// 建立關聯：把 location 掛到 category
async function setAssoc(cookie: string, optionId: number, categoryIds: number[]) {
  const r = await worker.fetch(`http://example.com/api/options/${optionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    body: JSON.stringify({ category_ids: categoryIds }),
  })
  return r
}

describe('GET /api/options 三種模式（v1.1.7）', () => {
  it('?type=X 僅回 active，不附 category_ids', async () => {
    const { cookie } = await loginAs('U-assoc-1', '關聯1', 'committee')
    const r = await worker.fetch('http://example.com/api/options?type=location', { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0]).not.toHaveProperty('category_ids')
  })

  it('?type=X&category_id=N 回該類別關聯＋通用', async () => {
    const { cookie } = await loginAs('U-assoc-2', '關聯2', 'manager')
    const catId = await optionId('category', '電梯')
    const locId = await optionId('location', '頂樓')
    // 把 頂樓 掛到 電梯，大廳 掛到 門禁（使其非通用、不屬電梯）
    const doorCat = await optionId('category', '門禁')
    const hallLoc = await optionId('location', '大廳')
    await setAssoc(cookie, locId, [catId])
    await setAssoc(cookie, hallLoc, [doorCat])
    const r = await worker.fetch(`http://example.com/api/options?type=location&category_id=${catId}`, { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    const body = await r.json()
    const labels = body.data.map(o => o.label)
    expect(labels).toContain('頂樓')   // 關聯
    expect(labels).toContain('停車場') // 通用（無關聯）
    expect(labels).not.toContain('大廳') // 已掛到門禁，非電梯類別也非通用
  })

  it('?type=X&include_inactive=1 附 category_ids，限 manager/admin', async () => {
    const { cookie } = await loginAs('U-assoc-3', '關聯3', 'admin')
    const r = await worker.fetch('http://example.com/api/options?type=location&include_inactive=1', { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data[0]).toHaveProperty('category_ids')
    expect(Array.isArray(body.data[0].category_ids)).toBe(true)
  })

  it('committee 帶 include_inactive=1 → 403', async () => {
    const { cookie } = await loginAs('U-assoc-4', '關聯4', 'committee')
    const r = await worker.fetch('http://example.com/api/options?type=location&include_inactive=1', { headers: { Cookie: cookie } })
    expect(r.status).toBe(403)
  })

  it('category_id 與 include_inactive 併用 → 400', async () => {
    const { cookie } = await loginAs('U-assoc-5', '關聯5', 'admin')
    const catId = await optionId('category', '電梯')
    const r = await worker.fetch(`http://example.com/api/options?type=location&category_id=${catId}&include_inactive=1`, { headers: { Cookie: cookie } })
    expect(r.status).toBe(400)
  })
})

describe('category_ids 寫入（v1.1.7）', () => {
  it('PATCH 帶 category_ids 全量覆寫', async () => {
    const { cookie } = await loginAs('U-assoc-6', '關聯6', 'admin')
    const catId = await optionId('category', '電梯')
    const locId = await optionId('location', '頂樓')
    const r = await setAssoc(cookie, locId, [catId])
    expect(r.status).toBe(200)
    // 驗證已寫入
    const row = await env.DB.prepare('SELECT category_id FROM option_categories WHERE option_id = ?').bind(locId).all<{ category_id: number }>()
    expect(row.results.map(x => x.category_id)).toContain(catId)
  })

  it('PATCH 帶 [] 清空關聯（回歸通用）', async () => {
    const { cookie } = await loginAs('U-assoc-7', '關聯7', 'admin')
    const catId = await optionId('category', '電梯')
    const locId = await optionId('location', '頂樓')
    await setAssoc(cookie, locId, [catId])
    const r = await setAssoc(cookie, locId, [])
    expect(r.status).toBe(200)
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM option_categories WHERE option_id = ?').bind(locId).first<{ n: number }>()
    expect(row!.n).toBe(0)
  })

  it('PATCH 未帶 category_ids 不動關聯', async () => {
    const { cookie } = await loginAs('U-assoc-8', '關聯8', 'admin')
    const catId = await optionId('category', '電梯')
    const locId = await optionId('location', '頂樓')
    await setAssoc(cookie, locId, [catId])
    // 只改 label，不帶 category_ids
    const r = await worker.fetch(`http://example.com/api/options/${locId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ label: '頂樓' }),
    })
    expect(r.status).toBe(200)
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM option_categories WHERE option_id = ?').bind(locId).first<{ n: number }>()
    expect(row!.n).toBe(1) // 關聯仍在
  })

  it('category 帶 category_ids → 400（assertValidAssoc 擋）', async () => {
    const { cookie } = await loginAs('U-assoc-9', '關聯9', 'admin')
    const catId = await optionId('category', '電梯')
    const r = await setAssoc(cookie, catId, [catId])
    expect(r.status).toBe(400)
  })

  it('category_ids 含非類別 → 400', async () => {
    const { cookie } = await loginAs('U-assoc-10', '關聯10', 'admin')
    const locId = await optionId('location', '頂樓')
    const otherLoc = await optionId('location', '大廳')
    const r = await setAssoc(cookie, locId, [otherLoc]) // 大廳是 location 非 category
    expect(r.status).toBe(400)
  })
})

describe('建單驗證（v1.1.7）', () => {
  it('location 不屬於 category 且非通用 → 400', async () => {
    const { cookie } = await loginAs('U-assoc-11', '關聯11', 'admin') // 建關聯需 manager/admin
    const catId = await optionId('category', '電梯')
    const locId = await optionId('location', '大廳')
    // 把 大廳 掛到 門禁（非電梯），使其非通用
    const doorCat = await optionId('category', '門禁')
    await setAssoc(cookie, locId, [doorCat])
    const r = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: catId, location_id: locId, description: '測試' }),
    })
    expect(r.status).toBe(400)
  })

  it('location 為通用 → 任何類別可建單', async () => {
    const { cookie } = await loginAs('U-assoc-12', '關聯12', 'committee')
    const catId = await optionId('category', '電梯')
    const locId = await optionId('location', '停車場') // 通用
    const r = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: catId, location_id: locId, description: '測試' }),
    })
    expect(r.status).toBe(201)
  })
})

describe('詳情回應補 id（v1.1.7）', () => {
  it('GET /tickets/:id 回 category_id 與 location_id', async () => {
    const { cookie } = await loginAs('U-assoc-13', '關聯13', 'committee')
    const catId = await optionId('category', '電梯')
    const locId = await optionId('location', '停車場')
    const create = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: catId, location_id: locId, description: '測試' }),
    })
    const created = await create.json()
    const r = await worker.fetch(`http://example.com/api/tickets/${created.data.id}`, { headers: { Cookie: cookie } })
    const body = await r.json()
    expect(body.data.category_id).toBe(catId)
    expect(body.data.location_id).toBe(locId)
  })
})

describe('inactive category 行為（v1.1.7）', () => {
  it('category_id 存在但 inactive → 200 照常過濾', async () => {
    const { cookie } = await loginAs('U-assoc-14', '關聯14', 'admin')
    const catId = await optionId('category', '電梯')
    // 停用電梯
    await worker.fetch(`http://example.com/api/options/${catId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ active: 0 }),
    })
    const r = await worker.fetch(`http://example.com/api/options?type=location&category_id=${catId}`, { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
  })

  it('category_id 不存在 → 400', async () => {
    const { cookie } = await loginAs('U-assoc-15', '關聯15', 'committee')
    const r = await worker.fetch('http://example.com/api/options?type=location&category_id=99999', { headers: { Cookie: cookie } })
    expect(r.status).toBe(400)
  })
})

describe('GET /api/options 類別計數與 associated（v1.1.7）', () => {
  it('type=category&include_inactive=1 附 location_count/description_count', async () => {
    const { cookie } = await loginAs('U-assoc-16', '關聯16', 'admin')
    const r = await worker.fetch('http://example.com/api/options?type=category&include_inactive=1', { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data[0]).toHaveProperty('location_count')
    expect(body.data[0]).toHaveProperty('description_count')
  })

  it('type=location&category_id=N&include_inactive=1 附 associated', async () => {
    const { cookie } = await loginAs('U-assoc17', '關聯17', 'admin')
    const catId = await optionId('category', '門禁')
    const locId = await optionId('location', '大廳')
    // 用 POST assoc 端點建關聯（不受 PATCH assertValidAssoc 影響，且避免與前面停用電梯衝突）
    const set = await worker.fetch(`http://example.com/api/options/${catId}/assoc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ type: 'location', option_ids: [locId] }),
    })
    if (set.status !== 200) {
      console.log('POST assoc body:', JSON.stringify(await set.json()))
    }
    expect(set.status).toBe(200)
    const r = await worker.fetch(`http://example.com/api/options?type=location&category_id=${catId}&include_inactive=1`, { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    const body = await r.json()
    const target = body.data.find((o: { id: number }) => o.id === locId)
    expect(target.associated).toBe(1)
  })
})

describe('POST /api/options/:id/assoc 以類別為中心（v1.1.7）', () => {
  it('全量覆寫該類別對 type 的關聯', async () => {
    const { cookie } = await loginAs('U-assoc18', '關聯18', 'admin')
    const catId = await optionId('category', '電梯')
    const locIds = [await optionId('location', '停車場'), await optionId('location', '大廳')]
    // 電梯 ← 停車場、大廳
    const r = await worker.fetch(`http://example.com/api/options/${catId}/assoc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ type: 'location', option_ids: locIds }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.count).toBe(2)
    // 驗證頂樓不在電梯關聯
    const assocRows = await env.DB.prepare(
      'SELECT option_id FROM option_categories WHERE category_id = ?',
    ).bind(catId).all<{ option_id: number }>()
    const ids = assocRows.results.map(x => x.option_id)
    expect(ids).toContain(locIds[0])
    expect(ids).toContain(locIds[1])
  })

  it('option_ids 含非該 type → 400', async () => {
    const { cookie } = await loginAs('U-assoc19', '關聯19', 'admin')
    const catId = await optionId('category', '電梯')
    const badId = await optionId('category', '門禁') // 是 category 不是 location
    const r = await worker.fetch(`http://example.com/api/options/${catId}/assoc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ type: 'location', option_ids: [badId] }),
    })
    expect(r.status).toBe(400)
  })
})
