// src/routes/photos.ts — 上傳/讀取（§4.4）
// 註冊於全域 requireAuth() 之下（已開通使用者）

import { Hono } from 'hono'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { nowIso } from '../lib/time'
import type { Env } from '../lib/env'

export const photoRoutes = new Hono<Env>()

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BYTES = 10 * 1024 * 1024 // 10MB

/** 驗證 magic bytes（§4.4）：JPEG FF D8 FF、PNG 89 50 4E 47、WebP RIFF????WEBP */
function checkMagicBytes(bytes: Uint8Array, contentType: string): boolean {
  if (bytes.length < 12) return false
  if (contentType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  }
  if (contentType === 'image/webp') {
    // RIFF????WEBP
    return (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    )
  }
  return false
}

// POST /api/photos — 三角色，multipart（§4.4）
photoRoutes.post('/', requireAuth(), async (c) => {
  const user = c.get('user')

  // 解析 multipart form
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return fail(c, 400, 'VALIDATION_ERROR', '無法解析上傳內容')
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return fail(c, 400, 'VALIDATION_ERROR', '缺少 file 欄位')
  }

  // 白名單 content-type（不含 HEIC）
  const contentType = file.type
  if (!(ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    return fail(c, 400, 'VALIDATION_ERROR', '不支援的圖片格式')
  }

  // ≤ 10MB
  if (file.size > MAX_BYTES) {
    return fail(c, 400, 'VALIDATION_ERROR', '圖片超過 10MB 限制')
  }

  // 驗 magic bytes
  const buffer = new Uint8Array(await file.arrayBuffer())
  if (!checkMagicBytes(buffer, contentType)) {
    return fail(c, 400, 'VALIDATION_ERROR', '圖片內容與格式不符')
  }

  // R2 key = photos/{uuid}（無副檔名），httpMetadata.contentType 一併寫入
  const uuid = crypto.randomUUID()
  const r2Key = `photos/${uuid}`
  await c.env.PHOTOS.put(r2Key, buffer, {
    httpMetadata: { contentType },
  })

  // photos 表存 content_type、size_bytes，target_id=NULL（待綁定）
  const insert = await c.env.DB.prepare(
    `INSERT INTO photos (r2_key, content_type, size_bytes, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(r2Key, contentType, file.size, user.id, nowIso()).run()
  const photoId = insert.meta.last_row_id

  return ok(c, { id: photoId, url: `/api/photos/${photoId}` }, 201)
})

// GET /api/photos/:id — 已開通使用者（§4.4）
photoRoutes.get('/:id', requireAuth(), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return fail(c, 400, 'VALIDATION_ERROR', '無效的照片 id')
  }
  const user = c.get('user')

  const photo = await c.env.DB.prepare(
    'SELECT id, r2_key, content_type, target_type, target_id, uploaded_by FROM photos WHERE id = ?',
  ).bind(id).first<{
    id: number; r2_key: string; content_type: string
    target_type: string | null; target_id: number | null; uploaded_by: number
  }>()

  if (!photo) return fail(c, 404, 'NOT_FOUND', '照片不存在')

  // 歸屬檢查：target_id IS NULL（未綁定）的照片僅上傳本人可取；
  // 已綁定照片所有已開通使用者可讀（§4.4）
  if (photo.target_id === null && photo.uploaded_by !== user.id) {
    return fail(c, 404, 'NOT_FOUND', '照片不存在')
  }

  const obj = await c.env.PHOTOS.get(photo.r2_key)
  if (!obj) return fail(c, 404, 'NOT_FOUND', '照片不存在')

  // 副檔名依 content_type 推斷
  const ext = photo.content_type === 'image/jpeg' ? 'jpg'
    : photo.content_type === 'image/png' ? 'png'
    : 'webp'

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': photo.content_type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="photo-${photo.id}.${ext}"`,
      'Cache-Control': 'private, max-age=86400', // 24 小時（§4.4）
    },
  })
})

export { ALLOWED_TYPES, MAX_BYTES }
