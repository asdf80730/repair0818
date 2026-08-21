// tests/coverage.test.ts — 補足覆蓋缺口（photos/users 防呆/options/vendors/logout/void/列表篩選/share photos）
// 依 F.I.R.S.T：測行為、AAA、涵蓋邊界與例外
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

async function createTicket(cookie: string, description = '覆蓋測試單'): Promise<number> {
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

/** 上傳一張 jpeg 照片，回傳 photo id */
async function uploadPhoto(cookie: string, bytes: Uint8Array, contentType = 'image/jpeg'): Promise<number> {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: contentType }), 'a.jpg')
  const r = await worker.fetch('http://example.com/api/photos', {
    method: 'POST',
    headers: { Cookie: cookie, 'X-Requested-With': 'fetch' },
    body: form,
  })
  const body = await r.json()
  return body.data.id
}

// 最小合法 jpeg（magic bytes FF D8 FF，長度 ≥ 12）
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])

describe('photos 上傳/讀取/驗證/歸屬（§4.4）', () => {
  it('上傳合法 jpeg → 201，回傳 id 與 url', async () => {
    const { cookie } = await loginAs('U-cov-ph1', '照片1', 'committee')
    const r = await worker.fetch('http://example.com/api/photos', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Requested-With': 'fetch' },
      body: (() => { const f = new FormData(); f.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'a.jpg'); return f })(),
    })
    expect(r.status).toBe(201)
    const body = await r.json()
    expect(body.data.id).toBeTruthy()
    expect(body.data.url).toContain('/api/photos/')
  })

  it('content-type 白名單外（HEIC）→ 400', async () => {
    const { cookie } = await loginAs('U-cov-ph2', '照片2', 'committee')
    const r = await worker.fetch('http://example.com/api/photos', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Requested-With': 'fetch' },
      body: (() => { const f = new FormData(); f.append('file', new Blob([JPEG], { type: 'image/heic' }), 'a.heic'); return f })(),
    })
    expect(r.status).toBe(400)
  })

  it('magic bytes 與格式不符 → 400', async () => {
    const { cookie } = await loginAs('U-cov-ph3', '照片3', 'committee')
    const fake = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb])
    const r = await worker.fetch('http://example.com/api/photos', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Requested-With': 'fetch' },
      body: (() => { const f = new FormData(); f.append('file', new Blob([fake], { type: 'image/jpeg' }), 'a.jpg'); return f })(),
    })
    expect(r.status).toBe(400)
  })

  it('超過 10MB → 400', async () => {
    const { cookie } = await loginAs('U-cov-ph4', '照片4', 'committee')
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff
    const r = await worker.fetch('http://example.com/api/photos', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Requested-With': 'fetch' },
      body: (() => { const f = new FormData(); f.append('file', new Blob([big], { type: 'image/jpeg' }), 'a.jpg'); return f })(),
    })
    expect(r.status).toBe(400)
  })

  it('上傳本人可讀取照片 → 200 含正確 content-type', async () => {
    const { cookie } = await loginAs('U-cov-ph5', '照片5', 'committee')
    const photoId = await uploadPhoto(cookie, JPEG)
    const r = await worker.fetch(`http://example.com/api/photos/${photoId}`, { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('image/jpeg')
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await r.arrayBuffer() // 消費 R2 body stream，避免 isolation 清理失敗
  })

  it('未綁定照片他人不可讀 → 404（歸屬檢查）', async () => {
    const a = await loginAs('U-cov-ph6a', '照片6A', 'committee')
    const b = await loginAs('U-cov-ph6b', '照片6B', 'committee')
    const photoId = await uploadPhoto(a.cookie, JPEG)
    const r = await worker.fetch(`http://example.com/api/photos/${photoId}`, { headers: { Cookie: b.cookie } })
    expect(r.status).toBe(404)
  })

  it('綁定到案件後，其他已開通使用者可讀 → 200', async () => {
    const a = await loginAs('U-cov-ph7a', '照片7A', 'committee')
    const b = await loginAs('U-cov-ph7b', '照片7B', 'committee')
    const photoId = await uploadPhoto(a.cookie, JPEG)
    // 建單帶 photo_ids 綁定
    const cat = await getOptionId('category')
    const loc = await getOptionId('location')
    await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: a.cookie },
      body: JSON.stringify({ category_id: cat, location_id: loc, description: '帶照片', photo_ids: [photoId] }),
    })
    const r = await worker.fetch(`http://example.com/api/photos/${photoId}`, { headers: { Cookie: b.cookie } })
    expect(r.status).toBe(200)
    await r.arrayBuffer() // 消費 R2 body stream
  })
})

