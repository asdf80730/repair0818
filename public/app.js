// 社區修繕系統 — 主系統 SPA（hash router，P0–P7）
// 前端一律純 JS，禁止 import npm 套件；使用者內容進 DOM 一律 textContent
// 401 走 §3.4 靜默重登；403 依 code 顯示對應訊息

'use strict'

// ---- 設定 ----
const LIFF_ID = '2008484338-AvdMWQQg' // 正式 LIFF

// ---- 全域狀態 ----
let me = null // { id, display_name, role }
let liffReady = false

// ---- fetch wrapper（§4.0：mutation 自動帶 X-Requested-With: fetch）----
// ---- mock 資料層（僅 ?mock=true，供前端互動自動化測試）----
// 後端 API 已由 vitest 覆蓋；此層讓前端互動（填表單→送出→跳轉）可自動化測
const IS_MOCK = new URLSearchParams(window.location.search).get('mock') === 'true'
let mockTickets = [
  { id: 1, title: '電梯－停車場 #0001', status: 'open', category_label: '電梯', location_label: '停車場', description: '電梯無法關門', vendor_name: null, amount: null, amount_at: null, created_at: '2026-08-18T10:00:00.000Z', last_activity_at: '2026-08-18T10:00:00.000Z' },
  { id: 2, title: '門禁－大廳 #0002', status: 'in_progress', category_label: '門禁', location_label: '大廳', description: '大門感應故障', vendor_name: '測試廠商', amount: 12000, amount_at: '2026-08-18T11:00:00.000Z', created_at: '2026-08-18T09:00:00.000Z', last_activity_at: '2026-08-18T11:00:00.000Z' },
  { id: 3, title: '門禁－車道 #0003', status: 'void', category_label: '門禁', location_label: '車道', description: null, vendor_name: null, amount: null, amount_at: null, created_at: '2026-08-18T08:00:00.000Z', last_activity_at: '2026-08-18T12:00:00.000Z' },
  { id: 4, title: '其他－中庭 #0004', status: 'open', category_label: '其他', location_label: '中庭', description: '地磚破損', vendor_name: '測試廠商', amount: null, amount_at: null, created_at: '2026-08-19T09:00:00.000Z', last_activity_at: '2026-08-19T09:00:00.000Z' },
  { id: 5, title: '水泵－頂樓 #0005', status: 'done', category_label: '水泵', location_label: '頂樓', description: '水泵漏水', vendor_name: null, amount: 8000, amount_at: '2026-08-20T08:00:00.000Z', created_at: '2026-08-19T14:00:00.000Z', last_activity_at: '2026-08-20T08:00:00.000Z' },
  { id: 6, title: '水泵－頂樓 #0006', status: 'open', category_label: '水泵', location_label: '頂樓', description: '頂樓水塔噪音', vendor_name: null, amount: null, amount_at: null, created_at: '2026-08-20T02:50:00.000Z', last_activity_at: '2026-08-20T22:19:00.000Z' },
  // F10 mock：當日 ticket（用 today UTC，避免 E2E 對時間耦合）
  { id: 99, title: '電梯－停車場 #0099', status: 'in_progress', category_label: '電梯', location_label: '停車場', description: '門開關異常', vendor_name: '測試廠商', amount: null, amount_at: null, created_at: new Date().toISOString(), last_activity_at: new Date().toISOString() },
]
let mockNextId = 7
let mockPhotosCount = 0 // A8：mock 照片上傳計數（產生唯一 id）
// mock 時間軸（v1.1.12：測金額顯示；id=2 已發包含金額）
let mockUpdates = [
  { id: 1, ticket_id: 2, kind: 'status', status: 'in_progress', note: '已發包施作', amount: 12000, display_name: '測試用戶', created_at: '2026-08-18T11:00:00.000Z', photo_urls: [] },
  // F10 mock：當日 update（id=99 ticket）
  { id: 99, ticket_id: 99, kind: 'status', status: 'in_progress', note: '已通知廠商', amount: null, display_name: '測試用戶', created_at: new Date().toISOString(), photo_urls: [] },
]
// mock 類別關聯（v1.1.7）：電梯→頂樓、門禁→大廳；assoc=0 時清空（零關聯＝全部通用）
const mockAssoc = [
  { option_id: 3, category_id: 1 }, // 頂樓 → 電梯
  { option_id: 2, category_id: 2 }, // 大廳 → 門禁
]
const mockOptions = {
  category: [{ id: 1, label: '電梯' }, { id: 2, label: '門禁' }, { id: 3, label: '水泵' }],
  location: [{ id: 1, label: '停車場' }, { id: 2, label: '大廳' }, { id: 3, label: '頂樓' }],
  description: [{ id: 1, label: '水泵浦異音' }, { id: 2, label: '照明故障' }],
  comment_desc: [{ id: 1, label: '已通知廠商處理' }, { id: 2, label: '已到場勘查' }],
  // v1.1.16：訊息模板 mock fixture — new_case / timeline 兩種（案件動態簡化）
  message_template: [
    {
      id: 1, type: 'message_template', label: 'new_case', sort_order: 0, active: 1,
      body: '{{#each new_cases}}\n{{id}}. {{location_label}}　{{status}}　{{description}}\n{{/each}}',
      is_category_specific: false,
    },
    {
      id: 2, type: 'message_template', label: 'timeline', sort_order: 1, active: 1,
      body: '{{#each timeline_updates}}\n{{id}}. {{location_label}}　{{status}}　{{note}}\n{{/each}}',
      is_category_specific: false,
    },
  ],
}
// mock 類別關聯（v1.1.7）：電梯→頂樓、門禁→大廳；assoc=0 時清空（零關聯＝全部通用）
const mockTplAssoc = [] // 訊息模板無類別關聯（全域預設）

// v1.1.16：案件動態簡化 — 硬編固定文案與總系統連結（R-4）
const DAILY_REPORT_HEADER = '修繕系統簡報'
const EMPTY_NEW_CASES_TEXT = '今天無新案件'
const EMPTY_TIMELINE_TEXT = '今天沒有案件狀態更新'
const SYSTEM_LINK = 'https://liff.line.me/2008484338-AvdMWQQg'
const mockUsers = [
  { id: 1, display_name: '測試用戶', role: 'admin', active: 1 },
  { id: 2, display_name: '王任鋒', role: 'admin', active: 1 },
  { id: 3, display_name: '陳秘書', role: 'manager', active: 1 },
  { id: 4, display_name: '李委員', role: 'committee', active: 1 },
  { id: 5, display_name: '待開通者', role: 'pending', active: 1 },
  { id: 6, display_name: '已停用者', role: 'committee', active: 0 },
]
const mockVendors = [{ id: 1, name: '測試廠商', sort_order: 0, active: 1 }]

function mockApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const url = new URL(path, window.location.origin)
  const pathname = url.pathname // 去 query 比對

  // auth/me
  if (pathname === '/api/auth/me') {
    return { ok: true, data: { id: 1, display_name: '測試用戶', role: 'admin' } }
  }
  // 建單 catalog：一次抓完（v1.1.7）
  if (pathname === '/api/options/catalog') {
    const noAssoc = url.searchParams.get('assoc') === '0'
    const cats = (mockOptions.category || [])
    const locs = (mockOptions.location || []).map(l => ({
      ...l,
      category_ids: noAssoc ? [] : mockAssoc.filter(a => a.option_id === l.id).map(a => a.category_id),
    }))
    const descs = (mockOptions.description || []).map(d => ({
      ...d,
      category_ids: noAssoc ? [] : mockAssoc.filter(a => a.option_id === d.id).map(a => a.category_id),
    }))
    const commentDescs = (mockOptions.comment_desc || []).map(d => ({ id: d.id, label: d.label }))
    return { ok: true, data: { categories: cats, locations: locs, descriptions: descs, comment_descs: commentDescs } }
  }
  // options（v1.1.7：支援 category_id 過濾、include_inactive、assoc=0 零關聯）
  if (pathname === '/api/options') {
    const type = url.searchParams.get('type')
    const categoryId = url.searchParams.get('category_id')
    const includeInactive = url.searchParams.get('include_inactive') === '1'
    const noAssoc = url.searchParams.get('assoc') === '0'
    let items = mockOptions[type] || []
    // 類別計數（P7 類別列表）
    if (type === 'category' && includeInactive) {
      const cats = items.map(c => {
        const locs = mockAssoc.filter(a => a.category_id === c.id && mockOptions.location.some(l => l.id === a.option_id))
        const descs = mockAssoc.filter(a => a.category_id === c.id && mockOptions.description.some(d => d.id === a.option_id))
        return { ...c, active: 1, location_count: locs.length, description_count: descs.length }
      })
      return { ok: true, data: cats }
    }
    // 該類別所有項附 associated（P7 modal）
    if (type !== 'category' && categoryId && includeInactive) {
      const cid = Number(categoryId)
      const items2 = items.map(o => ({
        ...o, active: 1,
        associated: noAssoc ? 0 : (mockAssoc.some(a => a.option_id === o.id && a.category_id === cid) ? 1 : 0),
      }))
      return { ok: true, data: items2 }
    }
    // category_id 過濾：該類別關聯＋通用（無關聯者）
    if (categoryId && type !== 'category') {
      const cid = Number(categoryId)
      if (noAssoc) {
        // 零關聯：全部通用
      } else {
        items = items.filter(o => {
          const assoc = mockAssoc.filter(a => a.option_id === o.id)
          if (assoc.length === 0) return true // 通用
          return assoc.some(a => a.category_id === cid)
        })
      }
    }
    // include_inactive：附 category_ids
    if (includeInactive) {
      items = items.map(o => ({
        ...o,
        active: 1,
        category_ids: noAssoc ? [] : mockAssoc.filter(a => a.option_id === o.id).map(a => a.category_id),
      }))
    }
    return { ok: true, data: items }
  }
  // 以類別為中心設定關聯（P7 modal，v1.1.7）
  const assocMatch = pathname.match(/^\/api\/options\/(\d+)\/assoc$/)
  if (assocMatch && method === 'POST') {
    return { ok: true, data: { category_id: Number(assocMatch[1]), count: 0 } }
  }
  // tickets 列表
  if (pathname === '/api/tickets' && method === 'GET') {
    const status = url.searchParams.get('status') || 'active'
    let items = mockTickets
    if (status === 'active') items = mockTickets.filter(t => t.status === 'open' || t.status === 'in_progress')
    else if (status !== 'all') items = mockTickets.filter(t => t.status === status)
    return { ok: true, data: { items, page: 1, limit: 20, has_more: false } }
  }
  // 建單
  if (pathname === '/api/tickets' && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const cat = mockOptions.category.find(o => o.id === body.category_id)
    const loc = mockOptions.location.find(o => o.id === body.location_id)
    const t = {
      id: mockNextId++, title: `${cat?.label || '?'}－${loc?.label || '?'} #${String(mockNextId - 1).padStart(4, '0')}`,
      status: 'open', category_label: cat?.label, location_label: loc?.label,
      vendor_name: null, amount: null, amount_at: null,
      created_at: new Date().toISOString(), last_activity_at: new Date().toISOString(),
    }
    mockTickets.unshift(t)
    return { ok: true, data: { id: t.id, title: t.title, share_token: 'mock-token-' + t.id } }
  }
  // 詳情
  const detailMatch = pathname.match(/^\/api\/tickets\/(\d+)$/)
  if (detailMatch && method === 'GET') {
    const t = mockTickets.find(x => x.id === Number(detailMatch[1]))
    if (!t) return { ok: false, error: { code: 'NOT_FOUND', message: '案件不存在' } }
    // v1.1.12：詳情帶 amount/amount_at + 時間軸（測金額顯示）
    const updates = mockUpdates.filter(u => u.ticket_id === t.id).map(u => ({
      id: u.id, kind: u.kind, status: u.status, note: u.note, amount: u.amount,
      display_name: u.display_name, created_at: u.created_at, photo_urls: u.photo_urls || [],
    }))
    return { ok: true, data: { ...t, description: '測試說明', photos: [{ id: 1, url: '/api/photos/1' }], share_url: '/share.html?token=mock-token-' + t.id, can_edit: true, updates } }
  }
  // v1.1.12：回報/留言（測已發包必填金額）
  const updatesMatch = pathname.match(/^\/api\/tickets\/(\d+)\/updates$/)
  if (updatesMatch && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const t = mockTickets.find(x => x.id === Number(updatesMatch[1]))
    if (!t) return { ok: false, error: { code: 'NOT_FOUND', message: '案件不存在' } }
    if (body.status === 'in_progress' && !body.amount) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: '已發包需填寫金額' } }
    }
    const now = new Date().toISOString()
    if (body.status === 'in_progress') {
      t.status = 'in_progress'; t.amount = body.amount; t.amount_at = now
      mockUpdates.unshift({ id: mockUpdates.length + 1, ticket_id: t.id, kind: 'status', status: 'in_progress', note: body.note || '', amount: body.amount, display_name: '測試用戶', created_at: now, photo_urls: [] })
    } else if (body.status === 'done') {
      t.status = 'done'
      mockUpdates.unshift({ id: mockUpdates.length + 1, ticket_id: t.id, kind: 'status', status: 'done', note: body.note || '', amount: null, display_name: '測試用戶', created_at: now, photo_urls: [] })
    } else if (body.status === 'open') {
      t.status = 'open'
      mockUpdates.unshift({ id: mockUpdates.length + 1, ticket_id: t.id, kind: 'status', status: 'open', note: body.note || '', amount: null, display_name: '測試用戶', created_at: now, photo_urls: [] })
    }
    t.last_activity_at = now
    return { ok: true, data: { updated: true, status: body.status } }
  }
  // v1.1.12：留言（測留言時間軸）
  const commentsMatch = pathname.match(/^\/api\/tickets\/(\d+)\/comments$/)
  if (commentsMatch && method === 'POST') {
    const body = JSON.parse(options.body || '{}')
    const t = mockTickets.find(x => x.id === Number(commentsMatch[1]))
    if (!t) return { ok: false, error: { code: 'NOT_FOUND', message: '案件不存在' } }
    mockUpdates.unshift({ id: mockUpdates.length + 1, ticket_id: t.id, kind: 'comment', status: null, note: body.note || '', amount: null, display_name: '測試用戶', created_at: new Date().toISOString(), photo_urls: [] })
    return { ok: true, data: { id: mockUpdates.length, kind: 'comment' } }
  }
  // 統計（A4：mock 依月份回不同 month_new/month_done，讓 E2E 驗證切月份生效）
  if (pathname === '/api/stats/summary') {
    const open_count = mockTickets.filter(t => t.status === 'open').length
    const in_progress_count = mockTickets.filter(t => t.status === 'in_progress').length
    const month = url.searchParams.get('month') || taipeiMonth()
    // mock 用月份末兩碼當 month_new，讓不同月份回不同值
    const mm = Number(month.slice(5, 7))
    return { ok: true, data: { open_count, in_progress_count, month_new: mm, month_done: mm >= 20 ? 5 : 0, month_initial_open: 10 } }
  }
  // v1.1.12：各類別金額統計（mock，從 mockTickets 動態算，測金額統計）
  if (pathname === '/api/stats/amount-by-category') {
    const byCat = {}
    for (const t of mockTickets) {
      if (t.amount != null) {
        byCat[t.category_label] = byCat[t.category_label] || { total_amount: 0, count: 0 }
        byCat[t.category_label].total_amount += t.amount
        byCat[t.category_label].count += 1
      }
    }
    const items = Object.entries(byCat).map(([category_label, v]) => ({ category_label, total_amount: v.total_amount, count: v.count }))
    return { ok: true, data: { items } }
  }
  // F1（v1.1.15）：daily-report mock — 依 date 過濾今天 tickets，回純資料 + template
  if (pathname === '/api/stats/daily-report') {
    const date = url.searchParams.get('date')
    const categoryId = Number(url.searchParams.get('category_id'))
    if (!date) return { ok: false, error: { code: 'MISSING_DATE', message: 'date 必填' } }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: { code: 'INVALID_DATE', message: 'date 格式錯' } }
    // 用台灣時區當天（與前端 dateInput 的 todayTaipeiStr() 一致），避免 UTC 前一天 16:00~24:00 誤判為未來日期
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (date > today) return { ok: false, error: { code: 'DATE_FUTURE', message: 'date 不可晚於今天' } }
    if (!categoryId) return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'category_id 必填' } }
    const cat = mockOptions.category.find(c => c.id === categoryId)
    if (!cat) return { ok: false, error: { code: 'NOT_FOUND', message: '類別不存在' } }
    // 撈台灣當天屬於該類別的 tickets（start/end = 台灣當天 00:00 的 UTC 對應，與後端 taipeiDayRangeUtc 一致）
    // 台灣當天 00:00 = UTC 前一日 16:00；end = 台灣隔天 00:00 = 當天 16:00 UTC（半開區間）
    const [yy, mm, dd] = date.split('-').map(Number)
    const startMs = Date.UTC(yy, mm - 1, dd) - 8 * 3600 * 1000
    const endMs = startMs + 24 * 3600 * 1000
    const start = new Date(startMs).toISOString()
    const end = new Date(endMs).toISOString()
    const inCat = mockTickets.filter(t => t.category_label === cat.label)
    const newTs = inCat.filter(t => t.created_at >= start && t.created_at <= end)
    const existingTs = inCat.filter(t => t.last_activity_at >= start && t.last_activity_at <= end && t.created_at < start)
    // v1.1.16：新案件（預設狀態詢價中）+ 時間軸拉平清單
    const new_cases = newTs.map(t => ({
      id: t.id,
      location_label: t.location_label,
      status: '詢價中',
      description: t.description ?? '',
    }))
    const timeline_updates = []
    for (const t of existingTs) {
      for (const u of mockUpdates.filter(u => u.ticket_id === t.id && u.created_at >= start && u.created_at <= end).slice(0, 3)) {
        timeline_updates.push({
          id: t.id,
          location_label: t.location_label,
          status: ({ open: '待處理', in_progress: '已發包', done: '已完成', void: '已作廢' }[t.status] || t.status),
          note: u.note ?? '',
        })
      }
    }
    const tpl = (label) => {
      const f = mockOptions.message_template.find(x => x.label === label)
      return f ? { id: f.id, body: f.body } : null
    }
    return {
      ok: true,
      data: {
        date, category_id: categoryId, category_label: cat.label,
        new_cases, timeline_updates,
        templates: { new_case: tpl('new_case'), timeline: tpl('timeline') },
      },
    }
  }
  // F6（v1.1.15）：message-templates 列表 + 單筆 GET
  if (pathname === '/api/message-templates' && method === 'GET') {
    const label = url.searchParams.get('label')
    let items = mockOptions.message_template.filter(t => t.label === label || !label)
    return { ok: true, data: { templates: items } }
  }
  const tmplMatch = pathname.match(/^\/api\/message-templates\/(\d+)$/)
  if (tmplMatch && method === 'GET') {
    const id = Number(tmplMatch[1])
    const t = mockOptions.message_template.find(x => x.id === id)
    if (!t) return { ok: false, error: { code: 'NOT_FOUND', message: '模板不存在' } }
    return { ok: true, data: t }
  }
  if (tmplMatch && method === 'PUT') {
    const id = Number(tmplMatch[1])
    const idx = mockOptions.message_template.findIndex(x => x.id === id)
    if (idx < 0) return { ok: false, error: { code: 'NOT_FOUND', message: '模板不存在' } }
    const body = JSON.parse(options.body || '{}')
    if (body.body !== undefined && body.body.trim() === '') return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'body 不可為空' } }
    const cur = mockOptions.message_template[idx]
    const updated = {
      ...cur,
      body: body.body ?? cur.body,
      label: body.label ?? cur.label,
    }
    mockOptions.message_template[idx] = updated
    return { ok: true, data: updated }
  }
  // users
  if (pathname === '/api/users' && method === 'GET') {
    return { ok: true, data: mockUsers }
  }
  // vendors
  if (pathname === '/api/vendors' && method === 'GET') {
    return { ok: true, data: mockVendors }
  }
  // 重新產生分享連結（v1.1.5：回傳新 share_url）
  const reshareMatch = pathname.match(/^\/api\/tickets\/(\d+)\/share-token$/)
  if (reshareMatch && method === 'POST') {
    const t = mockTickets.find(x => x.id === Number(reshareMatch[1]))
    const token = 'mock-token-' + (t ? t.id : 'new')
    return { ok: true, data: { share_url: '/share.html?token=' + token } }
  }
  // A9（v1.1.14）：作廢 mock——更新 mockTickets 狀態 + 加時間軸（E2E 驗證狀態/時間軸變化）
  const voidMatch = pathname.match(/^\/api\/tickets\/(\d+)\/void$/)
  if (voidMatch && method === 'POST') {
    const t = mockTickets.find(x => x.id === Number(voidMatch[1]))
    if (!t) return { ok: false, error: { code: 'NOT_FOUND', message: '案件不存在' } }
    if (t.status !== 'open' && t.status !== 'in_progress') {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: '案件狀態已變更，請重新整理' } }
    }
    t.status = 'void'
    t.last_activity_at = new Date().toISOString()
    mockUpdates.unshift({ id: mockUpdates.length + 1, ticket_id: t.id, kind: 'status', status: 'void', note: '', amount: null, display_name: '測試用戶', created_at: new Date().toISOString(), photo_urls: [] })
    return { ok: true, data: { status: 'void' } }
  }
  // A9（v1.1.14）：重新開啟 mock——更新狀態 + 時間軸
  const reopenMatch = pathname.match(/^\/api\/tickets\/(\d+)\/reopen$/)
  if (reopenMatch && method === 'POST') {
    const t = mockTickets.find(x => x.id === Number(reopenMatch[1]))
    if (!t) return { ok: false, error: { code: 'NOT_FOUND', message: '案件不存在' } }
    if (t.status !== 'done' && t.status !== 'void') {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: '僅已結案或已作廢的案件可重新開啟' } }
    }
    const body = JSON.parse(options.body || '{}')
    const target = body.status || 'in_progress'
    // #3（審查）：先記下原狀態再更新，避免 t.status 被覆寫後永遠判為「已作廢」
    const prevLabel = t.status === 'done' ? '已完成' : '已作廢'
    t.status = target
    t.last_activity_at = new Date().toISOString()
    mockUpdates.unshift({ id: mockUpdates.length + 1, ticket_id: t.id, kind: 'status', status: target, note: '重新開啟（原狀態：' + prevLabel + '）', amount: null, display_name: '測試用戶', created_at: new Date().toISOString(), photo_urls: [] })
    return { ok: true, data: { status: target } }
  }
  // A8（v1.1.14）：照片上傳 mock——回傳 {id, url}（attachPhotoPicker 需拿 id）
  if (pathname === '/api/photos' && method === 'POST') {
    const id = 100 + (mockPhotosCount = (mockPhotosCount || 0) + 1)
    return { ok: true, data: { id, url: `/api/photos/${id}` } }
  }
  // 其他 mutation 一律成功
  if (method !== 'GET') {
    return { ok: true, data: { ok: true } }
  }
  // 未知 GET → 空
  return { ok: true, data: [] }
}

async function api(path, options = {}) {
  if (IS_MOCK) return mockApi(path, options)

  const isMutation = ['POST', 'PATCH', 'DELETE', 'PUT'].includes((options.method || 'GET').toUpperCase())
  const headers = { ...(options.headers || {}) }
  if (isMutation) headers['X-Requested-With'] = 'fetch'
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  let res
  try {
    res = await fetch(path, { ...options, headers })
  } catch (e) {
    throw { code: 'NETWORK', message: '網路連線失敗' }
  }

  // 401 → 靜默重登（§3.4）
  if (res.status === 401) {
    const retried = await silentRelogin(path, options, headers)
    if (retried) return retried
    throw { code: 'UNAUTHORIZED', message: '請重新從 LINE 圖文選單開啟本系統' }
  }

  let body
  try { body = await res.json() } catch { body = null }
  if (!res.ok) {
    const err = (body && body.error) || { code: 'UNKNOWN', message: '發生錯誤' }
    throw err
  }
  return body
}

// F3：全域 session 刷新單例，避免平行 401 各自重登（雷鳴群）
let sessionRefreshPromise = null
let loggingIn = false // C1（v1.1.15）：liff.login() 防重複觸發 + 防 silentRelogin 迴圈標記

// C1（v1.1.15）：死循環防護——同一 tab 會話內限制「重新授權」次數。
// 背景：真機 LIFF 在外部瀏覽器 liff.init() 失敗，拿不到新 idToken，只用過期 id_token
// 換 session → 401 → 又 liff.login() → 無限重導。用 sessionStorage 跨頁面記數，
// 超過上限即停止重登並顯示錯誤卡（否則每次 redirect 回來都是新頁、記數歸零，防不了）。
const RELOGIN_KEY = 'loginReloginCount'
const RELOGIN_MAX = 3
function getReloginCount() {
  try { return Number(sessionStorage.getItem(RELOGIN_KEY) || 0) } catch { return 0 }
}
function resetRelogin() {
  try { sessionStorage.removeItem(RELOGIN_KEY) } catch { /* ignore */ }
}
// 嘗試再進行一次重新授權。達上限 → 顯示錯誤卡並回 false（不再跳 OAuth）。
function reloginStart() {
  try {
    const c = getReloginCount()
    if (c >= RELOGIN_MAX) {
      const root = document.getElementById('page')
      if (root) {
        root.innerHTML = ''
        root.appendChild(el('div', { class: 'pending' }, [
          el('h1', { text: '🏘️ 社區修繕系統' }),
          el('p', { text: '登入連線失敗次數過多，請重新整理後再試。' }),
          el('button', { class: 'btn', text: '重新整理', onclick: () => location.reload() }),
        ]))
      }
      return false
    }
    sessionStorage.setItem(RELOGIN_KEY, String(c + 1))
  } catch { /* sessionStorage 不可用 → 放行，避免誤鎖 */ }
  return true
}

