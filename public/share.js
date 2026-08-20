// 派工單公開頁（§5.8，免登入）
// 顯示白名單欄位 + 照片；token 無效顯示「連結已失效」
'use strict'

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue // 跳過 null/undefined
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
}

const statusMap = { open: ['待處理', 'red'], in_progress: ['處理中', 'yellow'], done: ['已完成', 'green'], void: ['已作廢', 'black'] }

// H2：公開派工頁照片 Lightbox（與 app.js 一致）
function openLightbox(src) {
  const mask = el('div', { class: 'lightbox', onclick: () => mask.remove() }, [
    el('img', { src, class: 'lightbox-img' }),
  ])
  document.body.appendChild(mask)
}
function thumb(src) {
  return el('img', { src, class: 'thumb', onclick: (e) => { e.stopPropagation(); openLightbox(src) } })
}

async function load() {
  const root = document.getElementById('share-app')
  root.innerHTML = ''
  root.appendChild(el('div', { class: 'loading-wrap' }, [
    el('div', { class: 'spinner' }),
    el('div', { class: 'loading-text', text: '載入中…' }),
  ]))
  const token = new URLSearchParams(location.search).get('token') || location.pathname.split('/').filter(Boolean).pop()

  try {
    const res = await fetch('/api/share/' + token)
    if (!res.ok) {
      root.querySelector('.loading-wrap')?.remove()
      root.appendChild(el('div', { class: 'pending' }, [
        el('h1', { text: '🔗 連結已失效' }),
        el('p', { text: '請向管理公司索取新連結' }),
      ]))
      return
    }
    const body = await res.json()
    const t = body.data
    const [statusLabel, statusColor] = statusMap[t.status] || [t.status, 'gray']

    root.querySelector('.loading-wrap')?.remove()
    root.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: t.title }),
      el('div', {}, [el('span', { class: `badge badge-${statusColor}`, text: statusLabel })]),
      el('p', { text: `類別：${t.category_label}｜地點：${t.location_label}` }),
      t.description ? el('p', { class: 'desc', text: t.description }) : null,
      el('p', { class: 'meta', text: `狀態更新於 ${fmtTime(t.last_activity_at)}` }),
    ]))

    if (t.photos && t.photos.length) {
      const wall = el('div', { class: 'photo-wall' })
      for (const url of t.photos) wall.appendChild(thumb(url)) // H2：支援 Lightbox
      root.appendChild(wall)
    }
  } catch (e) {
    root.querySelector('.loading-wrap')?.remove()
    root.appendChild(el('p', { class: 'error', text: '載入失敗' }))
  }
}

load()
