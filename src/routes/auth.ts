// src/routes/auth.ts — session / me / logout（§4.2）
// 註冊於全域 requireAuth() 之上；me/logout 內部各自掛 requireAuth({ allowPending: true })

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { ok, fail } from '../lib/respond'
import { requireAuth, signSessionJWT, setSessionCookie, clearSessionCookie } from '../lib/auth'
import { nowIso } from '../lib/time'
import type { Env } from '../lib/env'

export const authRoutes = new Hono<Env>()

// POST /api/auth/session — 見 §3.1。需 CSRF header，不需已登入。
// 向 LINE 驗證 id_token → 建/取 user → 簽 JWT → Set-Cookie
const sessionSchema = z.object({ id_token: z.string().min(1) })

const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'
const LINE_ISS = 'https://access.line.me'

type LineIDTokenPayload = {
  iss: string
  sub: string
  aud: string
  exp: number
  name?: string
}

authRoutes.post('/session', zValidator('json', sessionSchema), async (c) => {
  const { id_token } = c.req.valid('json')
  const channelId = c.env.LINE_CHANNEL_ID

  // 1. 向 LINE 驗證 id_token（ctx7 確認官方端點，POST 帶 id_token + client_id）
  let payload: LineIDTokenPayload
  try {
    const res = await fetch(LINE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token, client_id: channelId }),
    })
    if (!res.ok) {
      return fail(c, 401, 'UNAUTHORIZED', 'LINE ID token 驗證失敗')
    }
    payload = (await res.json()) as LineIDTokenPayload
  } catch {
    return fail(c, 500, 'INTERNAL', '無法連線 LINE 驗證服務')
  }

  // 2. 核對 aud == LINE_CHANNEL_ID、iss == 'https://access.line.me'、exp 未過期
  if (payload.aud !== channelId || payload.iss !== LINE_ISS) {
    return fail(c, 401, 'UNAUTHORIZED', 'LINE ID token 驗證失敗')
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    return fail(c, 401, 'UNAUTHORIZED', 'LINE ID token 已過期')
  }

  // 3. 查無此人 → 建立 pending 使用者（display_name 取 name claim，缺省填「LINE 用戶」）
  const displayName = payload.name && payload.name.trim() !== '' ? payload.name.trim() : 'LINE 用戶'
  let userId: number

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE line_user_id = ?',
  ).bind(payload.sub).first<{ id: number }>()

  if (existing) {
    userId = existing.id
  } else {
    // F5（v1.1.14）：INSERT ... ON CONFLICT 防雙登入競態（兩請求同時查無→同時 INSERT，UNIQUE 炸 500）
    const now = nowIso()
    const insert = await c.env.DB.prepare(
      `INSERT INTO users (line_user_id, display_name, role, active, created_at)
       VALUES (?, ?, 'pending', 1, ?)
       ON CONFLICT(line_user_id) DO NOTHING`,
    )
      .bind(payload.sub, displayName, now)
      .run()
    if (insert.meta.last_row_id) {
      userId = insert.meta.last_row_id
    } else {
      // 競態：另一請求已建立 → 重查
      const row = await c.env.DB.prepare(
        'SELECT id FROM users WHERE line_user_id = ?',
      ).bind(payload.sub).first<{ id: number }>()
      userId = row!.id
    }
  }

  // 4. 簽發 JWT → Set-Cookie
  const jwt = await signSessionJWT({ id: userId }, c.env.JWT_SECRET)
  setSessionCookie(c, jwt)
  return ok(c, { logged_in: true, user_id: userId })
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
