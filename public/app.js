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
  { id: 1, title: '電梯－停車場 #0001', status: 'open', category_label: '電梯', location_label: '停車場', vendor_name: null, created_at: '2026-08-18T10:00:00.000Z', last_activity_at: '2026-08-18T10:00:00.000Z' },
  { id: 2, title: '門禁－大廳 #0002', status: 'in_progress', category_label: '門禁', location_label: '大廳', vendor_name: '測試廠商', created_at: '2026-08-18T09:00:00.000Z', last_activity_at: '2026-08-18T11:00:00.000Z' },
]
let mockNextId = 3
const mockOptions = {
  category: [{ id: 1, label: '電梯' }, { id: 2, label: '門禁' }, { id: 3, label: '水泵' }],
  location: [{ id: 1, label: '停車場' }, { id: 2, label: '大廳' }, { id: 3, label: '頂樓' }],
  description: [{ id: 1, label: '水泵浦異音' }, { id: 2, label: '照明故障' }],
}
const mockUsers = [
  { id: 1, display_name: '測試用戶', role: 'admin', active: 1 },
  { id: 2, display_name: '王任鋒', role: 'admin', active: 1 },
]
const mockVendors = [{ id: 1, name: '測試廠商', phone: '0912345678', active: 1 }]

function mockApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const url = new URL(path, window.location.origin)
  const pathname = url.pathname // 去 query 比對

  // auth/me
  if (pathname === '/api/auth/me') {
    return { ok: true, data: { id: 1, display_name: '測試用戶', role: 'admin' } }
  }
  // options
  if (pathname === '/api/options') {
    const type = url.searchParams.get('type')
    return { ok: true, data: mockOptions[type] || [] }
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
      vendor_name: null, created_at: new Date().toISOString(), last_activity_at: new Date().toISOString(),
    }
    mockTickets.unshift(t)
    return { ok: true, data: { id: t.id, title: t.title, share_token: 'mock-token-' + t.id } }
  }
  // 詳情
  const detailMatch = pathname.match(/^\/api\/tickets\/(\d+)$/)
  if (detailMatch && method === 'GET') {
    const t = mockTickets.find(x => x.id === Number(detailMatch[1]))
    if (!t) return { ok: false, error: { code: 'NOT_FOUND', message: '案件不存在' } }
    return { ok: true, data: { ...t, description: '測試說明', photos: [], share_url: '/api/share/mock', updates: [] } }
  }
  // 統計
  if (pathname === '/api/stats/summary') {
    return { ok: true, data: { open_count: 1, in_progress_count: 1, month_new: 2, month_done: 0 } }
  }
  // users
  if (pathname === '/api/users' && method === 'GET') {
    return { ok: true, data: mockUsers }
  }
  // vendors
  if (pathname === '/api/vendors' && method === 'GET') {
    return { ok: true, data: mockVendors }
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

// §3.4 靜默重登：liff.login() → 取 id_token → POST /api/auth/session → 重送原請求一次
async function silentRelogin(path, options, headers) {
  if (!liffReady || !window.liff) return null
  try {
    if (!liff.isLoggedIn()) {
      // 不指定 redirectUri，讓 LIFF SDK 用 LIFF app 設定的 Endpoint URL（避免部署網域變動造成不符）
      liff.login()
      return null
    }
    const idToken = liff.getIDToken()
    if (!idToken) return null
    const sessionRes = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ id_token: idToken }),
    })
    if (!sessionRes.ok) return null
    // 重送原請求一次
    const retry = await fetch(path, { ...options, headers })
    if (retry.status === 401) return null
    let body
    try { body = await retry.json() } catch { body = null }
    return body
  } catch {
    return null
  }
}

