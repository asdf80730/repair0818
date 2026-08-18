// src/routes/photos.ts — 上傳/讀取（§4.4）
// 註冊於全域 requireAuth() 之下（已開通使用者）

import { Hono } from 'hono'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import type { Env } from '../lib/env'

export const photoRoutes = new Hono<Env>()

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BYTES = 10 * 1024 * 1024 // 10MB

// POST /api/photos — 三角色，multipart（§4.4）
photoRoutes.post('/', requireAuth(), async (c) => {
  // TODO: 上傳（M3）— 白名單 content-type、magic bytes、≤10MB、R2 key=photos/{uuid}
  return fail(c, 501, 'INTERNAL', '尚未實作（M3）')
})

// GET /api/photos/:id — 已開通使用者（§4.4）
photoRoutes.get('/:id', requireAuth(), async (c) => {
  // TODO: 讀取（M3）— 歸屬檢查、Content-Type、Cache-Control: private, max-age=86400
  return fail(c, 501, 'INTERNAL', '尚未實作（M3）')
})

export { ALLOWED_TYPES, MAX_BYTES }