async function refreshSession() {
  if (sessionRefreshPromise) return sessionRefreshPromise
  if (loggingIn) return false // C1：正在跳轉登入中，直接回 false 不重入
  loggingIn = true // C1：進函式最前即鎖定，避免平行二次 POST
  sessionRefreshPromise = (async () => {
    if (!liffReady || !window.liff) return false
    if (!liff.isLoggedIn()) {
      // 不指定 redirectUri，讓 LIFF SDK 用 LIFF app 設定的 Endpoint URL（避免部署網域變動造成不符）
      if (!reloginStart()) return false // 達上限 → 顯示錯誤卡，不再跳 OAuth
      try { liff.login() } catch { /* login 會整頁導走 */ }
      return false
    }
    const idToken = liff.getIDToken()
    if (!idToken) return false
    // §3.1 標準流程：用 id_token 換 session cookie；後端拒收（401）＝ token 已過期/失效。
    if (await postSession(idToken)) { resetRelogin(); return true }
    // v1.1.17：session 重建失敗 → liff.logout() 清 LIFF 快取後強制重新授權（LINE 官方標準流程）。
    // 過期 token 存在 LIFF 快取裡，liff.login() 對「已登入」狀態是 no-op；先 logout 才會真正重登。
    return forceFreshLogin()
  })().finally(() => { sessionRefreshPromise = null; loggingIn = false })
  return sessionRefreshPromise
}

// §3.1 用 id_token 換 session（POST /api/auth/session）。回 true＝cookie 已建立、token 有效。
async function postSession(idToken) {
  if (!idToken || !liffReady || !window.liff) return false
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, // A7：CSRF header
    body: JSON.stringify({ id_token: idToken }),
  })
  return res.ok
}

// §3.1 token 過期失效時，先 liff.logout() 清 LIFF 快取（LINE 官方），再強制重新授權。
// logout 後 isLoggedIn() 為 false → 下次進 boot/refreshSession 走 liff.login() 完整 OAuth，拿真正新 token，
// 不必手動清瀏覽器資料。（受 C1 reloginStart 計數保護）
function forceFreshLogin() {
  try { if (typeof window.liff.logout === 'function') window.liff.logout() } catch { /* ignore */ }
  if (!reloginStart()) return false // 達上限 → 顯示錯誤卡，不再跳 OAuth
  try { window.liff.login() } catch { /* login 會整頁導走 */ }
  return true
}

// §3.4 靜默重登：刷新 session → 重送原請求一次
async function silentRelogin(path, options, headers) {
  // C1（v1.1.15）：若正在跳轉登入中（loggingIn）→ 不重入 refreshSession 避免迴圈
  if (loggingIn) return null
  try {
    const ok = await refreshSession()
    if (!ok) return null
    // 重送原請求一次
    const retry = await fetch(path, { ...options, headers })
    if (retry.status === 401) return null
    let body
    try { body = await retry.json() } catch { body = null }
    // D3：重試後若回 400/500，body 是 {ok:false}，呼叫端會當成功讀 b.data → 崩潰。檢查 body.ok
    if (!body || body.ok === false) return null
    return body
  } catch {
    return null
  }
}

// ---- 工具 ----
// 照片壓縮（§5.0：最長邊 1280px、目標 ≤500KB、輸出 JPEG；解碼失敗顯示提示）
// maxSizeMB 是「目標大小」，設 0.5 會迭代壓縮到 ≤500KB（2MB 照片約縮到 200KB）
async function compressPhoto(file) {
  if (!window.imageCompression) return file
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1280,
      initialQuality: 0.7,
      useWebWorker: true,
      fileType: 'image/jpeg',
    })
    return compressed
  } catch (e) {
    // 已在此 toast（照片格式無法處理），掛標記避免上層 attachPhotoPicker 重複 toast
    toast('此照片格式無法處理，請改用相機拍攝或先在相簿轉存')
    if (e && typeof e === 'object') e.toasted = true
    throw e
  }
}

// 共用照片選擇器（v1.1.13：建單/留言框/編輯 三處共用，避免重複邏輯）
// photos：外部持有的照片 id 陣列（mutable），函式會同步 push/splice 維持清單
// initialPhotos：選填 [{id, url}]，編輯頁的既有照片（自動加入清單並顯示）
// 回傳 { input, preview }，呼叫端把 input/preview 放進表單，submit 時讀 photos 陣列
function attachPhotoPicker(photos, initialPhotos = []) {
  const input = el('input', { type: 'file', accept: 'image/*', multiple: 'true' })
  const preview = el('div', { class: 'photo-preview' })
  function addThumb(pid, url) {
    const wrap = el('div', { class: 'photo-thumb' }, [
      thumb(url),
      el('button', { class: 'thumb-del', text: '✕', onclick: () => {
        const idx = photos.indexOf(pid)
        if (idx >= 0) photos.splice(idx, 1)
        wrap.remove()
      } }),
    ])
    preview.appendChild(wrap)
  }
  for (const p of initialPhotos) { photos.push(p.id); addThumb(p.id, p.url) }
  input.addEventListener('change', async () => {
    // E1：先算「已上傳 + 本次選取」是否超過 5，超過則阻斷（避免傳到 R2 才被拒）
    if (photos.length + input.files.length > 5) {
      toast('最多上傳 5 張照片')
      input.value = ''
      return
    }
    for (const file of input.files) {
      try {
        const compressed = await compressPhoto(file)
        const fd = new FormData()
        fd.append('file', compressed)
        const b = await api('/api/photos', { method: 'POST', body: fd })
        photos.push(b.data.id)
        addThumb(b.data.id, b.data.url)
      } catch (e) {
        // A3（v1.1.15）：只有 NETWORK 類錯誤允許吞掉（單張失敗不擋其他張），
        // 其他錯誤（壓縮失敗、上傳 400 等）一律 toast，避免使用者無感卡住。
        // 壓縮失敗已在 compressPhoto 內 toast 過（e.toasted），不重複顯示。
        if (e && e.code === 'NETWORK') continue
        if (e && e.toasted) continue
        toast(e?.message || '照片處理失敗')
      }
    }
    input.value = ''
  })
  return { input, preview }
}

// G3：判斷文字是否已含某附加片段（以「、」為分隔的獨立項目，避免子字串誤判）
// 建單與留言框共用，需為全域（原先誤放在 pages.new 內導致留言框 ReferenceError）
function hasSegment(cur, label) {
  if (!cur) return false
  return cur.split('、').some((s) => s.trim() === label)
}

// A4（v1.1.15）：el() 事件名白名單——拼錯事件名（如 onfoo）開發期 console.warn 提示
// **dev-only**：production 不掛（依業主決策 2026-08-23：console noise 也算影響）
// 判斷：hostname 為 localhost / 127.0.0.1 / 帶 ?dev=1 query / mock 模式 → dev
const IS_DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ||
               new URLSearchParams(location.search).has('dev') ||
               new URLSearchParams(location.search).get('mock') === 'true'
const EL_VALID_EVENTS = new Set([
  'click','dblclick','mousedown','mouseup','mouseover','mouseout','mousemove','mouseenter','mouseleave',
  'keydown','keyup','keypress','input','change','submit','reset','focus','blur','focusin','focusout',
  'load','unload','beforeunload','resize','scroll','wheel',
  'touchstart','touchend','touchmove','touchcancel',
  'drag','dragstart','dragend','dragover','dragenter','dragleave','drop',
  'animationstart','animationend','animationiteration',
  'transitionend','transitionstart','transitionrun','transitioncancel',
  'pointerdown','pointerup','pointermove','pointerover','pointerout','pointerenter','pointerleave','pointercancel',
  'contextmenu','auxclick','paste','copy','cut',
])

function el(tag, attrs = {}, children = []) {  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue // 跳過 null/undefined
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else if (k === 'selected') node.selected = !!v
    else if (k === 'value') node.value = v // textarea/select 用 property（setAttribute 對 textarea 無效）
    else if (k.startsWith('on')) {
      const ev = k.slice(2)
      if (IS_DEV && !EL_VALID_EVENTS.has(ev)) {
        console.warn(`[el] 未知事件名「${k}」（slice 後「${ev}」不在白名單）。常見拼錯：onclick/onchange/oninput/onkeydown/onmouseover 等。請檢查拼字。`)
      }
      node.addEventListener(ev, v)
    }
    else node.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
}

function statusBadge(status) {
  // v1.1.12：open 改「詢價中」；in_progress「處理中」維持（代表已發包）
  const map = { open: ['詢價中', 'red'], in_progress: ['處理中', 'yellow'], done: ['已完成', 'green'], void: ['已作廢', 'black'] }
  const [label, color] = map[status] || [status, 'gray']
  return el('span', { class: `badge badge-${color}`, text: label })
}

// 問題16：縮圖點開放大（lightbox）
// E2：複製文字，LIFF WebView 用 navigator.clipboard，失敗 fallback execCommand，成功 toast「已複製」
function copyText(text) {
  const done = () => toast('已複製')
  const fallback = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      if (ok) done()
      else toast('複製失敗，請長按手動複製')
    } catch {
      toast('複製失敗，請長按手動複製')
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback)
  } else {
    fallback()
  }
}
// E2：輕量 toast 提示（自動消失）
function toast(msg) {
  let t = document.querySelector('.toast')
  if (!t) {
    t = el('div', { class: 'toast' })
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._timer)
  t._timer = setTimeout(() => t.classList.remove('show'), 1500)
}

function openLightbox(src) {
  const mask = el('div', { class: 'lightbox', onclick: () => mask.remove() }, [
    el('img', { src, class: 'lightbox-img' }),
  ])
  document.body.appendChild(mask)
}
function thumb(src) {
  return el('img', { src, class: 'thumb', onclick: (e) => { e.stopPropagation(); openLightbox(src) } })
}

// ---- 頁面渲染 ----
const pages = {}
// 全域選項快取（v1.1.7）
// 依「後端是否驗證」分層：
//  - 建單/編輯（category/location 會 400）→ ensureCatalog(true) 用短 TTL（30 秒）
//  - 留言/列表（純 UI，不驗證）→ ensureCatalog() 用長 TTL（10 分鐘）
// v1.1.8：建單/編輯由「每次強制重讀」改為「短 TTL」，避免每次進頁都吃一次 D1 連線延遲
let catalogCache = null
let catalogLoadedAt = 0
let catalogLoading = null
const CATALOG_TTL = 10 * 60 * 1000 // 一般（列表/留言）：10 分鐘
const CATALOG_TTL_STRICT = 30 * 1000 // 建單/編輯（後端驗證）：30 秒
async function ensureCatalog(force) {
  const ttl = force ? CATALOG_TTL_STRICT : CATALOG_TTL
  if (catalogCache && Date.now() - catalogLoadedAt < ttl) return catalogCache
  if (catalogLoading) return catalogLoading
  catalogLoading = api('/api/options/catalog').then((b) => {
    catalogCache = b.data
    catalogLoadedAt = Date.now()
    return catalogCache
  }).finally(() => { catalogLoading = null })
  return catalogLoading
}

// 共用載入指示（v1.1.9：各頁面 await API 時避免白屏；v1.1.15 D9 加 200ms 防抖）
const LOADING_DELAY_MS = 200
function renderLoading(root, text) {
  root.innerHTML = ''
  // D9：200ms 內完成的請求不顯示 spinner，避免快速切換 Tab 時的視覺閃爍
  root._loadingTimer = setTimeout(() => {
    root._loadingTimer = null
    root.appendChild(el('div', { class: 'loading-wrap' }, [
      el('div', { class: 'spinner' }),
      el('div', { class: 'loading-text', text: text || '載入中…' }),
    ]))
  }, LOADING_DELAY_MS)
}
function clearLoading(root) {
  if (root._loadingTimer) { clearTimeout(root._loadingTimer); root._loadingTimer = null }
  root.querySelector('.loading-wrap')?.remove()
}

// 空狀態（Empty State）：列表無資料時統一提示，避免白畫面
function renderEmpty(root, text) {
  root.appendChild(el('p', { class: 'empty-state', text: text || '沒有符合條件的項目' }))
}

// 當月 YYYY-MM（台灣時區）
function taipeiMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).format(new Date())
}

// P0 等待開通頁（§5.0.1）
pages.pending = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('div', { class: 'pending' }, [
    el('h1', { text: '🏘️ 社區修繕系統' }),
    el('p', { text: `您好，${me ? me.display_name : ''}` }),
    el('p', { text: '您的帳號等待開通中' }),
    el('p', { text: '請通知管理公司審核' }),
    el('button', { class: 'btn', text: '重新整理', onclick: () => boot() }),
  ]))
  // D8（v1.1.15）：每 5 秒輪詢 /api/auth/me，被開通自動進系統
  if (root._pendingTimer) clearInterval(root._pendingTimer)
  root._pendingTimer = setInterval(async () => {
    try {
      const body = await api('/api/auth/me')
      if (body.data && body.data.role !== 'pending') {
        clearInterval(root._pendingTimer); root._pendingTimer = null
        me = body.data
        router()
      }
    } catch (_) { /* 401/網路錯誤忽略，繼續輪 */ }
  }, 5000)
}