// ---- 工具 ----
// 照片壓縮（§5.0：最長邊 1600px、輸出 JPEG；解碼失敗顯示提示）
async function compressPhoto(file) {
  if (!window.imageCompression) return file
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 10,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: 'image/jpeg',
    })
    return compressed
  } catch (e) {
    alert('此照片格式無法處理，請改用相機拍攝或先在相簿轉存')
    throw e
  }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue // 跳過 null/undefined
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else if (k === 'selected') node.selected = !!v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
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
  const map = { open: ['待處理', 'red'], in_progress: ['處理中', 'yellow'], done: ['已完成', 'green'], void: ['已作廢', 'black'] }
  const [label, color] = map[status] || [status, 'gray']
  return el('span', { class: `badge badge-${color}`, text: label })
}

// 問題16：縮圖點開放大（lightbox）
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
}

// P1 案件列表（§5.1）
pages.list = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  const tabs = [
    ['active', '未結案'], ['open', '待處理'], ['in_progress', '處理中'],
    ['done', '已完成'], ['void', '已作廢'], ['all', '全部'],
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
    try {
      const body = await api('/api/tickets?' + qs.toString())
      const items = body.data.items
      hasMore = body.data.has_more
      for (const t of items) {
        listEl.appendChild(renderTicketCard(t))
      }
      loadMoreBtn.style.display = hasMore ? '' : 'none'
    } catch (e) {
      listEl.appendChild(el('p', { class: 'error', text: e.message }))
    }
  }

  function renderTicketCard(t) {
    const stale = (t.status === 'open' || t.status === 'in_progress') &&
      (Date.now() - new Date(t.last_activity_at).getTime() > 7 * 24 * 3600 * 1000)
    const days = Math.floor((Date.now() - new Date(t.last_activity_at).getTime()) / (24 * 3600 * 1000))
    const card = el('div', { class: 'card ticket-card', onclick: () => { location.hash = '#/ticket/' + t.id } }, [
      el('div', { class: 'ticket-title' }, [statusBadge(t.status), el('span', { text: t.title })]),
      el('div', { class: 'ticket-meta', text: `廠商：${t.vendor_name || '未指派'}` }),
      el('div', { class: 'ticket-meta', text: `最後活動：${fmtTime(t.last_activity_at)}` }),
      stale ? el('div', { class: 'stale', text: `⚠ ${days} 天未更新` }) : null,
    ])
    // 問題3：列表可直接指派廠商（manager/admin，未結案）
    if (me && (me.role === 'manager' || me.role === 'admin') && (t.status === 'open' || t.status === 'in_progress')) {
      const vendorSelect = el('select', { class: 'select vendor-inline' })
      vendorSelect.appendChild(el('option', { value: '', text: t.vendor_name ? `廠商：${t.vendor_name}` : '指派廠商…' }))
      api('/api/vendors').then((b) => {
        for (const v of b.data) {
          if (!v.active) continue
          vendorSelect.appendChild(el('option', { value: String(v.id), text: v.name }))
        }
      }).catch(() => {})
      vendorSelect.addEventListener('change', async (e) => {
        e.stopPropagation()
        if (!e.target.value) return
        try {
          await api('/api/tickets/' + t.id, { method: 'PATCH', body: JSON.stringify({ vendor_id: Number(e.target.value) }) })
          location.reload()
        } catch (err) { alert(err.message) }
      })
      card.appendChild(vendorSelect)
    }
    return card
  }

  function loadMore() {
    page++
    load()
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
  api('/api/options?type=category').then((b) => {
    for (const o of b.data) catSelect.appendChild(el('option', { value: String(o.id), text: o.label }))
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
  const descEl = el('textarea', { class: 'textarea', placeholder: '說明（選填）' })

  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '建單' }),
  ]))

  // 類別下拉（問題2：選項多時 chips 選不到，改下拉式）
  const catSelect = el('select', { class: 'select' })
  catSelect.appendChild(el('option', { value: '', text: '請選擇類別' }))
  let selectedCat = null
  api('/api/options?type=category').then((b) => {
    for (const o of b.data) {
      catSelect.appendChild(el('option', { value: String(o.id), text: o.label }))
    }
  }).catch(() => {})
  catSelect.addEventListener('change', (e) => { selectedCat = e.target.value ? Number(e.target.value) : null })

  // 地點下拉
  const locSelect = el('select', { class: 'select' })
  locSelect.appendChild(el('option', { value: '', text: '請選擇地點' }))
  let selectedLoc = null
  api('/api/options?type=location').then((b) => {
    for (const o of b.data) {
      locSelect.appendChild(el('option', { value: String(o.id), text: o.label }))
    }
  }).catch(() => {})
  locSelect.addEventListener('change', (e) => { selectedLoc = e.target.value ? Number(e.target.value) : null })

  // 常用說明 chips（點擊附加至 textarea，§5.2）
  const descChips = el('div', { class: 'chips' })
  api('/api/options?type=description').then((b) => {
    for (const o of b.data) {
      descChips.appendChild(el('button', {
        class: 'chip', text: o.label,
        onclick: () => {
          const cur = descEl.value
          if (cur.includes(o.label)) return
          descEl.value = cur ? cur + '、' + o.label : o.label
        },
      }))
    }
  }).catch(() => {})

  // 照片上傳
  const photoInput = el('input', { type: 'file', accept: 'image/*', multiple: 'true' })
  const photoPreview = el('div', { class: 'photo-preview' })
  photoInput.addEventListener('change', async () => {
    for (const file of photoInput.files) {
      try {
        const compressed = await compressPhoto(file)
        const fd = new FormData()
        fd.append('file', compressed)
        const body = await api('/api/photos', { method: 'POST', body: fd })
        selectedPhotos.push(body.data.id)
        photoPreview.appendChild(thumb(body.data.url))
      } catch (e) {
        if (e && e.code !== 'NETWORK') continue
        alert(e.message)
      }
    }
  })

  async function submit() {
    if (!selectedCat || !selectedLoc) { alert('請選擇類別與地點'); return }
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
      alert(e.message)
    }
  }

  root.appendChild(el('div', { class: 'form' }, [
    el('label', { text: '類別' }), catSelect,
    el('label', { text: '地點' }), locSelect,
    el('label', { text: '常用說明（點擊附加）' }), descChips,
    el('label', { text: '說明' }), descEl,
    el('label', { text: '照片' }), photoInput, photoPreview,
    el('button', { class: 'btn btn-primary', text: '送出建單', onclick: submit }),
  ]))
}

