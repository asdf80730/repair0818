// src/routes/users.ts — 成員管理（§4.6，admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { updateUserSchema } from '../lib/validate'
import { nowIso } from '../lib/time'
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
    'SELECT id, role, active, approved_at FROM users WHERE id = ?',
  ).bind(id).first<{ id: number; role: string; active: number; approved_at: string | null }>()
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
  // D8：由 pending 開通為其他角色時，記錄 approved_at（僅首次開通，已開通者不覆寫）
  // role 只能設 committee/manager/admin（zod enum 不含 pending），故 body.role 有值即代表開通
  if (body.role !== undefined && target.role === 'pending' && target.approved_at === null) {
    sets.push('approved_at = ?'); binds.push(nowIso())
  }
  if (sets.length === 0) return ok(c, { id, updated: false })

  // E8：降權/停用 admin 時，用條件式 UPDATE 確保至少保留一位 admin（防雙管理員互相降權的零管理員競態）
  const isDemotingAdmin = target.role === 'admin' && target.active === 1 &&
    (body.role !== undefined && body.role !== 'admin' || body.active === 0)
  let where = 'WHERE id = ?'
  if (isDemotingAdmin) {
    where += " AND (SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1) > 1"
  }
  binds.push(id)
  const res = await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} ${where}`).bind(...binds).run()
  if (isDemotingAdmin && res.meta.changes === 0) {
    return fail(c, 400, 'ADMIN_LOCKED', '系統至少需保留一位管理員')
  }
  return ok(c, { id, updated: true })
})