describe('users PATCH 防呆（§4.6 ADMIN_LOCKED）', () => {
  it('不可停用自己 → 400', async () => {
    const { userId, cookie } = await loginAs('U-cov-u1', '管理員1', 'admin')
    const r = await worker.fetch(`http://example.com/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ active: 0 }),
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error.code).toBe('ADMIN_LOCKED')
  })

  it('不可對自己降權 → 400', async () => {
    const { userId, cookie } = await loginAs('U-cov-u2', '管理員2', 'admin')
    const r = await worker.fetch(`http://example.com/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ role: 'committee' }),
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error.code).toBe('ADMIN_LOCKED')
  })

  it('最後一位 admin 不可被降權/停用 → 400', async () => {
    const admin = await loginAs('U-cov-u3', '管理員3', 'admin')
    const other = await loginAs('U-cov-u4', '管理員4', 'admin')
    // 把 other 降為 committee，剩 admin 一位
    await worker.fetch(`http://example.com/api/users/${other.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ role: 'committee' }),
    })
    // 現在 admin 是最後一位 admin，不可被降權
    const r = await worker.fetch(`http://example.com/api/users/${admin.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ role: 'manager' }),
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error.code).toBe('ADMIN_LOCKED')
  })

  it('正常改他人 role → 200', async () => {
    const admin = await loginAs('U-cov-u5', '管理員5', 'admin')
    const target = await loginAs('U-cov-u6', '成員6', 'committee')
    const r = await worker.fetch(`http://example.com/api/users/${target.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: admin.cookie },
      body: JSON.stringify({ role: 'manager' }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.updated).toBe(true)
  })

  it('committee 不可存取 users → 403', async () => {
    const { cookie } = await loginAs('U-cov-u7', '管委7', 'committee')
    const r = await worker.fetch('http://example.com/api/users', { headers: { Cookie: cookie } })
    expect(r.status).toBe(403)
  })
})

describe('options 寫操作（§4.6）', () => {
  it('manager 新增選項 → 201', async () => {
    const { cookie } = await loginAs('U-cov-o1', '選項1', 'manager')
    const r = await worker.fetch('http://example.com/api/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ type: 'category', label: '水管', sort_order: 9 }),
    })
    expect(r.status).toBe(201)
    const body = await r.json()
    expect(body.data.reactivated).toBe(false)
  })

  it('重複 label → reactivated（不新增）', async () => {
    const { cookie } = await loginAs('U-cov-o2', '選項2', 'manager')
    const r = await worker.fetch('http://example.com/api/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ type: 'category', label: '電梯', sort_order: 1 }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.reactivated).toBe(true)
  })

  it('PATCH 停用選項 → 200，GET 不再回傳', async () => {
    const { cookie } = await loginAs('U-cov-o3', '選項3', 'manager')
    const optId = await getOptionId('category')
    const r = await worker.fetch(`http://example.com/api/options/${optId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ active: 0 }),
    })
    expect(r.status).toBe(200)
    const list = await worker.fetch('http://example.com/api/options?type=category', { headers: { Cookie: cookie } })
    const listBody = await list.json()
    expect(listBody.data.some((o: any) => o.id === optId)).toBe(false)
  })

  it('committee 不可新增選項 → 403', async () => {
    const { cookie } = await loginAs('U-cov-o4', '選項4', 'committee')
    const r = await worker.fetch('http://example.com/api/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ type: 'category', label: 'X', sort_order: 1 }),
    })
    expect(r.status).toBe(403)
  })
})

