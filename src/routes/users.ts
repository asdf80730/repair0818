// src/routes/users.ts — 成員管理（§4.6，admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { updateUserSchema } from '../lib/validate'
import type { Env } from '../lib/env'

export const userRoutes = new Hono<Env>()

// GET /api/users — admin，列表（含 pending 與停用）（§4.6）
userRoutes.get('/', requireAuth({ roles: ['admin'] }), async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, display_name, role, active, created_at, approved_at FROM users ORDER BY id',
  ).all()
  return ok(c, rows.results)
})

// PATCH /api/users/:id — admin，防呆規則見 §4.6（ADMIN_LOCKED）
userRoutes.patch('/:id', requireAuth({ roles: ['admin'] }), zValidator('json', updateUserSchema), async (c) => {
  // TODO: 改 role/active/display_name（M2）— 防呆：不可停用自己、不可對自己降權、至少保留一位 admin
  return fail(c, 501, 'INTERNAL', '尚未實作（M2）')
})