// P3 案件詳情（§5.3）
pages.ticket = async function (id) {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '案件詳情' }),
  ]))

  let body
  try {
    body = await api('/api/tickets/' + id)
  } catch (e) {
    root.appendChild(el('p', { class: 'error', text: e.message }))
    return
  }
  const t = body.data

  // 案件資訊
  const info = el('div', { class: 'card' }, [
    el('h2', { text: t.title }),
    el('div', {}, [statusBadge(t.status)]),
    el('p', { text: `類別：${t.category_label}｜地點：${t.location_label}` }),
    el('p', { text: `廠商：${t.vendor_name || '未指派'}` }),
    t.description ? el('p', { class: 'desc', text: t.description }) : null,
    el('p', { class: 'meta', text: `建立：${fmtTime(t.created_at)}` }),
    el('p', { class: 'meta', text: `最後活動：${fmtTime(t.last_activity_at)}` }),
  ])
  root.appendChild(info)

  // 指派廠商（manager/admin，問題3：詳情頁可直接指派）
  if (me && (me.role === 'manager' || me.role === 'admin') && (t.status === 'open' || t.status === 'in_progress')) {
    const vendorSelect = el('select', { class: 'select' })
    vendorSelect.appendChild(el('option', { value: '', text: t.vendor_name ? `目前：${t.vendor_name}` : '指派廠商…' }))
    api('/api/vendors').then((b) => {
      for (const v of b.data) {
        if (!v.active) continue
        vendorSelect.appendChild(el('option', { value: String(v.id), text: v.name }))
      }
    }).catch(() => {})
    vendorSelect.addEventListener('change', async (e) => {
      if (!e.target.value) return
      try {
        await api(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ vendor_id: Number(e.target.value) }) })
        location.reload()
      } catch (err) { alert(err.message) }
    })
    root.appendChild(el('div', { class: 'form' }, [
      el('label', { text: '指派廠商' }), vendorSelect,
    ]))
  }

  // 照片牆
  if (t.photos && t.photos.length) {
    const wall = el('div', { class: 'photo-wall' })
    for (const url of t.photos) wall.appendChild(el('img', { src: url, class: 'photo' }))
    root.appendChild(wall)
  }

  // 分享連結（問題10：複製不彈確認框）
  const shareRow = el('div', { class: 'share-row' }, [
    el('span', { text: '分享連結：' }),
    el('input', { class: 'input', value: location.origin + t.share_url, readonly: 'true' }),
    el('button', { class: 'btn', text: '複製', onclick: () => { navigator.clipboard.writeText(location.origin + t.share_url) } }),
  ])
  root.appendChild(shareRow)

  // 時間軸
  const timeline = el('div', { class: 'timeline' })
  for (const u of t.updates) {
    timeline.appendChild(renderUpdate(u))
  }
  root.appendChild(el('h3', { text: '時間軸' }))
  root.appendChild(timeline)

  // 底部留言框（三角色，問題4：留言＋回報合一，manager/admin 可選狀態）
  const commentInput = el('textarea', { class: 'textarea', placeholder: '留言…' })
  const commentPhotos = []
  const commentFile = el('input', { type: 'file', accept: 'image/*', multiple: 'true' })
  commentFile.addEventListener('change', async () => {
    for (const file of commentFile.files) {
      try {
        const compressed = await compressPhoto(file)
        const fd = new FormData()
        fd.append('file', compressed)
        const b = await api('/api/photos', { method: 'POST', body: fd })
        commentPhotos.push(b.data.id)
      } catch (e) {
        if (e && e.code !== 'NETWORK') continue
        alert(e.message)
      }
    }
  })
  const isMgr = me && (me.role === 'manager' || me.role === 'admin')
  const canStatus = isMgr && (t.status === 'open' || t.status === 'in_progress')
  const statusSelect = el('select', { class: 'select' })
  statusSelect.appendChild(el('option', { value: '', text: '僅留言（不更新狀態）' }))
  if (canStatus) {
    statusSelect.appendChild(el('option', { value: 'in_progress', text: '🟡 標記處理中' }))
    statusSelect.appendChild(el('option', { value: 'done', text: '🟢 標記完成並結案' }))
  }
  const commentBox = el('div', { class: 'comment-box' }, [
    commentInput,
    commentFile,
    canStatus ? statusSelect : null,
    el('button', { class: 'btn btn-primary', text: '送出', onclick: async () => {
      if (!commentInput.value.trim()) { alert('請輸入留言'); return }
      const status = statusSelect.value
      if (status === 'done' && !confirm('標記為已完成並結案？')) return
      try {
        if (status) {
          await api(`/api/tickets/${id}/updates`, {
            method: 'POST',
            body: JSON.stringify({ status, note: commentInput.value.trim(), photo_ids: commentPhotos.length ? commentPhotos : undefined }),
          })
        } else {
          await api(`/api/tickets/${id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ note: commentInput.value.trim(), photo_ids: commentPhotos.length ? commentPhotos : undefined }),
          })
        }
        location.reload()
      } catch (e) { alert(e.message) }
    } }),
  ])
  root.appendChild(commentBox)

  // 管理公司：新增回報主按鈕（保留，供快速回報）
  if (isMgr) {
    root.appendChild(el('button', { class: 'btn btn-primary btn-block', text: '＋ 新增回報', onclick: () => { location.hash = `#/report/${id}` } }))
  }

  // ⋮ 選單（編輯/作廢/重新開啟/重發連結）
  const canEdit = me && (me.role === 'manager' || me.role === 'admin' || (me.role === 'committee' && t.created_by === me.id))
  const canVoid = me && (me.role === 'manager' || me.role === 'admin')
  const canReopen = me && me.role === 'admin' && (t.status === 'done' || t.status === 'void')
  const canReshare = me && (me.role === 'manager' || me.role === 'admin')

  if (canEdit || canVoid || canReopen || canReshare) {
    const menu = el('div', { class: 'menu' })
    if (canEdit && (t.status === 'open' || t.status === 'in_progress')) {
      menu.appendChild(el('button', { class: 'btn btn-ghost', text: '編輯', onclick: () => { location.hash = `#/edit/${id}` } }))
    }
    if (canVoid && (t.status === 'open' || t.status === 'in_progress')) {
      menu.appendChild(el('button', { class: 'btn btn-danger', text: '作廢', onclick: async () => {
        const note = prompt('作廢原因（選填）')
        if (note === null) return
        if (!confirm('確定作廢此案件？')) return
        try {
          await api(`/api/tickets/${id}/void`, { method: 'POST', body: JSON.stringify({ note: note || undefined }) })
          location.reload()
        } catch (e) { alert(e.message) }
      } }))
    }
    if (canReopen) {
      menu.appendChild(el('button', { class: 'btn btn-ghost', text: '重新開啟', onclick: () => {
        // 問題8：用選單選擇狀態，不用 prompt 輸入
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
                try {
                  await api(`/api/tickets/${id}/reopen`, {
                    method: 'POST',
                    body: JSON.stringify({ status: sel.value, note: noteEl.value || undefined }),
                  })
                  location.reload()
                } catch (e) { alert(e.message) }
              } }),
            ]),
          ]),
        ])
        document.body.appendChild(modal)
      } }))
    }
    if (canReshare) {
      menu.appendChild(el('button', { class: 'btn btn-ghost', text: '重新產生分享連結', onclick: async () => {
        try {
          const b = await api(`/api/tickets/${id}/share-token`, { method: 'POST' })
          // 問題6+10：不彈框，直接更新分享輸入框
          const input = shareRow.querySelector('input')
          if (input) input.value = location.origin + b.data.share_url
        } catch (e) { alert(e.message) }
      } }))
    }
    root.appendChild(menu)
  }
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
    return el('div', { class: 'update system' }, [
      el('div', { class: 'update-head', text: `系統 · ${fmtTime(u.created_at)}` }),
      el('div', { class: 'update-body', text: u.note }),
    ])
  }
  // status
  return el('div', { class: 'update status' }, [
    el('div', { class: 'update-head' }, [statusBadge(u.status), el('span', { text: ` ${u.display_name || ''} · ${fmtTime(u.created_at)}` })]),
    u.note ? el('div', { class: 'update-body', text: u.note }) : null,
    ...(u.photo_urls || []).map((p) => thumb(p)),
  ])
}

