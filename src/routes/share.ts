// src/routes/share.ts — 公開端點（§4.5，免登入）
// 註冊於全域 requireAuth() 之上；端點內自驗（白名單欄位，禁止 SELECT *）

import { Hono } from 'hono'
import { fail } from '../lib/respond'
import type { Env } from '../lib/env'

export const shareRoutes = new Hono<Env>()

// GET /api/share/:token — 公開，免登入（§4.5）
shareRoutes.get('/:token', async (c) => {
  const token = c.req.param('token')
  // 只接受標準 UUID 格式，擋掉非 UUID 的掃描/猜測請求（§4.5 安全性，防暴力列舉）
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(token)) return fail(c, 404, 'NOT_FOUND', '連結已失效')
  const row = await c.env.DB.prepare(
    `SELECT id, category_label, location_label, description, status, created_at, last_activity_at
     FROM tickets WHERE share_token = ?`,
  ).bind(token).first<{
    id: number; category_label: string; location_label: string; description: string | null
    status: string; created_at: string; last_activity_at: string
  }>()

  if (!row) {
    // token 無效 → 404；share.html 顯示人讀的「連結已失效」頁面（非 JSON）
    return fail(c, 404, 'NOT_FOUND', '連結已失效')
  }

  // 白名單欄位（§4.5）：title、status、category_label、location_label、description、
  // photos（target_type='ticket'）、created_at、last_activity_at
  const title = `${row.category_label}－${row.location_label} #${String(row.id).padStart(4, '0')}`
  const photos = await c.env.DB.prepare(
    "SELECT id FROM photos WHERE target_type = 'ticket' AND target_id = ? ORDER BY id",
  ).bind(row.id).all<{ id: number }>()

  return c.json({
    ok: true,
    data: {
      title,
      status: row.status,
      category_label: row.category_label,
      location_label: row.location_label,
      description: row.description,
      photos: photos.results.map((p) => `/api/share/${token}/photos/${p.id}`),
      created_at: row.created_at,
      last_activity_at: row.last_activity_at,
    },
  }, 200, {
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
  })
})

// GET /api/share/:token/photos/:photo_id — 公開，免登入（§4.5）
shareRoutes.get('/:token/photos/:photo_id', async (c) => {
  const token = c.req.param('token')
  // 只接受標準 UUID 格式，擋掉非 UUID 的掃描（§4.5）
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(token)) return fail(c, 404, 'NOT_FOUND', '連結已失效')
  const photoId = Number(c.req.param('photo_id'))

  // 該 photo 必須屬於該 token 對應的 ticket，且 target_type='ticket'
  const row = await c.env.DB.prepare(
    `SELECT p.r2_key, p.content_type
     FROM photos p
     JOIN tickets t ON t.id = p.target_id
     WHERE t.share_token = ? AND p.id = ? AND p.target_type = 'ticket'`,
  ).bind(token, photoId).first<{ r2_key: string; content_type: string }>()

  if (!row) return fail(c, 404, 'NOT_FOUND', '照片不存在')

  const obj = await c.env.PHOTOS.get(row.r2_key)
  if (!obj) return fail(c, 404, 'NOT_FOUND', '照片不存在')

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': row.content_type,
      'Cache-Control': 'private, max-age=300', // §4.5
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