describe('vendors 寫操作（§4.6）', () => {
  it('manager 新增廠商 → 201', async () => {
    const { cookie } = await loginAs('U-cov-v1', '廠商1', 'manager')
    const r = await worker.fetch('http://example.com/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ name: '水電行' }),
    })
    expect(r.status).toBe(201)
  })

  it('PATCH 停用廠商 → 200', async () => {
    const { cookie } = await loginAs('U-cov-v2', '廠商2', 'manager')
    const create = await worker.fetch('http://example.com/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ name: '清潔公司' }),
    })
    const { data } = await create.json()
    const r = await worker.fetch(`http://example.com/api/vendors/${data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ active: 0 }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.updated).toBe(true)
  })

  it('committee 不可新增廠商 → 403', async () => {
    const { cookie } = await loginAs('U-cov-v3', '廠商3', 'committee')
    const r = await worker.fetch('http://example.com/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ name: 'X' }),
    })
    expect(r.status).toBe(403)
  })

  it('PATCH sort_order 後列表依 active DESC, sort_order 排序（v1.1.13）', async () => {
    const { cookie } = await loginAs('U-cov-v4', '廠商4', 'manager')
    // 新增兩家廠商
    const a = await (await worker.fetch('http://example.com/api/vendors', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ name: '甲廠商' }),
    })).json()
    const b = await (await worker.fetch('http://example.com/api/vendors', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ name: '乙廠商' }),
    })).json()
    // 把甲廠商 sort_order 調成 10，應排在乙廠商(0)之後
    const patch = await worker.fetch(`http://example.com/api/vendors/${a.data.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ sort_order: 10 }),
    })
    expect(patch.status).toBe(200)

    const list = await worker.fetch('http://example.com/api/vendors', { headers: { Cookie: cookie } })
    const { data } = await list.json()
    const names = data.map((v: any) => v.name)
    // 甲(10) 應在乙(0) 之後
    expect(names.indexOf('乙廠商')).toBeLessThan(names.indexOf('甲廠商'))
    // phone 欄位已移除
    expect(data[0]).not.toHaveProperty('phone')
    expect(data[0]).toHaveProperty('sort_order')
  })
})

describe('auth logout（§4.2）', () => {
  it('登出回應清除 session cookie', async () => {
    const { cookie } = await loginAs('U-cov-lo1', '登出1', 'committee')
    const r = await worker.fetch('http://example.com/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.logged_out).toBe(true)
    // 回應應 Set-Cookie 清除 session（maxAge=0 或過期）
    const setCookie = r.headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain('session=')
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  })
})

describe('tickets void（§4.3）', () => {
  it('manager 作廢案件 → status void', async () => {
    const { cookie } = await loginAs('U-cov-vd1', '作廢1', 'manager')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ note: '誤建單' }),
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.status).toBe('void')
  })

  it('已結案不可再作廢 → 400', async () => {
    const { cookie } = await loginAs('U-cov-vd2', '作廢2', 'manager')
    const ticketId = await createTicket(cookie)
    // 先結案
    await worker.fetch(`http://example.com/api/tickets/${ticketId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'done', note: '完成' }),
    })
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ note: '再作廢' }),
    })
    expect(r.status).toBe(400)
  })

  it('committee 不可作廢 → 403', async () => {
    const { cookie } = await loginAs('U-cov-vd3', '作廢3', 'committee')
    const ticketId = await createTicket(cookie)
    const r = await worker.fetch(`http://example.com/api/tickets/${ticketId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ note: 'x' }),
    })
    expect(r.status).toBe(403)
  })
})