// P1 案件列表（§5.1）
pages.list = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  const tabs = [
    ['active', '未結'], ['open', '詢價'], ['in_progress', '處理'],
    ['done', '完成'], ['void', '作廢'], ['all', '全部'],
  ]
  let currentStatus = 'active'
  let currentCategory = ''
  let page = 1
  let hasMore = false

  const listEl = el('div', { class: 'ticket-list' })
  const loadMoreBtn = el('button', { class: 'btn btn-ghost', text: '載入更多', style: 'display:none', onclick: loadMore })

  async function load() {
    const qs = new URLSearchParams({ status: currentStatus, page: String(page), limit: '20' })
    if (currentCategory) qs.set('category_id', currentCategory)
    // 首次載入或切換篩選（page=1）時顯示 loading；載入更多（page>1）不遮已有列表
    if (page === 1) {
      listEl.innerHTML = ''
      listEl.appendChild(el('div', { class: 'loading-wrap' }, [
        el('div', { class: 'spinner' }),
        el('div', { class: 'loading-text', text: '載入中…' }),
      ]))
    }
    try {
      const body = await api('/api/tickets?' + qs.toString())
      const items = body.data.items
      hasMore = body.data.has_more
      if (page === 1) listEl.innerHTML = '' // 清掉 loading
      for (const t of items) {
        listEl.appendChild(renderTicketCard(t))
      }
      if (items.length === 0 && page === 1) {
        renderEmpty(listEl, '沒有符合條件的案件') // 空狀態
      }
      loadMoreBtn.style.display = hasMore ? '' : 'none'
    } catch (e) {
      if (page === 1) listEl.innerHTML = '' // 清掉 loading
      listEl.appendChild(el('p', { class: 'error', text: e.message }))
    }
  }

  function renderTicketCard(t) {
    const stale = (t.status === 'open' || t.status === 'in_progress') &&
      (Date.now() - new Date(t.last_activity_at).getTime() > 7 * 24 * 3600 * 1000)
    const staleDays = Math.floor((Date.now() - new Date(t.last_activity_at).getTime()) / (24 * 3600 * 1000))
    // v1.1.13：標題後補「建立至今 N 天」顯示 (N 天)；建立/最後活動只顯示日期（省空間、同行）
    // 用「日曆日差」（台灣時區）而非 24 小時差：昨天建的顯示 1 天、今天建的顯示 0 天
    const dateOnly = (iso) => { const d = new Date(iso); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` }
    const dayDiff = (iso) => {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return 0
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfCreated = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      return Math.round((startOfToday - startOfCreated) / (24 * 3600 * 1000))
    }
    const createdDays = dayDiff(t.created_at)
    const age = `(${createdDays} 天)`
    return el('div', { class: 'card ticket-card', onclick: () => { location.hash = '#/ticket/' + t.id } }, [
      el('div', { class: 'ticket-title' }, [statusBadge(t.status), el('span', { text: `${t.title} ${age}`.trim() })]),
      t.description ? el('div', { class: 'ticket-desc', text: t.description }) : null,
      el('div', { class: 'ticket-meta', text: `廠商：${t.vendor_name || '未指派'}` }),
      el('div', { class: 'ticket-meta', text: `建立 ${dateOnly(t.created_at)} · 最後活動 ${dateOnly(t.last_activity_at)}` }),
      stale ? el('div', { class: 'stale', text: `⚠ ${staleDays} 天未更新` }) : null,
    ])
  }

  function loadMore() {
    if (loadMoreBtn.disabled) return // E3：請求期間防重複點擊
    loadMoreBtn.disabled = true
    page++
    load().finally(() => { loadMoreBtn.disabled = false })
  }

  // 標題列 + tabs
  root.appendChild(el('header', { class: 'topbar' }, [
    el('h1', { text: '🏘️ 社區修繕系統' }),
    el('button', { class: 'btn', text: '＋ 建單', onclick: () => { location.hash = '#/new' } }),
  ]))

  const tabBar = el('div', { class: 'tabs' })
  for (const [val, label] of tabs) {
    tabBar.appendChild(el('button', {
      class: 'tab' + (val === currentStatus ? ' active' : ''),
      text: label,
      onclick: (e) => {
        currentStatus = val
        page = 1
        listEl.innerHTML = ''
        for (const b of tabBar.children) b.classList.remove('active')
        e.currentTarget.classList.add('active')
        load()
      },
    }))
  }
  root.appendChild(tabBar)

  // 類別篩選
  const catSelect = el('select', { class: 'select', onchange: (e) => { currentCategory = e.target.value; page = 1; listEl.innerHTML = ''; load() } })
  catSelect.appendChild(el('option', { value: '', text: '全部分類' }))
  ensureCatalog().then(() => {
    for (const o of (catalogCache?.categories || [])) catSelect.appendChild(el('option', { value: String(o.id), text: o.label }))
  }).catch(() => {})
  root.appendChild(el('div', { class: 'filter-row' }, [el('label', { text: '分類：' }), catSelect]))

  root.appendChild(listEl)
  root.appendChild(loadMoreBtn)
  load()
}

// P2 建單（§5.2）
pages.new = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  const selectedPhotos = []
  let zeroAssocRetried = false // F6：零關聯類別只重抓一次，避免無限 alert
  const descEl = el('textarea', { class: 'textarea', placeholder: '說明（選填）' })

  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '建單' }),
  ]))

  // ---- 使用全域選項快取（v1.1.7，進建單頁才確保讀取一次）----
  const catSelect = el('select', { class: 'select' })
  catSelect.appendChild(el('option', { value: '', text: '載入類別中…' }))
  let selectedCat = null

  // 本地過濾：回該類別關聯＋通用
  const filterByCat = (type, catId) => {
    const items = (catalogCache || { categories: [], locations: [], descriptions: [] })[type] || []
    return items.filter(o => {
      if (o.category_ids.length === 0) return true // 通用
      return o.category_ids.includes(catId)
    })
  }

  // 地點下拉（依類別本地過濾，未選類別 disabled）
  const locSelect = el('select', { class: 'select' })
  let selectedLoc = null
  const resetLoc = (msg) => {
    locSelect.innerHTML = ''
    locSelect.appendChild(el('option', { value: '', text: msg }))
    selectedLoc = null
  }
  const renderLoc = (catId) => {
    const items = filterByCat('locations', catId)
    if (items.length === 0) {
      resetLoc('此類別暫無地點')
      locSelect.disabled = true
      return
    }
    resetLoc('請選擇地點')
    for (const o of items) {
      locSelect.appendChild(el('option', { value: String(o.id), text: o.label }))
    }
    locSelect.disabled = false
  }
  resetLoc('請先選擇類別')
  locSelect.disabled = true
  locSelect.addEventListener('change', (e) => { selectedLoc = e.target.value ? Number(e.target.value) : null })

  // 使用範本（依類別本地過濾，未選類別 disabled）— 輔助，選填，放在說明底下
  const descSelect = el('select', { class: 'select' })
  descSelect.appendChild(el('option', { value: '', text: '請先選擇類別' }))
  descSelect.disabled = true
  const renderDesc = (catId) => {
    descSelect.innerHTML = ''
    descSelect.appendChild(el('option', { value: '', text: '使用範本…' }))
    for (const o of filterByCat('descriptions', catId)) {
      descSelect.appendChild(el('option', { value: o.label, text: o.label }))
    }
    descSelect.disabled = false
  }

  // 建單頁：強制重讀（category/location 後端驗證，資料須最新，避免 400）
  ensureCatalog(true).then(() => {
    catSelect.innerHTML = ''
    catSelect.appendChild(el('option', { value: '', text: '請選擇類別' }))
    const cats = (catalogCache?.categories) || []
    for (const o of cats) {
      catSelect.appendChild(el('option', { value: String(o.id), text: o.label }))
    }
  }).catch(() => {
    // catalog 載入失敗：恢復可選狀態並提示（避免卡在「載入類別中…」）
    catSelect.innerHTML = ''
    catSelect.appendChild(el('option', { value: '', text: '載入類別失敗，請重整頁面' }))
  })

  // 選類別：本地過濾；若該類別無關聯（全空），提示並重新讀取最新
  catSelect.addEventListener('change', async (e) => {
    selectedCat = e.target.value ? Number(e.target.value) : null
    if (!selectedCat) {
      resetLoc('請先選擇類別'); locSelect.disabled = true
      descSelect.innerHTML = ''; descSelect.appendChild(el('option', { value: '', text: '請先選擇類別' })); descSelect.disabled = true
      return
    }
    const locs = filterByCat('locations', selectedCat)
    const descs = filterByCat('descriptions', selectedCat)
    // F6：僅在「快取可能過期」時重抓一次；重抓後仍空則改為非阻斷提示，不再重複 alert
    if ((locs.length === 0 || descs.length === 0) && !zeroAssocRetried) {
      zeroAssocRetried = true
      try {
        await ensureCatalog(true) // 強制重新讀取最新
      } catch (err) { /* 保持原資料 */ }
    }
    renderLoc(selectedCat)
    renderDesc(selectedCat)
  })

  const descAddBtn = el('button', { class: 'btn', text: '＋ 附加', onclick: () => {
    const label = descSelect.value
    if (!label) return
    const cur = descEl.value
    if (hasSegment(cur, label)) return
    descEl.value = cur ? cur + '、' + label : label
    descSelect.value = ''
  } })
  const descRow = el('div', { class: 'add-row' }, [descSelect, descAddBtn])

  // 照片上傳（E1：累積計數 ≤5、縮圖可刪除；共用 photo picker）
  const photoPicker = attachPhotoPicker(selectedPhotos)
  const photoInput = photoPicker.input
  const photoPreview = photoPicker.preview

  let submitting = false // D5：防重複點擊
  async function submit() {
    if (submitting) return
    if (!selectedCat || !selectedLoc) { toast('請選擇類別與地點'); return }
    submitting = true
    // A6（v1.1.15）：送單前主動確保 catalog 最新（避免使用停用選項 400）。
    // 重抓失敗用既有快取值頂著，不 throw 不擋送出（頂多選項非最新，後端會 400 再走 catch）。
    try { await ensureCatalog(true) } catch (_) { /* 保持既有快取值 */ }
    try {
      const body = await api('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          category_id: selectedCat,
          location_id: selectedLoc,
          description: descEl.value || undefined,
          photo_ids: selectedPhotos.length ? selectedPhotos : undefined,
        }),
      })
      location.hash = '#/ticket/' + body.data.id
    } catch (e) {
      submitting = false
      toast(e.message + '，已重新載入最新選項，請重新選擇')
      // 400 後強制重讀 catalog 更新下拉（不重整頁面，保留已輸入資料）
      try {
        await ensureCatalog(true)
        catSelect.innerHTML = ''
        catSelect.appendChild(el('option', { value: '', text: '請選擇類別' }))
        for (const o of (catalogCache?.categories || [])) catSelect.appendChild(el('option', { value: String(o.id), text: o.label }))
        if (selectedCat) { renderLoc(selectedCat); renderDesc(selectedCat) }
      } catch (err) { /* 重讀失敗則保持原狀 */ }
    }
  }

  clearLoading(root)

  root.appendChild(el('div', { class: 'form' }, [
    el('label', { text: '類別' }), catSelect,
    el('label', { text: '地點' }), locSelect,
    el('label', { text: '說明' }), descEl,
    descRow,
    el('label', { text: '照片' }), photoInput, photoPreview,
    el('button', { class: 'btn btn-primary', text: '送出建單', onclick: submit }),
  ]))
}

// P3 案件詳情（§5.3）
pages.ticket = async function (id) {
  const root = document.getElementById('page')
  renderLoading(root, '載入案件…')

  let body
  try {
    body = await api('/api/tickets/' + id)
  } catch (e) {
    clearLoading(root)
    root.appendChild(el('p', { class: 'error', text: e.message }))
    return
  }
  const t = body.data

  // ---- 權限 ----
  const isMgr = me && (me.role === 'manager' || me.role === 'admin')
  const canStatus = isMgr && (t.status === 'open' || t.status === 'in_progress')
  const canShare = !!me
  const canEdit = t.can_edit   // E1 方案B：後端已算好（manager/admin 全改、committee 僅自己建的單）
  const canVoid = me && (me.role === 'manager' || me.role === 'admin')
  const canReopen = me && me.role === 'admin' && (t.status === 'done' || t.status === 'void')
  const canReshare = me && (me.role === 'manager' || me.role === 'admin')
  const canDo = canShare || canEdit || canVoid || canReopen || canReshare

  // ---- Topbar：返回 + 標題 + 右上 ⋮（點 ⋮ 才建選單）----
  const topbar = el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '案件詳情' }),
  ])
  if (canDo) {
    const menuBtn = el('button', { class: 'btn btn-ghost btn-icon', text: '⋮' })
    menuBtn.addEventListener('click', () => {
      const overlay = el('div', { class: 'menu-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove() } })
      const menu = el('div', { class: 'menu-popover' })
      let shareInput = null
      if (canShare) {
        shareInput = el('input', { class: 'input', value: location.origin + t.share_url, readonly: 'true' })
        menu.appendChild(el('div', { class: 'menu-item' }, [
          el('span', { text: '分享連結' }),
          el('div', { class: 'share-row' }, [
            shareInput,
            el('button', { class: 'btn', text: '複製', onclick: () => copyText(shareInput.value) }),
          ]),
        ]))
      }
      if (canEdit && (t.status === 'open' || t.status === 'in_progress')) {
        menu.appendChild(el('button', { class: 'menu-item', text: '✏️ 編輯案件', onclick: () => { overlay.remove(); location.hash = `#/edit/${id}` } }))
      }
      if (canVoid && (t.status === 'open' || t.status === 'in_progress')) {
        menu.appendChild(el('button', { class: 'menu-item danger', text: '🗑 作廢案件', onclick: async () => {
          overlay.remove()
          const note = prompt('作廢原因（選填）')
          if (note === null) return
          if (!confirm('確定作廢此案件？')) return
          try { await api(`/api/tickets/${id}/void`, { method: 'POST', body: JSON.stringify({ note: note || undefined }) }); router() /* A5 v1.1.15：局部刷新 */ }
          catch (e) { toast(e.message) }
        } }))
      }
      if (canReopen) {
        menu.appendChild(el('button', { class: 'menu-item', text: '↩️ 重新開啟', onclick: () => {
          overlay.remove()
          const sel = el('select', { class: 'select' })
          sel.appendChild(el('option', { value: 'in_progress', text: '處理中' }))
          sel.appendChild(el('option', { value: 'open', text: '待處理' }))
          const noteEl = el('textarea', { class: 'textarea', placeholder: '備註（選填）' })
          const modal = el('div', { class: 'modal-mask' }, [
            el('div', { class: 'modal' }, [
              el('h3', { text: '重新開啟案件' }),
              el('label', { text: '狀態' }), sel,
              el('label', { text: '備註' }), noteEl,
              el('div', { class: 'modal-actions' }, [
                el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => modal.remove() }),
                el('button', { class: 'btn btn-primary', text: '確認重新開啟', onclick: async () => {
                  try { await api(`/api/tickets/${id}/reopen`, { method: 'POST', body: JSON.stringify({ status: sel.value, note: noteEl.value || undefined }) }); router() /* A5 v1.1.15：局部刷新 */ }
                  catch (e) { toast(e.message) }
                } }),
              ]),
            ]),
          ])
          document.body.appendChild(modal)
        } }))
      }
      if (canReshare) {
        menu.appendChild(el('button', { class: 'menu-item', text: '🔄 重新產生分享連結', onclick: async () => {
          try {
            const b = await api(`/api/tickets/${id}/share-token`, { method: 'POST' })
            if (shareInput) shareInput.value = location.origin + b.data.share_url
          } catch (e) { toast(e.message) }
        } }))
      }
      overlay.appendChild(menu)
      document.body.appendChild(overlay)
    })
    topbar.appendChild(menuBtn)
  }
  clearLoading(root)
  root.appendChild(topbar)

  // ---- 案件資訊（緊湊）----
  const info = el('div', { class: 'card ticket-detail' }, [
    el('div', { class: 'detail-head' }, [
      el('h2', { text: t.title }),
      statusBadge(t.status),
    ]),
    el('p', { class: 'detail-line', text: `類別：${t.category_label}｜地點：${t.location_label}` }),
    el('p', { class: 'detail-line', text: `廠商：${t.vendor_name || '未指派'}` }),
    t.amount != null ? el('p', { class: 'detail-line amount-line', text: `發包金額：$${t.amount.toLocaleString()}` }) : null,
    t.description ? el('p', { class: 'desc', text: t.description }) : null,
    el('p', { class: 'meta', text: `建立 ${fmtTime(t.created_at)} · 最後活動 ${fmtTime(t.last_activity_at)}` }),
  ])
  root.appendChild(info)

  // ---- 照片牆（F7：主照片也用 thumb() 支援 Lightbox，與時間軸一致）----
  if (t.photos && t.photos.length) {
    const wall = el('div', { class: 'photo-wall' })
    for (const p of t.photos) wall.appendChild(thumb(p.url)) // v1.1.13：photos 為 {id,url}
    root.appendChild(wall)
  }

  // ---- 時間軸（主角）----
  root.appendChild(el('h3', { class: 'section-title', text: '時間軸' }))
  const timeline = el('div', { class: 'timeline' })
  for (const u of t.updates) timeline.appendChild(renderUpdate(u))
  root.appendChild(timeline)

  // ---- 隱藏式留言/回報（點按鈕展開）----
  const commentWrap = el('div', { class: 'comment-hidden' })
  const commentToggle = el('button', { class: 'btn btn-primary btn-block', text: canStatus ? '💬 留言／回報' : '💬 留言', onclick: () => {
    if (commentWrap.style.display === 'block') { commentWrap.style.display = 'none'; commentToggle.textContent = canStatus ? '💬 留言／回報' : '💬 留言'; return }
    commentWrap.style.display = 'block'
    commentToggle.textContent = '收起'
  } })
  const commentInput = el('textarea', { class: 'textarea', placeholder: '留言…' })
  const commentPhotos = []
  let commentSubmitting = false // D5：防重複點擊
  // 共用 photo picker（v1.1.13）
  const commentPicker = attachPhotoPicker(commentPhotos)
  const commentFile = commentPicker.input
  const commentPreview = commentPicker.preview

  // 回報範本下拉＋附加（manager/admin，v1.1.9；改 type='comment_desc'，通用不依類別過濾）
  let commentDescRow = null
  if (isMgr) {
    const cDescSelect = el('select', { class: 'select' })
    cDescSelect.appendChild(el('option', { value: '', text: '選擇回報範本…' }))
    ensureCatalog().then(() => {
      const allDescs = (catalogCache?.comment_descs) || []
      for (const o of allDescs) {
        cDescSelect.appendChild(el('option', { value: o.label, text: o.label }))
      }
    }).catch(() => {})
    const cDescAdd = el('button', { class: 'btn', text: '＋ 附加', onclick: () => {
      const label = cDescSelect.value
      if (!label) return
      const cur = commentInput.value
      if (hasSegment(cur, label)) return
      commentInput.value = cur ? cur + '、' + label : label
      cDescSelect.value = ''
    } })
    commentDescRow = el('div', { class: 'add-row' }, [cDescSelect, cDescAdd])
  }
  const statusSelect = el('select', { class: 'select' })
  statusSelect.appendChild(el('option', { value: '', text: '僅留言（不更新狀態）' }))
  if (canStatus) {
    // F3（v1.1.14 決策）：依案件狀態決定可轉移目標
    //   open→[in_progress,done]；in_progress→[in_progress(多次發包覆寫),done]
    if (t.status === 'open') {
      statusSelect.appendChild(el('option', { value: 'in_progress', text: '🟡 標記已發包' }))
      statusSelect.appendChild(el('option', { value: 'done', text: '🟢 標記完成並結案' }))
    } else if (t.status === 'in_progress') {
      statusSelect.appendChild(el('option', { value: 'in_progress', text: '🟡 更新發包金額' }))
      statusSelect.appendChild(el('option', { value: 'done', text: '🟢 標記完成並結案' }))
    }
  }
  // v1.1.12：選「已發包」時顯示金額輸入框（必填）
  const amountInput = el('input', { type: 'number', class: 'input', placeholder: '發包金額（必填）', style: 'display:none' })
  statusSelect.addEventListener('change', () => {
    amountInput.style.display = statusSelect.value === 'in_progress' ? '' : 'none'
  })
  const fileRow = el('div', { class: 'file-row' }, [
    commentFile,
    el('span', { text: '可附照片' }),
  ])
  commentWrap.appendChild(el('div', { class: 'comment-box' }, [
    commentInput,
    commentDescRow,
    fileRow,
    commentPreview,
    canStatus ? statusSelect : null,
    canStatus ? amountInput : null,
    el('button', { class: 'btn btn-primary', text: '送出', onclick: async () => {
      if (commentSubmitting) return // D5：防重複點擊
      if (!commentInput.value.trim()) { toast('請輸入留言'); return }
      const status = statusSelect.value
      if (status === 'done' && !confirm('標記為已完成並結案？')) return
      // v1.1.12：已發包必填金額
      if (status === 'in_progress' && (!amountInput.value || Number(amountInput.value) <= 0)) {
        toast('已發包需填寫金額'); return
      }
      commentSubmitting = true
      try {
        if (status) {
          const payload = { status, note: commentInput.value.trim(), photo_ids: commentPhotos.length ? commentPhotos : undefined }
          if (status === 'in_progress') payload.amount = Number(amountInput.value)
          await api(`/api/tickets/${id}/updates`, { method: 'POST', body: JSON.stringify(payload) })
        } else {
          await api(`/api/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ note: commentInput.value.trim(), photo_ids: commentPhotos.length ? commentPhotos : undefined }) })
        }
        // A5（v1.1.15）：不再 location.reload()，改用 router() 局部刷新時間軸
        router()
      } catch (e) { commentSubmitting = false; toast(e.message) }
    } }),
  ]))
  commentWrap.style.display = 'none'
  root.appendChild(commentToggle)
  root.appendChild(commentWrap)
}

function renderUpdate(u) {
  if (u.kind === 'comment') {
    return el('div', { class: 'update comment' }, [
      el('div', { class: 'update-head', text: `💬 ${u.display_name || ''} · ${fmtTime(u.created_at)}` }),
      el('div', { class: 'update-body', text: u.note }),
      ...(u.photo_urls || []).map((p) => thumb(p)),
    ])
  }
  if (u.kind === 'system') {
    // v1.1.14：system 留痕顯示實際操作者（編輯者）名字；無名字時 fallback「系統」
    return el('div', { class: 'update system' }, [
      el('div', { class: 'update-head', text: `${u.display_name || '系統'} · ${fmtTime(u.created_at)}` }),
      el('div', { class: 'update-body', text: u.note }),
    ])
  }
  // status
  return el('div', { class: 'update status' }, [
    el('div', { class: 'update-head' }, [statusBadge(u.status), el('span', { text: ` ${u.display_name || ''} · ${fmtTime(u.created_at)}` })]),
    u.amount != null ? el('div', { class: 'update-body amount-line', text: `發包金額：$${u.amount.toLocaleString()}` }) : null,
    u.note ? el('div', { class: 'update-body', text: u.note }) : null,
    ...(u.photo_urls || []).map((p) => thumb(p)),
  ])
}

// P3.5 編輯案件（問題5：詳情頁「編輯」原本跳 #/edit 但無此頁面）
pages.edit = async function (id) {
  const root = document.getElementById('page')
  renderLoading(root, '載入案件…')
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/ticket/' + id } }),
    el('h1', { text: '編輯案件' }),
  ]))

  let t
  try {
    const body = await api('/api/tickets/' + id)
    t = body.data
  } catch (e) {
    // E4（v1.1.14）：錯誤時清 loading，避免「載入案件」與錯誤訊息並存
    clearLoading(root)
    root.appendChild(el('p', { class: 'error', text: e.message }))
    return
  }

  const catSelect = el('select', { class: 'select' })
  const locSelect = el('select', { class: 'select' })
  // D2：編輯頁地點依類別連動（比照建單頁），避免選到不屬類別的地點送出 400
  const filterByCat = (type, catId) => {
    const items = (catalogCache || { categories: [], locations: [], descriptions: [] })[type] || []
    return items.filter(o => {
      if (o.category_ids.length === 0) return true // 通用
      return o.category_ids.includes(catId)
    })
  }
  const renderLoc = (catId) => {
    locSelect.innerHTML = ''
    locSelect.appendChild(el('option', { value: '', text: '請選擇地點' }))
    for (const o of filterByCat('locations', catId)) {
      locSelect.appendChild(el('option', { value: String(o.id), text: o.label, selected: o.label === t.location_label ? 'selected' : null }))
    }
  }
  // 編輯頁：強制重讀（category/location 後端驗證），一次載入
  ensureCatalog(true).then(() => {
    for (const o of (catalogCache?.categories || [])) {
      catSelect.appendChild(el('option', { value: String(o.id), text: o.label, selected: o.label === t.category_label ? 'selected' : null }))
    }
    // 依目前類別渲染地點（D2）
    const curCat = (catalogCache?.categories || []).find(o => o.label === t.category_label)
    renderLoc(curCat ? curCat.id : 0)
  }).catch(() => {
    // catalog 載入失敗：恢復可選狀態並提示（避免卡在「載入類別中…」）
    catSelect.innerHTML = ''
    catSelect.appendChild(el('option', { value: '', text: '載入類別失敗，請重整頁面' }))
  })
  // D2：切換類別時連動地點
  catSelect.addEventListener('change', () => {
    const catId = catSelect.value ? Number(catSelect.value) : 0
    renderLoc(catId)
  })

  const descEl = el('textarea', { class: 'textarea', value: t.description || '' })

  // 照片管理（v1.1.13）：顯示既有 + 可刪除 + 可補上傳；submit 送 photo_ids 全量覆寫
  const initialPhotos = (t.photos || []).map((p) => ({ id: p.id, url: p.url }))
  const editPhotoIds = [] // 最終要保留的案件照片 id（attachPhotoPicker 會填 initialPhotos）
  // 共用 photo picker（v1.1.13：帶既有照片）
  const editPicker = attachPhotoPicker(editPhotoIds, initialPhotos)
  const photoPreview = editPicker.preview
  const photoInput = editPicker.input

  // 指派廠商（保全/秘書 manager 層級，即 manager/admin；問題3：放進編輯頁）
  const canAssignVendor = me && (me.role === 'manager' || me.role === 'admin')
  const vendorSelect = el('select', { class: 'select' })
  if (canAssignVendor) {
    // E5（v1.1.14）：placeholder 加「清空指派」選項（值 _clear），讓前端能送 vendor_id:null
    vendorSelect.appendChild(el('option', { value: '', text: t.vendor_name ? `目前：${t.vendor_name}` : '不變更廠商' }))
    if (t.vendor_name) {
      vendorSelect.appendChild(el('option', { value: '_clear', text: '— 清空指派 —' }))
    }
    api('/api/vendors').then((b) => {
      for (const v of b.data) {
        if (!v.active) continue
        vendorSelect.appendChild(el('option', { value: String(v.id), text: v.name, selected: v.name === t.vendor_name ? 'selected' : null }))
      }
    }).catch(() => {})
  }

  async function submit() {
    const body = {}
    if (catSelect.value) body.category_id = Number(catSelect.value)
    if (locSelect.value) body.location_id = Number(locSelect.value)
    if (descEl.value !== (t.description || '')) body.description = descEl.value
    if (canAssignVendor) {
      if (vendorSelect.value === '_clear') body.vendor_id = null
      else if (vendorSelect.value) body.vendor_id = Number(vendorSelect.value)
    }
    // 照片有增刪才送（photo_ids 全量覆寫綁定）
    const initIds = (t.photos || []).map((p) => p.id).sort().join(',')
    const curIds = [...editPhotoIds].sort().join(',')
    if (initIds !== curIds) body.photo_ids = editPhotoIds.length ? editPhotoIds : []
    try {
      await api(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      location.hash = '#/ticket/' + id
    } catch (e) { toast(e.message) }
  }

  clearLoading(root)

  root.appendChild(el('div', { class: 'form' }, [
    el('label', { text: '類別' }), catSelect,
    el('label', { text: '地點' }), locSelect,
    el('label', { text: '說明' }), descEl,
    // E2（v1.1.14）：編輯頁照片 UI 補掛（v1.1.13 迴歸漏放）
    el('label', { text: '照片' }), photoInput, photoPreview,
    canAssignVendor ? el('label', { text: '指派廠商' }) : null,
    canAssignVendor ? vendorSelect : null,
    el('button', { class: 'btn btn-primary', text: '儲存', onclick: submit }),
  ]))
}

// P5 統計（§5.5）
pages.stats = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '統計' }),
  ]))
  root.appendChild(el('div', { class: 'loading-wrap' }, [
    el('div', { class: 'spinner' }),
    el('div', { class: 'loading-text', text: '載入統計…' }),
  ]))

  // A4（v1.1.14）：月份下拉（近 12 個月），切換時 Promise.all 同步刷新 summary + amount-by-category
  const monthSel = el('select', { class: 'select' })
  const now = new Date()
  const curMonth = taipeiMonth()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthSel.appendChild(el('option', { value: ym, text: ym, selected: ym === curMonth ? 'selected' : null }))
  }
  root.appendChild(el('div', { class: 'month-row' }, [
    el('label', { text: '月份' }), monthSel,
  ]))

  const grid = el('div', { class: 'stats-grid' })
  const amountBox = el('div', { class: 'amount-box' })
  const amountTitle = el('h3', { class: 'section-title' })
  root.appendChild(grid)
  root.appendChild(amountTitle)
  root.appendChild(amountBox)

  async function load(month) {
    clearLoading(root)
    grid.innerHTML = ''
    amountBox.innerHTML = ''
    try {
      // A4：Promise.all 同步刷新，避免上下月份不一致
      const [sum, amt] = await Promise.all([
        api(`/api/stats/summary?month=${month}`),
        api(`/api/stats/amount-by-category?month=${month}`),
      ])
      const s = sum.data
      const openTotal = s.open_count + s.in_progress_count
      // A3（v1.1.14 方案②）：完成率 = 本月結案 / (期初未結案 + 本月新增)
      const denom = (s.month_initial_open ?? 0) + s.month_new
      const doneRate = denom > 0 ? Math.round((s.month_done / denom) * 100) : '—'
      const cards = [
        ['詢價中', s.open_count, 'red'],
        ['處理中', s.in_progress_count, 'yellow'],
        ['未結案總數', openTotal, 'blue'],
        ['本月新增', s.month_new, 'blue'],
        ['本月完成', s.month_done, 'green'],
        ['本月完成率', doneRate + '%', 'green'],
      ]
      for (const [label, val, color] of cards) {
        grid.appendChild(el('div', { class: 'stat-card' }, [
          el('div', { class: 'stat-num', text: String(val) }),
          el('div', { class: 'stat-label', text: label }),
        ]))
      }
      // 各類別金額
      amountTitle.textContent = `各類別金額（${month}，以發包時間計）`
      const items = amt.data.items
      if (!items || items.length === 0) {
        amountBox.appendChild(el('p', { class: 'empty', text: '本月尚無已發包案件' }))
        return
      }
      let grand = 0
      for (const it of items) {
        grand += it.total_amount
        amountBox.appendChild(el('div', { class: 'amount-row' }, [
          el('span', { text: it.category_label }),
          el('span', { text: `${it.count} 件` }),
          el('span', { class: 'amount-val', text: `$${it.total_amount.toLocaleString()}` }),
        ]))
      }
      amountBox.appendChild(el('div', { class: 'amount-row amount-total' }, [
        el('span', { text: '合計' }),
        el('span', { class: 'amount-val', text: `$${grand.toLocaleString()}` }),
      ]))
    } catch (e) {
      grid.appendChild(el('p', { class: 'error', text: e.message }))
    }
  }

  // ────────────────────────────────────────────────────────────
  // F2/F3/F4/F5（v1.1.15）：案件動態訊息框
  // - 日期選擇器（<input type="date">，max=今天）
  // - 類別下拉（localStorage 記住上次選擇）
  // - 複製按鈕（navigator.clipboard + execCommand fallback）
  // - textarea 即時預覽（F8 templateEngine.render）
  // ────────────────────────────────────────────────────────────
  const reportTitle = el('h3', { class: 'section-title', text: '案件動態' })
  root.appendChild(reportTitle)
  const reportBox = el('div', { class: 'report-box' })
  root.appendChild(reportBox)

  // 工具：今天台灣日期 YYYY-MM-DD
  function todayTaipeiStr() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
  }

  // 日期選擇器
  const dateInput = el('input', {
    type: 'date',
    class: 'select',
    max: todayTaipeiStr(),
    value: todayTaipeiStr(),
  })

  // 類別下拉（從 ensureCatalog() 拿 categories）
  const catSel = el('select', { class: 'select' })
  let allCategories = []
  ensureCatalog().then((cat) => {
    allCategories = (cat.categories || []).filter((c) => c.active !== false)
    // localStorage 記住上次選擇（F3 業主決策 2026-08-23）
    const savedCatId = Number(localStorage.getItem('dailyReportCatId') || 0)
    for (const c of allCategories) {
      catSel.appendChild(el('option', {
        value: String(c.id),
        text: c.label,
        selected: (savedCatId ? c.id === savedCatId : c === allCategories[0]) ? 'selected' : null,
      }))
    }
    if (allCategories.length > 0) loadReport()
  })
  catSel.addEventListener('change', () => {
    if (catSel.value) localStorage.setItem('dailyReportCatId', catSel.value)
    loadReport()
  })
  dateInput.addEventListener('change', loadReport)

  const preview = el('textarea', {
    class: 'report-preview',
    readonly: 'readonly',
    rows: 8,
    placeholder: '選擇日期與類別後顯示訊息預覽',
  })

  const copyBtn = el('button', { class: 'btn', text: '📋 複製' })
  copyBtn.addEventListener('click', async () => {
    const text = preview.value
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast('已複製')
    } catch (_) {
      // fallback：execCommand for LIFF WebView / iOS Safari
      try {
        preview.select()
        document.execCommand('copy')
        toast('已複製')
      } catch (e2) {
        toast('複製失敗：' + (e2?.message || '請手動選取'))
      }
    }
  })

  reportBox.appendChild(el('div', { class: 'report-controls' }, [
    el('label', { text: '日期' }), dateInput,
    el('label', { text: '類別' }), catSel,
    copyBtn,
  ]))
  reportBox.appendChild(preview)

  // F4（v1.1.16 簡化）：載入並渲染 — 前端拼 header + 兩段模板內容 + 空文案 + 總系統連結
  function monthDayOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    return `${m}月${d}日` // R-3：月/日、無年份、無星期
  }
  async function loadReport() {
    const date = dateInput.value
    const categoryId = Number(catSel.value)
    if (!date || !categoryId) {
      preview.value = ''
      return
    }
    try {
      const r = await api(`/api/stats/daily-report?date=${date}&category_id=${categoryId}`)
      const data = r.data
      const ncBody = (data.templates && data.templates.new_case && data.templates.new_case.body) || ''
      const tlBody = (data.templates && data.templates.timeline && data.templates.timeline.body) || ''
      let s1 = globalThis.templateEngine.render(ncBody, { new_cases: data.new_cases || [] })
      if (!s1.trim()) s1 = EMPTY_NEW_CASES_TEXT
      let s2 = globalThis.templateEngine.render(tlBody, { timeline_updates: data.timeline_updates || [] })
      if (!s2.trim()) s2 = EMPTY_TIMELINE_TEXT
      const hasContent = (data.new_cases?.length || 0) > 0 || (data.timeline_updates?.length || 0) > 0
      // R-3：date 用選取的 YYYY-MM-DD（dateInput.value），避免 unix seconds 解析問題
      let msg = `${DAILY_REPORT_HEADER}：${monthDayOf(date)}\n${s1}\n\n${s2}`
      if (hasContent) msg += `\n\n${SYSTEM_LINK}` // R-2：僅有實際內容時放總系統連結
      preview.value = msg
    } catch (e) {
      preview.value = ''
      reportBox.appendChild(el('p', { class: 'error', text: 'daily-report 載入失敗：' + e.message }))
    }
  }

  monthSel.addEventListener('change', () => load(monthSel.value))
  load(curMonth)

  // 匯出 CSV（僅 manager/admin，§5.5）
  if (me && (me.role === 'manager' || me.role === 'admin')) {
    root.appendChild(el('div', { class: 'export-row' }, [
      el('button', { class: 'btn', text: '匯出 CSV', onclick: exportCsv }),
      el('span', { class: 'hint', text: '將於外部瀏覽器開啟下載' }),
    ]))
  }
}
async function exportCsv() {  try {
    const b = await api('/api/exports/sign', { method: 'POST', body: JSON.stringify({}) })
    const url = location.origin + b.data.url
    if (window.liff && liffReady) {
      // C2（v1.1.15）：await openWindow 並 catch；失敗 fallback location.href
      try {
        await liff.openWindow({ url, external: true })
      } catch (openErr) {
        toast('外部瀏覽器開啟失敗，改用當前頁導向')
        location.href = url
      }
    } else {
      // D6：await 後 window.open 失去手勢信任（iOS Safari 攔截），改用 location.href 導向
      location.href = url
    }
  } catch (e) { toast(e.message) }
}

// P6 成員管理（admin，§5.6）
pages.users = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '成員管理' }),
  ]))
  root.appendChild(el('div', { class: 'loading-wrap' }, [
    el('div', { class: 'spinner' }),
    el('div', { class: 'loading-text', text: '載入成員…' }),
  ]))

  api('/api/users').then((b) => {
    const allUsers = b.data
    const list = el('div', { class: 'user-list' })
    const roleLabel = { pending: '待開通', committee: '委員', manager: '保全/秘書', admin: '主管' }
    // 權限層級：主管(admin) > 保全/秘書(manager) > 委員(committee)
    const roleOrder = [['pending', '待開通'], ['committee', '委員'], ['manager', '保全/秘書'], ['admin', '主管']]

    // 篩選（問題14：可依狀態篩選）
    const filterSelect = el('select', { class: 'select' })
    filterSelect.appendChild(el('option', { value: 'all', text: '全部成員' }))
    filterSelect.appendChild(el('option', { value: 'pending', text: '待開通' }))
    filterSelect.appendChild(el('option', { value: 'active', text: '已開通' }))
    filterSelect.appendChild(el('option', { value: 'disabled', text: '已停用' }))

    function render() {
      list.innerHTML = ''
      const f = filterSelect.value
      const filtered = allUsers.filter((u) => {
        if (f === 'pending') return u.role === 'pending'
        if (f === 'active') return u.role !== 'pending' && u.active === 1
        if (f === 'disabled') return u.active === 0
        return true
      })
      for (const u of filtered) {
        const roleSelect = el('select', { class: 'select' })
        for (const [val, label] of roleOrder) {
          roleSelect.appendChild(el('option', { value: val, text: label, selected: u.role === val ? 'selected' : null }))
        }
        roleSelect.addEventListener('change', async () => {
          try {
            await api('/api/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ role: roleSelect.value }) })
            u.role = roleSelect.value
            render()
          } catch (e) { toast(e.message); render() } // D7：失敗回滾下拉到實際角色
        })
        const activeBtn = el('button', {
          class: 'btn ' + (u.active ? 'btn-danger' : 'btn-primary'), // 問題15：停用紅/啟用藍
          text: u.active ? '停用' : '啟用',
          onclick: async () => {
            try {
              await api('/api/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ active: u.active ? 0 : 1 }) })
              u.active = u.active ? 0 : 1
              render()
            } catch (e) { toast(e.message) }
          },
        })
        list.appendChild(el('div', { class: 'card user-row' }, [
          el('span', { text: u.display_name }),
          el('span', { class: 'role-chip', text: roleLabel[u.role] || u.role }),
          roleSelect,
          activeBtn,
        ]))
      }
      if (filtered.length === 0) {
        renderEmpty(list, '沒有符合條件的成員') // 空狀態
      }
    }
    filterSelect.addEventListener('change', render)
    clearLoading(root)
    root.appendChild(el('div', { class: 'filter-row' }, [el('label', { text: '篩選：' }), filterSelect]))
    root.appendChild(list)
    render()
  }).catch((e) => { clearLoading(root); root.appendChild(el('p', { class: 'error', text: e.message })) })
}

// F7（v1.1.15）訊息模板管理頁（manager/admin）
// 結構：tab 切換 report / empty → 列表 → modal 編輯 body → 即時預覽 → 儲存
// 簡化版：不做下拉變數插入、自動完成；用 textarea + 提示文字「可用變數清單」
// 含 G7 重置為出廠預設按鈕（hardcode seed body 在前端）
const SEED_TEMPLATE_BODY = {
  new_case: `{{#each new_cases}}
{{id}}. {{location_label}}　{{status}}　{{description}}
{{/each}}`,
  timeline: `{{#each timeline_updates}}
{{id}}. {{location_label}}　{{status}}　{{note}}
{{/each}}`,
}

// v1.1.16：可編輯模板的變數提示（僅兩支）
const VARIABLE_HINT = {
  new_case: '可用變數：{{id}} {{location_label}} {{status}} {{description}}',
  timeline: '可用變數：{{id}} {{location_label}} {{status}} {{note}}',
}

// 預設抓哪個 category 的模板（這頁只需要一個類別的模板列表）
const TEMPLATE_PAGE_DEFAULT_CAT = (() => {
  // 從 catalog 拿第一個 active category
  return null
})()

async function getFirstCategoryId() {
  const cat = await ensureCatalog()
  const first = (cat.categories || [])[0]
  return first ? first.id : null
}

pages.messageTemplates = async function () {
  if (!me || (me.role !== 'manager' && me.role !== 'admin')) {
    location.hash = '#/'
    return
  }

  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '訊息模板' }),
  ]))

  const catId = await getFirstCategoryId()
  if (!catId) {
    root.appendChild(el('p', { class: 'error', text: '尚未建立類別，無法管理模板' }))
    return
  }

  // v1.1.16：單 tab「訊息模板」，兩行（新案件 / 時間軸）各自可編輯 body + 即時預覽
  const LABEL_META = { new_case: '新案件', timeline: '時間軸' }

  const listBox = el('div', { class: 'tmpl-list' })
  root.appendChild(listBox)

  async function loadList() {
    listBox.innerHTML = ''
    listBox.appendChild(el('div', { class: 'loading-text', text: '載入中…' }))
    try {
      const rows = []
      for (const label of ['new_case', 'timeline']) {
        const r = await api(`/api/message-templates?category_id=${catId}&label=${label}`)
        for (const t of (r.data.templates || [])) rows.push(t)
      }
      listBox.innerHTML = ''
      if (rows.length === 0) {
        listBox.appendChild(el('p', { class: 'empty', text: '目前無啟用模板（請至後台 migration 跑 0012）' }))
        return
      }
      for (const t of rows) {
        listBox.appendChild(el('div', { class: 'tmpl-row' }, [
          el('div', { class: 'tmpl-name', text: LABEL_META[t.label] || t.label }),
          el('div', { class: 'tmpl-meta', text: t.is_category_specific ? '此類別專用' : '全域預設' }),
          el('button', { class: 'btn', text: '編輯', onclick: () => openEdit(t) }),
          el('button', { class: 'btn btn-ghost', text: '重置出廠預設', onclick: () => resetToFactory(t) }),
        ]))
      }
    } catch (e) {
      listBox.innerHTML = ''
      listBox.appendChild(el('p', { class: 'error', text: e.message }))
    }
  }

  async function openEdit(t) {
    const cur = t
    const modal = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === modal) close() } })
    const content = el('div', { class: 'modal modal-wide' })
    modal.appendChild(content)
    content.appendChild(el('h2', { text: '編輯模板：' + (LABEL_META[cur.label] || cur.label) }))

    const bodyArea = el('textarea', { class: 'tmpl-body', rows: 10, value: cur.body ?? '' })
    const previewBox = el('pre', { class: 'tmpl-preview', text: '(預覽將顯示於此)' })
    const hint = el('div', { class: 'hint', text: VARIABLE_HINT[cur.label] || '' })

    content.appendChild(el('div', { class: 'form-row' }, [el('label', { text: '內容（body，可使用 {{變數}} 與 {{#each}}...{{/each}}）' }), bodyArea]))
    content.appendChild(hint)
    content.appendChild(el('div', { class: 'form-row' }, [el('label', { text: '即時預覽（用範例資料渲染）' }), previewBox]))

    function renderPreview() {
      try {
        previewBox.textContent = globalThis.templateEngine.render(bodyArea.value, makeFixtureContext(cur.label))
      } catch (e) {
        previewBox.textContent = '預覽失敗：' + e.message
      }
    }
    bodyArea.addEventListener('input', renderPreview)
    setTimeout(renderPreview, 0)

    content.appendChild(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', text: '取消', onclick: close }),
      el('button', { class: 'btn', text: '儲存', onclick: async () => {
        try {
          await api(`/api/message-templates/${cur.id}`, { method: 'PUT', body: JSON.stringify({ body: bodyArea.value }) })
          toast('已儲存')
          close()
          loadList()
        } catch (e) {
          toast('儲存失敗：' + e.message)
        }
      } }),
    ]))

    function close() { modal.remove() }
    document.body.appendChild(modal)
    setTimeout(() => bodyArea.focus(), 100)
  }

  async function resetToFactory(t) {
    if (!confirm(`確定將「${LABEL_META[t.label] || t.label}」重置為出廠預設？\n目前的 body 將被覆寫。`)) return
    const seed = SEED_TEMPLATE_BODY[t.label]
    if (!seed) { toast('找不到出廠預設 body'); return }
    try {
      await api(`/api/message-templates/${t.id}`, { method: 'PUT', body: JSON.stringify({ body: seed }) })
      toast('已重置為出廠預設')
      loadList()
    } catch (e) {
      toast('重置失敗：' + e.message)
    }
  }

  loadList()
}

// F7：模板預覽用 fixture 資料（hardcoded，與 SPEC §F5 一致）
// v1.1.16：模板管理頁即時預覽用範例資料（依 label 回傳對應陣列）
function makeFixtureContext(label) {
  if (label === 'timeline') {
    return {
      timeline_updates: [
        { id: 3, location_label: '大廳', status: '已發包', note: '已通知廠商' },
        { id: 7, location_label: '頂樓', status: '待處理', note: '到場勘查，待報價' },
      ],
    }
  }
  return {
    new_cases: [
      { id: 12, location_label: '大廳', status: '詢價中', description: '水泵故障，需要維修' },
      { id: 13, location_label: '停車場', status: '詢價中', description: '照明故障' },
    ],
  }
}

// P7 管理（manager/admin，§5.7）
pages.admin = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '管理' }),
  ]))

  // 選項管理 + 廠商管理 tab（問題9：廠商管理獨立 tab，不再每個類別都顯示）
  // F11-1：訊息模板從 admin 內進，不放 nav
  const types = [['category', '類別'], ['location', '地點'], ['description', '使用範本'], ['comment_desc', '回報範本'], ['vendors', '廠商'], ['message_templates', '訊息模板']]
  const tabBar = el('div', { class: 'tabs' })
  const content = el('div', {})
  let currentType = 'category'

  function renderVendors() {
    const thisType = 'vendors' // F2：記錄發起時 tab，避免 stale 覆蓋
    content.innerHTML = ''
    content.appendChild(el('div', { class: 'loading-wrap' }, [
      el('div', { class: 'spinner' }),
      el('div', { class: 'loading-text', text: '載入中…' }),
    ]))
    api('/api/vendors').then((b) => {
      if (currentType !== thisType) return // F2：tab 已切走，捨棄此回應
      content.innerHTML = ''
      const list = el('div', { class: 'option-list' })
      for (const v of b.data) {
        list.appendChild(el('div', { class: 'card option-row' }, [
          el('span', { text: v.name + (v.active ? '' : '（已停用）') }),
          el('button', { class: 'btn ' + (v.active ? 'btn-danger' : 'btn-primary'), text: v.active ? '停用' : '啟用', onclick: async () => {
            try { await api('/api/vendors/' + v.id, { method: 'PATCH', body: JSON.stringify({ active: v.active ? 0 : 1 }) }); renderVendors() }
            catch (e) { toast(e.message) }
          } }),
        ]))
      }
      if (b.data.length === 0) {
        renderEmpty(list, '尚無廠商') // 空狀態
      }
      content.innerHTML = ''
      content.appendChild(list)
      const newVendor = el('input', { class: 'input', placeholder: '新廠商名稱' })
      content.appendChild(el('div', { class: 'add-row' }, [
        newVendor,
        el('button', { class: 'btn', text: '新增廠商', onclick: async () => {
          if (!newVendor.value.trim()) return
          try {
            await api('/api/vendors', { method: 'POST', body: JSON.stringify({ name: newVendor.value.trim() }) })
            newVendor.value = ''
            renderVendors()
          } catch (e) { toast(e.message) }
        } }),
      ]))
    }).catch((e) => { if (currentType === 'vendors') { content.innerHTML = ''; content.appendChild(el('p', { class: 'error', text: e.message })) } })
  }

  function renderOptions() {
    const thisType = currentType // F2：記錄發起時 tab，避免 stale 覆蓋
    content.innerHTML = ''
    content.appendChild(el('div', { class: 'loading-wrap' }, [
      el('div', { class: 'spinner' }),
      el('div', { class: 'loading-text', text: '載入中…' }),
    ]))
    // P7 用 include_inactive=1（含停用，修停用顯示 bug；限 manager/admin）
    api('/api/options?type=' + currentType + '&include_inactive=1').then((b) => {
      if (currentType !== thisType) return // F2：tab 已切走，捨棄此回應
      const list = el('div', { class: 'option-list' })
      for (const o of b.data) {
        const row = el('div', { class: 'card option-row' }, [
          el('span', { text: o.label + (o.active ? '' : '（已停用）') }),
          el('button', { class: 'btn ' + (o.active ? 'btn-danger' : 'btn-primary'), text: o.active ? '停用' : '啟用', onclick: async () => {
            // G2：停用類別時警示——該類別專屬的地點/說明會因類別不可選而隱形（幽靈孤兒）
            if (currentType === 'category' && o.active && (o.location_count || 0) + (o.description_count || 0) > 0) {
              if (!confirm(`停用「${o.label}」後，其專屬的地點/說明將無法在任何類別下選取。確定停用？`)) return
            }
            try {
              await api('/api/options/' + o.id, { method: 'PATCH', body: JSON.stringify({ active: o.active ? 0 : 1 }) })
              catalogCache = null // E10：停用/啟用後清全域快取，避免建單/詳情頁讀舊
              renderOptions()
            }
            catch (e) { toast(e.message) }
          } }),
        ])
        // 類別 tab：顯示關聯計數 + 設定關聯按鈕（v1.1.7 改以類別為中心）
        if (currentType === 'category') {
          const count = el('span', { class: 'assoc-count', text: `📍${o.location_count ?? 0} 地點 · 💬${o.description_count ?? 0} 說明` })
          const assocBtn = el('button', { class: 'btn btn-ghost', text: '設定關聯', onclick: () => openAssocModal(o) })
          row.appendChild(count)
          row.appendChild(assocBtn)
        }
        list.appendChild(row)
      }
      if (b.data.length === 0) {
        renderEmpty(list, '尚無此類選項') // 空狀態
      }
      content.innerHTML = ''
      content.appendChild(list)
    }).catch((e) => { if (currentType === thisType) { content.innerHTML = ''; content.appendChild(el('p', { class: 'error', text: e.message })) } })
  }

  // 以類別為中心：點「設定關聯」開 modal，編輯該類別的地點/說明關聯（v1.1.7）
  function openAssocModal(cat) {
    const mask = el('div', { class: 'modal-mask', onclick: (e) => { if (e.target === mask) mask.remove() } })
    const modal = el('div', { class: 'modal' }, [
      el('h3', { text: `設定「${cat.label}」關聯` }),
    ])
    // 地點區
    modal.appendChild(el('h4', { class: 'modal-sub', text: '地點' }))
    const locWrap = el('div', { class: 'assoc-list' })
    modal.appendChild(locWrap)
    // 說明區
    modal.appendChild(el('h4', { class: 'modal-sub', text: '使用範本' }))
    const descWrap = el('div', { class: 'assoc-list' })
    modal.appendChild(descWrap)
    // 儲存（F1：載入完成前 disabled，避免誤點清空關聯）
    const saveBtn = el('button', { class: 'btn btn-primary', text: '載入中…', disabled: 'true', onclick: async () => {
      try {
        const locIds = [...locWrap.querySelectorAll('input:checked')].map(i => Number(i.value))
        const descIds = [...descWrap.querySelectorAll('input:checked')].map(i => Number(i.value))
        // 以類別為中心，全量覆寫該類別的地點/說明關聯
        await api(`/api/options/${cat.id}/assoc`, { method: 'POST', body: JSON.stringify({ type: 'location', option_ids: locIds }) })
        await api(`/api/options/${cat.id}/assoc`, { method: 'POST', body: JSON.stringify({ type: 'description', option_ids: descIds }) })
        catalogCache = null // E10：關聯變更後清全域快取
        mask.remove()
        renderOptions()
      } catch (e) { toast(e.message) }
    } })
    modal.appendChild(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => mask.remove() }),
      saveBtn,
    ]))
    mask.appendChild(modal)
    document.body.appendChild(mask)

    // 載入該類別的地點（含 associated）；兩區都載完才啟用儲存（F1）
    let locLoaded = false
    let descLoaded = false
    const maybeEnable = () => { if (locLoaded && descLoaded) { saveBtn.disabled = false; saveBtn.textContent = '儲存' } }
    api(`/api/options?type=location&category_id=${cat.id}&include_inactive=1`).then((b) => {
      for (const o of b.data) {
        locWrap.appendChild(el('label', { class: 'assoc-check' }, [
          el('input', { type: 'checkbox', value: String(o.id), checked: o.associated ? 'checked' : null }),
          el('span', { text: o.label + (o.active ? '' : '（已停用）') }),
        ]))
      }
      locLoaded = true
      maybeEnable()
    }).catch(() => { locLoaded = true; maybeEnable() })
    // 載入該類別的說明（含 associated）
    api(`/api/options?type=description&category_id=${cat.id}&include_inactive=1`).then((b) => {
      for (const o of b.data) {
        descWrap.appendChild(el('label', { class: 'assoc-check' }, [
          el('input', { type: 'checkbox', value: String(o.id), checked: o.associated ? 'checked' : null }),
          el('span', { text: o.label + (o.active ? '' : '（已停用）') }),
        ]))
      }
      descLoaded = true
      maybeEnable()
    }).catch(() => { descLoaded = true; maybeEnable() })
  }

  for (const [val, label] of types) {
    tabBar.appendChild(el('button', {
      class: 'tab' + (val === currentType ? ' active' : ''),
      text: label,
      onclick: (e) => {
        currentType = val
        for (const b of tabBar.children) b.classList.remove('active')
        e.currentTarget.classList.add('active')
        // 廠商 tab 有自己內嵌的新增列，隱藏選項新增列
        addRow.style.display = (val === 'vendors' || val === 'message_templates') ? 'none' : ''
        // F11-1：訊息模板走獨立頁 pages.messageTemplates()
        if (val === 'message_templates') {
          pages.messageTemplates()
          return
        }
        if (val === 'vendors') renderVendors()
        else renderOptions()
      },
    }))
  }
  root.appendChild(tabBar)
  root.appendChild(content)
  renderOptions()

  // 新增選項（僅選項 tab 顯示，非廠商 tab）
  const newLabel = el('input', { class: 'input', placeholder: '新選項名稱' })
  const addRow = el('div', { class: 'add-row' }, [
    newLabel,
    el('button', { class: 'btn', text: '新增', onclick: async () => {
      if (!newLabel.value.trim()) return
      try {
        await api('/api/options', { method: 'POST', body: JSON.stringify({ type: currentType, label: newLabel.value.trim(), sort_order: 0 }) })
        newLabel.value = ''
        catalogCache = null // E10：新增選項後清全域快取
        renderOptions()
      } catch (e) { toast(e.message) }
    } }),
  ])
  // 切換 tab 時更新新增列（廠商 tab 不顯示選項新增列）
  root.appendChild(addRow)
}

// §3.5 登出：清除 session cookie → 重置登入狀態 → 重載（boot 會重新走登入流程）
async function doLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    })
  } catch { /* 端點不可用仍強制清除本地狀態 */ }
  me = null
  location.reload()
}

// ---- 底部導覽 ----
function renderNav() {
  const nav = document.getElementById('nav')
  if (!nav) return
  nav.innerHTML = ''
  const items = [
    ['#/', '📋 案件'],
    ['#/new', '＋ 建單'],
    ['#/stats', '📊 統計'],
  ]
  if (me && (me.role === 'manager' || me.role === 'admin')) items.push(['#/admin', '⚙ 管理'])
  // F11-1：訊息模板從 admin 內 tab 進，不放 nav（committee 不該看到入口）
  if (me && me.role === 'admin') items.push(['#/users', '👥 成員'])
  for (const [href, label] of items) {
    nav.appendChild(el('a', { href, class: 'nav-item', text: label }))
  }
  // §3.5 登出：所有已登入角色皆可見（committee/manager/admin）
  nav.appendChild(el('button', {
    type: 'button',
    class: 'nav-item nav-logout',
    text: '🚪 登出',
    onclick: async () => { if (confirm('確定要登出嗎？')) await doLogout() },
  }))
}

// ---- hash router ----
function router() {
  // B2：先 split('?') 過濾 query string，避免 #/ticket/12?ref=share 解析成 '12?ref=share'
  const hash = (location.hash || '#/').split('?')[0]
  // 對 '#/admin' → slice(1)='/admin' → split('/')=['','admin']，過濾空字串取 path
  const parts = hash.slice(1).split('/').filter(Boolean)
  const path = parts[0] || ''
  const param = parts[1]
  const root = document.getElementById('page')
  // D8（v1.1.15）：切頁時清掉 pending 輪詢計時器，避免切走仍持續打 /api/auth/me
  if (root._pendingTimer) { clearInterval(root._pendingTimer); root._pendingTimer = null }
  root.innerHTML = ''

  // 未登入 → 先 boot
  if (!me) { boot(); return }

  switch (path) {
    case '': case 'list': pages.list(); break
    case 'new': pages.new(); break
    case 'ticket': pages.ticket(param); break
    case 'edit': pages.edit(param); break
    case 'stats': pages.stats(); break
    case 'users': pages.users(); break
    case 'message-templates': pages.messageTemplates(); break
    case 'admin': pages.admin(); break
    default: pages.list()
  }
  renderNav()
}

// 清掉登入後殘留的 URL 參數（code/state/liff* 等），保留 hash 路由
function cleanUrlParams() {
  if (window.location.search) {
    const url = window.location.pathname + window.location.hash
    history.replaceState(null, '', url)
  }
}

// ---- boot：LIFF init + 登入 + 取 me ----
async function boot() {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('p', { class: 'loading', text: '載入中…' }))

  // 測試模式：?mock=true 時用 liff-mock 插件（§1.2，繞過真實 LINE 登入）
  const isMock = new URLSearchParams(window.location.search).get('mock') === 'true'
  // 注意：不可在此清 URL 參數！LIFF 的 OAuth 授權需要 URL 上的 code/state 才能完成登入。
  // cleanUrlParams() 改在登入成功、取得 me 之後才呼叫（見 boot 尾端）。
  if (isMock && window.liff && window.liffMock) {
    try {
      // window.liffMock 本身就是 LiffMockPlugin 類別（UMD 掛載）
      liff.use(new window.liffMock())
      await liff.init({ liffId: LIFF_ID, mock: true })
      liffReady = true
      // 注入假使用者（可被測試覆寫）
      if (liff.$mock) {
        liff.$mock.set({
          getProfile: { userId: 'U-mock-user', displayName: '測試用戶', statusMessage: '' },
          getIDToken: () => 'mock-id-token',
          isLoggedIn: () => true,
        })
      }
    } catch (e) {
      console.warn('LIFF mock init failed', e)
    }
  } else if (window.liff) {
    try {
      await liff.init({ liffId: LIFF_ID })
      liffReady = true
    } catch (e) {
      // LIFF init 失敗（外部瀏覽器）→ 仍嘗試用既有 cookie
      console.warn('LIFF init failed', e)
    }
  }

  // 取 me
  if (isMock) {
    // 測試模式：直接設假 me（不跳 LINE 登入），後續 API 靠注入的 test cookie
    me = { id: 1, display_name: '測試用戶', role: 'admin' }
    router()
    return
  }

  try {
    const body = await api('/api/auth/me')
    me = body.data
  } catch (e) {
    if (e.code === 'UNAUTHORIZED') {
      // 未登入 → 嘗試 LINE 登入（§3.1 標準流程：isLoggedIn → getIDToken / liff.login）
      if (liffReady && liff.isLoggedIn()) {
        const idToken = liff.getIDToken()
        // 用既有 id_token（可能已過期）換 session；後端拒收 → logout 清快取後重新授權
        if (idToken && await postSession(idToken)) {
          try {
            me = (await api('/api/auth/me')).data
            resetRelogin()
            router()
            return
          } catch (e2) {
            // session cookie 未生效（極罕見）→ 走下方 forceFreshLogin 重新授權
          }
        }
        if (!forceFreshLogin()) {
          root.innerHTML = ''
          root.appendChild(el('p', { class: 'error', text: '登入失敗，請重新從 LINE 開啟' }))
          return
        }
      } else if (liffReady) {
        // 不指定 redirectUri，讓 LIFF SDK 用 LIFF app 設定的 Endpoint URL
        if (!reloginStart()) return // 達上限 → 顯示錯誤卡，不再跳 OAuth
        liff.login()
        return
      } else if (window.liff) {
        // LIFF SDK 在但 init 失敗（外部瀏覽器）→ 重試 init 後登入
        try {
          await liff.init({ liffId: LIFF_ID })
          liffReady = true
          if (liff.isLoggedIn()) {
            const idToken = liff.getIDToken()
            // §3.1：用既有 id_token（可能已過期）換 session；後端拒收 → logout 清快取後重新授權
            if (idToken && await postSession(idToken)) {
              try {
                me = (await api('/api/auth/me')).data
                resetRelogin()
                router()
                return
              } catch (e2) { /* session cookie 未生效（極罕見）→ 走下方重新授權 */ }
            }
            if (!forceFreshLogin()) throw new Error('session failed') // 達上限才至此 → 錯誤卡，不無限重導
          }
          // OAuth 回跳後拿不到有效 id_token（init 失敗）→ 受次數上限保護，避免無限重導
          if (!reloginStart()) return // 達上限 → 錯誤卡已顯示
          liff.login()
          return
        } catch (e2) {
          // C3（v1.1.15）：外部瀏覽器 boot 二次兜底失敗——印錯誤細節方便排查
          console.warn('[boot] LIFF retry init failed:', e2)
          root.innerHTML = ''
          root.appendChild(el('p', { class: 'error', text: '登入失敗，請重新從 LINE 開啟' }))
          return
        }
      } else {
        // 完全無 LIFF（非 LINE 環境）→ 顯示提示 + 重新整理
        root.innerHTML = ''
        root.appendChild(el('div', { class: 'pending' }, [
          el('h1', { text: '🏘️ 社區修繕系統' }),
          el('p', { text: '請從 LINE 圖文選單開啟本系統，或使用已登入的瀏覽器' }),
          el('button', { class: 'btn', text: '重新整理', onclick: () => location.reload() }),
        ]))
        return
      }
    } else if (e.code === 'PENDING') {
      // pending → P0（LINE 已登入但尚未開通，同樣清掉 OAuth 殘留）
      if (!isMock) cleanUrlParams()
      me = { id: 0, display_name: '', role: 'pending' }
      pages.pending()
      return
    } else if (e.code === 'DISABLED') {
      root.innerHTML = ''
      root.appendChild(el('p', { class: 'error', text: '帳號已停用，請洽管理員' }))
      return
    } else {
      root.innerHTML = ''
      root.appendChild(el('p', { class: 'error', text: e.message }))
      return
    }
  }

  // pending → P0
  if (me.role === 'pending') {
    pages.pending()
    return
  }

  // 登入成功：清掉重登計數，避免下次 session 重建誤觸上限
  resetRelogin()

  // 登入成功：清掉 URL 上的 OAuth 殘留參數（code/state/liff*），保留 hash 路由
  if (!isMock) cleanUrlParams()

  router()
}

// ---- 啟動 ----
window.addEventListener('hashchange', router)
boot()
