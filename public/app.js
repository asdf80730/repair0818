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
async function api(path, options = {}) {
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
      await new Promise((resolve) => liff.login({ redirectUri: window.location.href }))
      // login 會跳轉，這裡不會繼續
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
    return el('div', { class: 'card ticket-card', onclick: () => { location.hash = '#/ticket/' + t.id } }, [
      el('div', { class: 'ticket-title' }, [statusBadge(t.status), el('span', { text: t.title })]),
      el('div', { class: 'ticket-meta', text: `廠商：${t.vendor_name || '未指派'}` }),
      el('div', { class: 'ticket-meta', text: `最後活動：${fmtTime(t.last_activity_at)}` }),
      stale ? el('div', { class: 'stale', text: `⚠ ${days} 天未更新` }) : null,
    ])
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

  // 類別 chips
  const catChips = el('div', { class: 'chips' })
  let selectedCat = null
  api('/api/options?type=category').then((b) => {
    for (const o of b.data) {
      catChips.appendChild(el('button', {
        class: 'chip', text: o.label,
        onclick: (e) => {
          selectedCat = o.id
          for (const c of catChips.children) c.classList.remove('active')
          e.currentTarget.classList.add('active')
        },
      }))
    }
  }).catch(() => {})

  // 地點 chips
  const locChips = el('div', { class: 'chips' })
  let selectedLoc = null
  api('/api/options?type=location').then((b) => {
    for (const o of b.data) {
      locChips.appendChild(el('button', {
        class: 'chip', text: o.label,
        onclick: (e) => {
          selectedLoc = o.id
          for (const c of locChips.children) c.classList.remove('active')
          e.currentTarget.classList.add('active')
        },
      }))
    }
  }).catch(() => {})

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
        photoPreview.appendChild(el('img', { src: body.data.url, class: 'thumb' }))
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
    el('label', { text: '類別' }), catChips,
    el('label', { text: '地點' }), locChips,
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

  // 照片牆
  if (t.photos && t.photos.length) {
    const wall = el('div', { class: 'photo-wall' })
    for (const url of t.photos) wall.appendChild(el('img', { src: url, class: 'photo' }))
    root.appendChild(wall)
  }

  // 分享連結
  const shareRow = el('div', { class: 'share-row' }, [
    el('span', { text: '分享連結：' }),
    el('input', { class: 'input', value: location.origin + t.share_url, readonly: 'true' }),
    el('button', { class: 'btn', text: '複製', onclick: () => { navigator.clipboard.writeText(location.origin + t.share_url); alert('已複製') } }),
  ])
  root.appendChild(shareRow)

  // 時間軸
  const timeline = el('div', { class: 'timeline' })
  for (const u of t.updates) {
    timeline.appendChild(renderUpdate(u))
  }
  root.appendChild(el('h3', { text: '時間軸' }))
  root.appendChild(timeline)

  // 底部留言框（三角色）
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
  const commentBox = el('div', { class: 'comment-box' }, [
    commentInput,
    commentFile,
    el('button', { class: 'btn btn-primary', text: '送出留言', onclick: async () => {
      if (!commentInput.value.trim()) { alert('請輸入留言'); return }
      try {
        await api(`/api/tickets/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ note: commentInput.value.trim(), photo_ids: commentPhotos.length ? commentPhotos : undefined }),
        })
        location.reload()
      } catch (e) { alert(e.message) }
    } }),
  ])
  root.appendChild(commentBox)

  // 管理公司：新增回報主按鈕
  if (me && (me.role === 'manager' || me.role === 'admin')) {
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
      menu.appendChild(el('button', { class: 'btn btn-ghost', text: '重新開啟', onclick: async () => {
        const status = prompt('重新開啟為（待處理/處理中）？', '處理中')
        if (!status) return
        const note = prompt('備註（選填）')
        if (note === null) return
        try {
          await api(`/api/tickets/${id}/reopen`, {
            method: 'POST',
            body: JSON.stringify({ status: status === '待處理' ? 'open' : 'in_progress', note: note || undefined }),
          })
          location.reload()
        } catch (e) { alert(e.message) }
      } }))
    }
    if (canReshare) {
      menu.appendChild(el('button', { class: 'btn btn-ghost', text: '重新產生分享連結', onclick: async () => {
        try {
          const b = await api(`/api/tickets/${id}/share-token`, { method: 'POST' })
          alert('新連結：' + location.origin + b.data.share_url)
          location.reload()
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
      ...(u.photo_urls || []).map((p) => el('img', { src: p, class: 'thumb' })),
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
    ...(u.photo_urls || []).map((p) => el('img', { src: p, class: 'thumb' })),
  ])
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
    const cards = [
      ['待處理', s.open_count, 'red'],
      ['處理中', s.in_progress_count, 'yellow'],
      ['本月新增', s.month_new, 'blue'],
      ['本月完成', s.month_done, 'green'],
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
    const list = el('div', { class: 'user-list' })
    for (const u of b.data) {
      const roleSelect = el('select', { class: 'select' })
      for (const r of ['pending', 'committee', 'manager', 'admin']) {
        roleSelect.appendChild(el('option', { value: r, text: r, selected: u.role === r ? 'selected' : null }))
      }
      roleSelect.addEventListener('change', async () => {
        try {
          await api('/api/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ role: roleSelect.value }) })
          alert('已更新角色')
        } catch (e) { alert(e.message) }
      })
      const activeBtn = el('button', {
        class: 'btn btn-ghost',
        text: u.active ? '停用' : '啟用',
        onclick: async () => {
          try {
            await api('/api/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ active: u.active ? 0 : 1 }) })
            location.reload()
          } catch (e) { alert(e.message) }
        },
      })
      list.appendChild(el('div', { class: 'card user-row' }, [
        el('span', { text: u.display_name }),
        roleSelect,
        activeBtn,
      ]))
    }
    root.appendChild(list)
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

  // 選項管理三個 tab
  const types = [['category', '類別'], ['location', '地點'], ['description', '常用說明']]
  const tabBar = el('div', { class: 'tabs' })
  const content = el('div', {})
  let currentType = 'category'

  function renderOptions() {
    content.innerHTML = ''
    api('/api/options?type=' + currentType).then((b) => {
      const list = el('div', { class: 'option-list' })
      for (const o of b.data) {
        list.appendChild(el('div', { class: 'card option-row' }, [
          el('span', { text: o.label }),
          el('button', { class: 'btn btn-ghost', text: '停用', onclick: async () => {
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
        renderOptions()
      },
    }))
  }
  root.appendChild(tabBar)
  root.appendChild(content)
  renderOptions()

  // 新增選項
  const newLabel = el('input', { class: 'input', placeholder: '新選項名稱' })
  root.appendChild(el('div', { class: 'add-row' }, [
    newLabel,
    el('button', { class: 'btn', text: '新增', onclick: async () => {
      if (!newLabel.value.trim()) return
      try {
        await api('/api/options', { method: 'POST', body: JSON.stringify({ type: currentType, label: newLabel.value.trim(), sort_order: 0 }) })
        newLabel.value = ''
        renderOptions()
      } catch (e) { alert(e.message) }
    } }),
  ]))

  // 廠商管理
  root.appendChild(el('h3', { text: '廠商管理' }))
  const vendorList = el('div', { class: 'option-list' })
  api('/api/vendors').then((b) => {
    for (const v of b.data) {
      vendorList.appendChild(el('div', { class: 'card option-row' }, [
        el('span', { text: v.name + (v.active ? '' : '（已停用）') }),
        el('button', { class: 'btn btn-ghost', text: v.active ? '停用' : '啟用', onclick: async () => {
          try { await api('/api/vendors/' + v.id, { method: 'PATCH', body: JSON.stringify({ active: v.active ? 0 : 1 }) }); location.reload() }
          catch (e) { alert(e.message) }
        } }),
      ]))
    }
  }).catch((e) => vendorList.appendChild(el('p', { class: 'error', text: e.message })))
  root.appendChild(vendorList)

  const newVendor = el('input', { class: 'input', placeholder: '新廠商名稱' })
  root.appendChild(el('div', { class: 'add-row' }, [
    newVendor,
    el('button', { class: 'btn', text: '新增廠商', onclick: async () => {
      if (!newVendor.value.trim()) return
      try {
        await api('/api/vendors', { method: 'POST', body: JSON.stringify({ name: newVendor.value.trim() }) })
        newVendor.value = ''
        location.reload()
      } catch (e) { alert(e.message) }
    } }),
  ]))
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
  const [path, param] = hash.slice(1).split('/')
  const root = document.getElementById('page')
  root.innerHTML = ''

  // 未登入 → 先 boot
  if (!me) { boot(); return }

  switch (path) {
    case '': case 'list': pages.list(); break
    case 'new': pages.new(); break
    case 'ticket': pages.ticket(param); break
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

  // LIFF init
  if (window.liff) {
    try {
      await liff.init({ liffId: LIFF_ID })
      liffReady = true
    } catch (e) {
      // LIFF init 失敗（外部瀏覽器）→ 仍嘗試用既有 cookie
      console.warn('LIFF init failed', e)
    }
  }

  // 取 me
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
        liff.login({ redirectUri: location.href })
        return
      } else {
        root.innerHTML = ''
        root.appendChild(el('p', { class: 'error', text: '請從 LINE 圖文選單開啟本系統' }))
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
