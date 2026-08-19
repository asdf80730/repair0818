// src/routes/options.ts — 選項管理（§4.6，D5：manager/admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { createOptionSchema, updateOptionSchema, listOptionsQuerySchema } from '../lib/validate'
import { nowIso } from '../lib/time'
import { assertValidAssoc, assertCategoryIds } from '../lib/db'
import type { Env } from '../lib/env'

export const optionRoutes = new Hono<Env>()

// GET /api/options — 三種模式（§4.6 v1.1.7）
// ?type=X                     → 僅 active（建單用，不附 category_ids）
// ?type=X&category_id=N       → 該類別關聯＋通用，僅 active
// ?type=X&include_inactive=1  → 含停用，附 category_ids（P7 用，限 manager/admin）
optionRoutes.get('/', requireAuth(), zValidator('query', listOptionsQuerySchema), async (c) => {
  const q = c.req.valid('query')
  const user = c.get('user')

  // include_inactive 限 manager/admin（同路由雙權限，handler 內判）
  if (q.include_inactive && user.role !== 'manager' && user.role !== 'admin') {
    return fail(c, 403, 'FORBIDDEN', '權限不足')
  }

  const activeClause = q.include_inactive ? '' : ' AND o.active = 1'
  let sql: string
  let binds: unknown[]

  if (q.category_id !== undefined) {
    // 驗證 category_id 存在且 type=category（不存在 → 400 非回空）
    const cat = await c.env.DB.prepare(
      "SELECT id FROM options WHERE id = ? AND type = 'category'",
    ).bind(q.category_id).first()
    if (!cat) return fail(c, 400, 'VALIDATION_ERROR', '類別不存在')
    // 該類別關聯＋通用（EXISTS/NOT EXISTS 防重複列）
    sql = `SELECT o.id, o.type, o.label, o.sort_order, o.active
      FROM options o
      WHERE o.type = ? AND o.active = 1
        AND (
          EXISTS (SELECT 1 FROM option_categories oc
                  WHERE oc.option_id = o.id AND oc.category_id = ?)
          OR NOT EXISTS (SELECT 1 FROM option_categories oc2
                         WHERE oc2.option_id = o.id)
        )
      ORDER BY o.sort_order, o.id`
    binds = [q.type, q.category_id]
  } else {
    sql = `SELECT o.id, o.type, o.label, o.sort_order, o.active
      FROM options o
      WHERE o.type = ?${activeClause}
      ORDER BY o.sort_order, o.id`
    binds = [q.type]
  }

  const rows = await c.env.DB.prepare(sql).bind(...binds).all<{ id: number; type: string; label: string; sort_order: number; active: number }>()

  // include_inactive 模式附 category_ids（P7 預先勾選）
  if (q.include_inactive) {
    const ids = rows.results.map(r => r.id)
    const assoc = new Map<number, number[]>()
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      const assocRows = await c.env.DB.prepare(
        `SELECT option_id, category_id FROM option_categories WHERE option_id IN (${placeholders})`,
      ).bind(...ids).all<{ option_id: number; category_id: number }>()
      for (const a of assocRows.results) {
        if (!assoc.has(a.option_id)) assoc.set(a.option_id, [])
        assoc.get(a.option_id)!.push(a.category_id)
      }
    }
    return ok(c, rows.results.map(r => ({ ...r, category_ids: assoc.get(r.id) ?? [] })))
  }

  return ok(c, rows.results)
})

// POST /api/options — manager/admin（§4.6）
// upsert：兩階段寫入（先取 id 再寫關聯），為 CLAUDE.md 規則 2 明文例外
optionRoutes.post('/', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', createOptionSchema), async (c) => {
  const body = c.req.valid('json')
  const now = nowIso()
  const categoryIds = body.category_ids !== undefined ? [...new Set(body.category_ids)] : undefined

  // 第 0 趟：assertCategoryIds（純讀，任何寫入之前）——POST 的 option 是新增，type 由 createOptionSchema 保證
  if (categoryIds !== undefined && categoryIds.length > 0) {
    const check = await assertCategoryIds(c, categoryIds)
    if (!check.ok) return fail(c, 400, 'VALIDATION_ERROR', check.reason)
  }

  // 第 1 趟：先查是否已存在（決定 reactivated）
  const existing = await c.env.DB.prepare(
    'SELECT id FROM options WHERE type = ? AND label = ?',
  ).bind(body.type, body.label).first<{ id: number }>()
  const reactivated = !!existing

  // upsert 取 id（RETURNING，upsert 命中既有列時 meta.last_row_id 不可靠）
  const inserted = await c.env.DB.prepare(
    `INSERT INTO options (type, label, sort_order, active, created_at) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(type, label) DO UPDATE SET active = 1, sort_order = excluded.sort_order
     RETURNING id`,
  ).bind(body.type, body.label, body.sort_order, now).first<{ id: number }>()
  const optionId = inserted!.id

  // 第 2 趟：寫關聯（僅當 category_ids 有值或 []）
  if (categoryIds !== undefined) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM option_categories WHERE option_id = ?').bind(optionId),
      ...categoryIds.map(cid => c.env.DB.prepare(
        'INSERT OR IGNORE INTO option_categories (option_id, category_id) VALUES (?, ?)',
      ).bind(optionId, cid)),
    ])
  }

  return ok(c, { id: optionId, reactivated }, reactivated ? 200 : 201)
})

// PATCH /api/options/:id — manager/admin（§4.6）
optionRoutes.patch('/:id', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', updateOptionSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的選項 id')
  const body = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT id, type FROM options WHERE id = ?',
  ).bind(id).first<{ id: number; type: string }>()
  if (!existing) return fail(c, 404, 'NOT_FOUND', '選項不存在')

  const categoryIds = body.category_ids !== undefined ? [...new Set(body.category_ids)] : undefined

  // 動態組 UPDATE（只更新提供的欄位）
  const sets: string[] = []
  const binds: unknown[] = []
  if (body.label !== undefined) { sets.push('label = ?'); binds.push(body.label) }
  if (body.sort_order !== undefined) { sets.push('sort_order = ?'); binds.push(body.sort_order) }
  if (body.active !== undefined) { sets.push('active = ?'); binds.push(body.active) }

  // 關聯寫入（先刪後插，僅當 category_ids 有值或 []）
  if (categoryIds !== undefined) {
    // assertValidAssoc 在任何寫入之前（PATCH 靠它擋 category 帶 category_ids）
    const check = await assertValidAssoc(c, id, categoryIds)
    if (!check.ok) return fail(c, 400, 'VALIDATION_ERROR', check.reason)
  }

  if (sets.length > 0) {
    binds.push(id)
    await c.env.DB.prepare(`UPDATE options SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  }

  if (categoryIds !== undefined) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM option_categories WHERE option_id = ?').bind(id),
      ...categoryIds.map(cid => c.env.DB.prepare(
        'INSERT OR IGNORE INTO option_categories (option_id, category_id) VALUES (?, ?)',
      ).bind(id, cid)),
    ])
  }

  return ok(c, { id, updated: sets.length > 0 || categoryIds !== undefined })
})