describe('tickets 列表篩選（§4.3）', () => {
  it('status=done 只回結案案件', async () => {
    const { cookie } = await loginAs('U-cov-ls1', '篩選1', 'manager')
    const openId = await createTicket(cookie, '未結案')
    const doneId = await createTicket(cookie, '已結案')
    await worker.fetch(`http://example.com/api/tickets/${doneId}/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ status: 'done', note: '完成' }),
    })
    const r = await worker.fetch('http://example.com/api/tickets?status=done', { headers: { Cookie: cookie } })
    const body = await r.json()
    const ids = body.data.items.map((t: any) => t.id)
    expect(ids).toContain(doneId)
    expect(ids).not.toContain(openId)
  })

  it('status=all 回全部，含 void', async () => {
    const { cookie } = await loginAs('U-cov-ls2', '篩選2', 'manager')
    const voidId = await createTicket(cookie, '作廢單')
    await worker.fetch(`http://example.com/api/tickets/${voidId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ note: '作廢' }),
    })
    const r = await worker.fetch('http://example.com/api/tickets?status=all', { headers: { Cookie: cookie } })
    const body = await r.json()
    const ids = body.data.items.map((t: any) => t.id)
    expect(ids).toContain(voidId)
  })

  it('category_id 篩選只回該類別', async () => {
    const { cookie } = await loginAs('U-cov-ls3', '篩選3', 'committee')
    // 建一張單，用它的 category_id 篩選（避免被前面測試停用的選項影響）
    const cat = await getOptionId('category')
    const loc = await getOptionId('location')
    const create = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: cat, location_id: loc, description: '篩選用單' }),
    })
    expect(create.status).toBe(201)
    const r = await worker.fetch(`http://example.com/api/tickets?category_id=${cat}`, { headers: { Cookie: cookie } })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.items.length).toBeGreaterThan(0)
    for (const t of body.data.items) {
      expect(t.category_label).toBeTruthy()
    }
  })
})

describe('share photos 端點（§4.5）', () => {
  it('綁定照片可透過 share 公開讀取 → 200', async () => {
    const { cookie } = await loginAs('U-cov-sp1', '分享1', 'manager')
    const photoId = await uploadPhoto(cookie, JPEG)
    const cat = await getOptionId('category')
    const loc = await getOptionId('location')
    const create = await worker.fetch('http://example.com/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
      body: JSON.stringify({ category_id: cat, location_id: loc, description: '分享照片', photo_ids: [photoId] }),
    })
    const { data } = await create.json()
    const shareToken = data.share_token

    // share 回 photos url
    const share = await worker.fetch(`http://example.com/api/share/${shareToken}`)
    const shareBody = await share.json()
    expect(shareBody.data.photos).toContain(`/api/share/${shareToken}/photos/${photoId}`)

    // 公開讀取照片
    const photo = await worker.fetch(`http://example.com/api/share/${shareToken}/photos/${photoId}`)
    expect(photo.status).toBe(200)
    expect(photo.headers.get('Content-Type')).toBe('image/jpeg')
    await photo.arrayBuffer() // 消費 R2 body stream
  })

  it('非該案件的照片透過 share 讀取 → 404', async () => {
    const { cookie } = await loginAs('U-cov-sp2', '分享2', 'manager')
    const photoId = await uploadPhoto(cookie, JPEG) // 未綁定
    const ticketId = await createTicket(cookie)
    const detail = await worker.fetch(`http://example.com/api/tickets/${ticketId}`, { headers: { Cookie: cookie } })
    const detailBody = await detail.json()
    const shareToken = new URL('http://x' + detailBody.data.share_url).searchParams.get('token')
    const r = await worker.fetch(`http://example.com/api/share/${shareToken}/photos/${photoId}`)
    expect(r.status).toBe(404)
  })
})
