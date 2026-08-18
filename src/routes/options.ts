// src/routes/options.ts — 選項管理（§4.6，D5：manager/admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { createOptionSchema, updateOptionSchema } from '../lib/validate'
import { nowIso } from '../lib/time'
import type { Env } from '../lib/env'

export const optionRoutes = new Hono<Env>()

// GET /api/options?type=... — 三角色，只回 active（§4.6）
optionRoutes.get('/', requireAuth(), async (c) => {
  const type = c.req.query('type')
  if (type !== 'category' && type !== 'location' && type !== 'description') {
    return fail(c, 400, 'VALIDATION_ERROR', 'type 必須是 category/location/description')
  }
  const rows = await c.env.DB.prepare(
    'SELECT id, type, label, sort_order, active FROM options WHERE type = ? AND active = 1 ORDER BY sort_order, id',
  )
    .bind(type)
    .all()
  return ok(c, rows.results)
})

// POST /api/options — manager/admin（§4.6）
optionRoutes.post('/', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', createOptionSchema), async (c) => {
  const body = c.req.valid('json')
  const now = nowIso()

  // (type,label) 已存在 → active=1 並更新 sort_order，否則新增
  const existing = await c.env.DB.prepare(
    'SELECT id FROM options WHERE type = ? AND label = ?',
  ).bind(body.type, body.label).first<{ id: number }>()

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE options SET active = 1, sort_order = ? WHERE id = ?',
    ).bind(body.sort_order, existing.id).run()
    return ok(c, { id: existing.id, reactivated: true })
  }

  const insert = await c.env.DB.prepare(
    'INSERT INTO options (type, label, sort_order, active, created_at) VALUES (?, ?, ?, 1, ?)',
  ).bind(body.type, body.label, body.sort_order, now).run()
  return ok(c, { id: insert.meta.last_row_id, reactivated: false }, 201)
})

// PATCH /api/options/:id — manager/admin（§4.6）
optionRoutes.patch('/:id', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', updateOptionSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的選項 id')
  const body = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM options WHERE id = ?',
  ).bind(id).first<{ id: number }>()
  if (!existing) return fail(c, 404, 'NOT_FOUND', '選項不存在')

  // 動態組 UPDATE（只更新提供的欄位）
  const sets: string[] = []
  const binds: unknown[] = []
  if (body.label !== undefined) { sets.push('label = ?'); binds.push(body.label) }
  if (body.sort_order !== undefined) { sets.push('sort_order = ?'); binds.push(body.sort_order) }
  if (body.active !== undefined) { sets.push('active = ?'); binds.push(body.active) }
  if (sets.length === 0) return ok(c, { id, updated: false })

  binds.push(id)
  await c.env.DB.prepare(`UPDATE options SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  return ok(c, { id, updated: true })
})