// P3.5 編輯案件（問題5：詳情頁「編輯」原本跳 #/edit 但無此頁面）
pages.edit = async function (id) {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/ticket/' + id } }),
    el('h1', { text: '編輯案件' }),
  ]))

  let t
  try {
    const body = await api('/api/tickets/' + id)
    t = body.data
  } catch (e) {
    root.appendChild(el('p', { class: 'error', text: e.message }))
    return
  }

  const catSelect = el('select', { class: 'select' })
  api('/api/options?type=category').then((b) => {
    for (const o of b.data) {
      catSelect.appendChild(el('option', { value: String(o.id), text: o.label, selected: o.label === t.category_label ? 'selected' : null }))
    }
  }).catch(() => {})

  const locSelect = el('select', { class: 'select' })
  api('/api/options?type=location').then((b) => {
    for (const o of b.data) {
      locSelect.appendChild(el('option', { value: String(o.id), text: o.label, selected: o.label === t.location_label ? 'selected' : null }))
    }
  }).catch(() => {})

  const descEl = el('textarea', { class: 'textarea', value: t.description || '' })

  async function submit() {
    const body = {}
    if (catSelect.value) body.category_id = Number(catSelect.value)
    if (locSelect.value) body.location_id = Number(locSelect.value)
    if (descEl.value !== (t.description || '')) body.description = descEl.value
    try {
      await api(`/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      location.hash = '#/ticket/' + id
    } catch (e) { alert(e.message) }
  }

  root.appendChild(el('div', { class: 'form' }, [
    el('label', { text: '類別' }), catSelect,
    el('label', { text: '地點' }), locSelect,
    el('label', { text: '說明' }), descEl,
    el('button', { class: 'btn btn-primary', text: '儲存', onclick: submit }),
  ]))
}

// P4 新增回報（§5.4）
pages.report = function (id) {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/ticket/' + id } }),
    el('h1', { text: '新增回報' }),
  ]))

  const statusSelect = el('select', { class: 'select' })
  statusSelect.appendChild(el('option', { value: 'open', text: '待處理' }))
  statusSelect.appendChild(el('option', { value: 'in_progress', text: '處理中' }))
  statusSelect.appendChild(el('option', { value: 'done', text: '🟢 完成' }))

  const noteEl = el('textarea', { class: 'textarea', placeholder: '說明（選填）' })
  const photos = []
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'true' })
  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files) {
      try {
        const compressed = await compressPhoto(file)
        const fd = new FormData()
        fd.append('file', compressed)
        const b = await api('/api/photos', { method: 'POST', body: fd })
        photos.push(b.data.id)
      } catch (e) {
        if (e && e.code !== 'NETWORK') continue
        alert(e.message)
      }
    }
  })

  async function submit() {
    const status = statusSelect.value
    if (status === 'done' && !confirm('標記為已完成並結案？')) return
    try {
      await api(`/api/tickets/${id}/updates`, {
        method: 'POST',
        body: JSON.stringify({ status, note: noteEl.value || undefined, photo_ids: photos.length ? photos : undefined }),
      })
      location.hash = '#/ticket/' + id
    } catch (e) { alert(e.message) }
  }

  root.appendChild(el('div', { class: 'form' }, [
    el('label', { text: '狀態' }), statusSelect,
    el('label', { text: '說明' }), noteEl,
    el('label', { text: '照片' }), fileInput,
    el('button', { class: 'btn btn-primary', text: '送出回報', onclick: submit }),
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

  api('/api/stats/summary').then((b) => {
    const s = b.data
    const openTotal = s.open_count + s.in_progress_count
    const doneRate = s.month_new > 0 ? Math.round((s.month_done / s.month_new) * 100) : 0
    const cards = [
      ['待處理', s.open_count, 'red'],
      ['處理中', s.in_progress_count, 'yellow'],
      ['未結案總數', openTotal, 'blue'],
      ['本月新增', s.month_new, 'blue'],
      ['本月完成', s.month_done, 'green'],
      ['本月完成率', doneRate + '%', 'green'],
    ]
    const grid = el('div', { class: 'stats-grid' })
    for (const [label, val, color] of cards) {
      grid.appendChild(el('div', { class: 'stat-card' }, [
        el('div', { class: 'stat-num', text: String(val) }),
        el('div', { class: 'stat-label', text: label }),
      ]))
    }
    root.appendChild(grid)
  }).catch((e) => root.appendChild(el('p', { class: 'error', text: e.message })))

  // 匯出 CSV（僅 manager/admin，§5.5）
  if (me && (me.role === 'manager' || me.role === 'admin')) {
    root.appendChild(el('div', { class: 'export-row' }, [
      el('button', { class: 'btn', text: '匯出 CSV', onclick: exportCsv }),
      el('span', { class: 'hint', text: '將於外部瀏覽器開啟下載' }),
    ]))
  }
}

async function exportCsv() {
  try {
    const b = await api('/api/exports/sign', { method: 'POST', body: JSON.stringify({}) })
    const url = location.origin + b.data.url
    if (window.liff && liffReady) {
      liff.openWindow({ url, external: true })
    } else {
      window.open(url, '_blank')
    }
  } catch (e) { alert(e.message) }
}

// P6 成員管理（admin，§5.6）
pages.users = function () {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('header', { class: 'topbar' }, [
    el('button', { class: 'btn btn-ghost', text: '← 返回', onclick: () => { location.hash = '#/' } }),
    el('h1', { text: '成員管理' }),
  ]))

  api('/api/users').then((b) => {
    const allUsers = b.data
    const list = el('div', { class: 'user-list' })
    const roleLabel = { pending: '待開通', committee: '委員', manager: '主管', admin: '保全/秘書' }
    // 反向：下拉選項順序
    const roleOrder = [['pending', '待開通'], ['committee', '委員'], ['manager', '主管'], ['admin', '保全/秘書']]

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
          } catch (e) { alert(e.message) }
        })
        const activeBtn = el('button', {
          class: 'btn ' + (u.active ? 'btn-danger' : 'btn-primary'), // 問題15：停用紅/啟用藍
          text: u.active ? '停用' : '啟用',
          onclick: async () => {
            try {
              await api('/api/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ active: u.active ? 0 : 1 }) })
              u.active = u.active ? 0 : 1
              render()
            } catch (e) { alert(e.message) }
          },
        })
        list.appendChild(el('div', { class: 'card user-row' }, [
          el('span', { text: u.display_name }),
          el('span', { class: 'role-chip', text: roleLabel[u.role] || u.role }),
          roleSelect,
          activeBtn,
        ]))
      }
    }
    filterSelect.addEventListener('change', render)
    root.appendChild(el('div', { class: 'filter-row' }, [el('label', { text: '篩選：' }), filterSelect]))
    root.appendChild(list)
    render()
  }).catch((e) => root.appendChild(el('p', { class: 'error', text: e.message })))
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
  const types = [['category', '類別'], ['location', '地點'], ['description', '常用說明'], ['vendors', '廠商']]
  const tabBar = el('div', { class: 'tabs' })
  const content = el('div', {})
  let currentType = 'category'

  function renderVendors() {
    content.innerHTML = ''
    api('/api/vendors').then((b) => {
      const list = el('div', { class: 'option-list' })
      for (const v of b.data) {
        list.appendChild(el('div', { class: 'card option-row' }, [
          el('span', { text: v.name + (v.active ? '' : '（已停用）') }),
          el('button', { class: 'btn ' + (v.active ? 'btn-danger' : 'btn-primary'), text: v.active ? '停用' : '啟用', onclick: async () => {
            try { await api('/api/vendors/' + v.id, { method: 'PATCH', body: JSON.stringify({ active: v.active ? 0 : 1 }) }); renderVendors() }
            catch (e) { alert(e.message) }
          } }),
        ]))
      }
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
          } catch (e) { alert(e.message) }
        } }),
      ]))
    }).catch((e) => content.appendChild(el('p', { class: 'error', text: e.message })))
  }

  function renderOptions() {
    content.innerHTML = ''
    api('/api/options?type=' + currentType).then((b) => {
      const list = el('div', { class: 'option-list' })
      for (const o of b.data) {
        list.appendChild(el('div', { class: 'card option-row' }, [
          el('span', { text: o.label }),
          el('button', { class: 'btn btn-danger', text: '停用', onclick: async () => {
            try { await api('/api/options/' + o.id, { method: 'PATCH', body: JSON.stringify({ active: 0 }) }); renderOptions() }
            catch (e) { alert(e.message) }
          } }),
        ]))
      }
      content.appendChild(list)
    }).catch((e) => content.appendChild(el('p', { class: 'error', text: e.message })))
  }

  for (const [val, label] of types) {
    tabBar.appendChild(el('button', {
      class: 'tab' + (val === currentType ? ' active' : ''),
      text: label,
      onclick: (e) => {
        currentType = val
        for (const b of tabBar.children) b.classList.remove('active')
        e.currentTarget.classList.add('active')
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
        renderOptions()
      } catch (e) { alert(e.message) }
    } }),
  ])
  // 切換 tab 時更新新增列（廠商 tab 不顯示選項新增列）
  root.appendChild(addRow)
  const origTabClick = null
  for (const b of tabBar.children) {
    const cb = b.onclick
    b.onclick = (e) => {
      cb(e)
      addRow.style.display = currentType === 'vendors' ? 'none' : ''
    }
  }
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
  if (me && me.role === 'admin') items.push(['#/users', '👥 成員'])
  for (const [href, label] of items) {
    nav.appendChild(el('a', { href, class: 'nav-item', text: label }))
  }
}

// ---- hash router ----
function router() {
  const hash = location.hash || '#/'
  // 對 '#/admin' → slice(1)='/admin' → split('/')=['','admin']，過濾空字串取 path
  const parts = hash.slice(1).split('/').filter(Boolean)
  const path = parts[0] || ''
  const param = parts[1]
  const root = document.getElementById('page')
  root.innerHTML = ''

  // 未登入 → 先 boot
  if (!me) { boot(); return }

  switch (path) {
    case '': case 'list': pages.list(); break
    case 'new': pages.new(); break
    case 'ticket': pages.ticket(param); break
    case 'edit': pages.edit(param); break
    case 'report': pages.report(param); break
    case 'stats': pages.stats(); break
    case 'users': pages.users(); break
    case 'admin': pages.admin(); break
    default: pages.list()
  }
  renderNav()
}

// ---- boot：LIFF init + 登入 + 取 me ----
async function boot() {
  const root = document.getElementById('page')
  root.innerHTML = ''
  root.appendChild(el('p', { class: 'loading', text: '載入中…' }))

  // 測試模式：?mock=true 時用 liff-mock 插件（§1.2，繞過真實 LINE 登入）
  const isMock = new URLSearchParams(window.location.search).get('mock') === 'true'
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
      // 未登入 → 嘗試 LINE 登入
      if (liffReady && liff.isLoggedIn()) {
        const idToken = liff.getIDToken()
        if (idToken) {
          try {
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
              body: JSON.stringify({ id_token: idToken }),
            })
            const b = await api('/api/auth/me')
            me = b.data
          } catch (e2) {
            root.innerHTML = ''
            root.appendChild(el('p', { class: 'error', text: '登入失敗，請重新從 LINE 開啟' }))
            return
          }
        }
      } else if (liffReady) {
        // 不指定 redirectUri，讓 LIFF SDK 用 LIFF app 設定的 Endpoint URL
        liff.login()
        return
      } else if (window.liff) {
        // LIFF SDK 在但 init 失敗（外部瀏覽器）→ 重試 init 後登入
        try {
          await liff.init({ liffId: LIFF_ID })
          liffReady = true
          if (liff.isLoggedIn()) {
            const idToken = liff.getIDToken()
            if (idToken) {
              await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
                body: JSON.stringify({ id_token: idToken }),
              })
              const b = await api('/api/auth/me')
              me = b.data
              router()
              return
            }
          }
          liff.login()
          return
        } catch (e2) {
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
      // pending → P0
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

  router()
}

// ---- 啟動 ----
window.addEventListener('hashchange', router)
boot()
