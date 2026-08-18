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
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的成員 id')
  const me = c.get('user')
  const body = c.req.valid('json')

  const target = await c.env.DB.prepare(
    'SELECT id, role, active FROM users WHERE id = ?',
  ).bind(id).first<{ id: number; role: string; active: number }>()
  if (!target) return fail(c, 404, 'NOT_FOUND', '成員不存在')

  // 防呆規則（§4.6）
  // 1. 不可停用自己
  if (id === me.id && body.active === 0) {
    return fail(c, 400, 'ADMIN_LOCKED', '不可停用自己')
  }
  // 2. 不可對自己降權
  if (id === me.id && body.role !== undefined && body.role !== 'admin') {
    return fail(c, 400, 'ADMIN_LOCKED', '不可對自己降權')
  }
  // 3. 至少保留一位 admin（操作後 active=1 AND role='admin' 人數須 ≥ 1）
  const newRole = body.role ?? target.role
  const newActive = body.active ?? target.active
  if (target.role === 'admin' && target.active === 1 && (newRole !== 'admin' || newActive === 0)) {
    const adminCount = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1",
    ).first<{ n: number }>()
    if ((adminCount?.n ?? 0) <= 1) {
      return fail(c, 400, 'ADMIN_LOCKED', '系統至少需保留一位管理員')
    }
  }

  // 動態組 UPDATE
  const sets: string[] = []
  const binds: unknown[] = []
  if (body.role !== undefined) { sets.push('role = ?'); binds.push(body.role) }
  if (body.active !== undefined) { sets.push('active = ?'); binds.push(body.active) }
  if (body.display_name !== undefined) { sets.push('display_name = ?'); binds.push(body.display_name) }
  if (sets.length === 0) return ok(c, { id, updated: false })

  binds.push(id)
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  return ok(c, { id, updated: true })
})
