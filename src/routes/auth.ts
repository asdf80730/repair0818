// src/routes/auth.ts — session / me / logout（§4.2）
// 註冊於全域 requireAuth() 之上；me/logout 內部各自掛 requireAuth({ allowPending: true })

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { ok, fail } from '../lib/respond'
import { requireAuth, signSessionJWT, setSessionCookie, clearSessionCookie } from '../lib/auth'
import type { Env } from '../lib/env'

export const authRoutes = new Hono<Env>()

// POST /api/auth/session — 見 §3.1。需 CSRF header，不需已登入。
// 實作（M2 里程碑）：向 LINE 驗證 id_token → 建/取 user → 簽 JWT → Set-Cookie
const sessionSchema = z.object({ id_token: z.string().min(1) })

authRoutes.post('/session', zValidator('json', sessionSchema), async (c) => {
  // TODO: verify against official docs — LINE ID Token 驗證端點與參數
  // POST https://api.line.me/oauth2/v2.1/verify
  // 核對 aud == LINE_CHANNEL_ID、iss == 'https://access.line.me'、exp 未過期
  // 查無此人 → 建立 pending 使用者（display_name 取 name claim，缺省填「LINE 用戶」）
  // 簽發 JWT → setSessionCookie
  return fail(c, 501, 'INTERNAL', '尚未實作（M2）')
})

// GET /api/auth/me — requireAuth({ allowPending: true })
authRoutes.get('/me', requireAuth({ allowPending: true }), async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    'SELECT id, display_name, role FROM users WHERE id = ?',
  )
    .bind(user.id)
    .first<{ id: number; display_name: string; role: string }>()
  if (!row) return fail(c, 401, 'UNAUTHORIZED', '請重新登入')
  return ok(c, { id: row.id, display_name: row.display_name, role: row.role })
})

// POST /api/auth/logout — requireAuth({ allowPending: true })，清除 Cookie
authRoutes.post('/logout', requireAuth({ allowPending: true }), async (c) => {
  clearSessionCookie(c)
  return ok(c, { logged_out: true })
})
