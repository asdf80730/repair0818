// src/routes/options.ts — 選項管理（§4.6，D5：manager/admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { z } from 'zod'
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
//   type=category             → 每個類別附 location_count/description_count（P7 類別列表）
//   type=location|description & category_id=N → 回該類別所有項附 associated（P7 modal）
optionRoutes.get('/', requireAuth(), zValidator('query', listOptionsQuerySchema), async (c) => {
  const q = c.req.valid('query')
  const user = c.get('user')

  // include_inactive 限 manager/admin（同路由雙權限，handler 內判）
  if (q.include_inactive && user.role !== 'manager' && user.role !== 'admin') {
    return fail(c, 403, 'FORBIDDEN', '權限不足')
  }

  const activeClause = q.include_inactive ? '' : ' AND o.active = 1'

  // 模式一：type=category 且 include_inactive → 類別列表附關聯計數（P7）
  if (q.type === 'category' && q.include_inactive) {
    const rows = await c.env.DB.prepare(
      `SELECT o.id, o.type, o.label, o.sort_order, o.active,
        (SELECT COUNT(*) FROM option_categories oc
          JOIN options oo ON oo.id = oc.option_id
         WHERE oc.category_id = o.id AND oo.type = 'location') AS location_count,
        (SELECT COUNT(*) FROM option_categories oc
          JOIN options oo ON oo.id = oc.option_id
         WHERE oc.category_id = o.id AND oo.type = 'description') AS description_count
       FROM options o WHERE o.type = 'category'${activeClause}
       ORDER BY o.sort_order, o.id`,
    ).all<{ id: number; type: string; label: string; sort_order: number; active: number; location_count: number; description_count: number }>()
    return ok(c, rows.results)
  }

  // 模式二：type=location|description & category_id & include_inactive → 該類別所有項附 associated（P7 modal）
  if (q.type !== 'category' && q.category_id !== undefined && q.include_inactive) {
    // 驗證類別存在
    const cat = await c.env.DB.prepare(
      "SELECT id FROM options WHERE id = ? AND type = 'category'",
    ).bind(q.category_id).first()
    if (!cat) return fail(c, 400, 'VALIDATION_ERROR', '類別不存在')
    const rows = await c.env.DB.prepare(
      `SELECT o.id, o.type, o.label, o.sort_order, o.active,
        EXISTS (SELECT 1 FROM option_categories oc WHERE oc.option_id = o.id AND oc.category_id = ?) AS associated
       FROM options o WHERE o.type = ?${activeClause}
       ORDER BY o.sort_order, o.id`,
    ).bind(q.category_id, q.type).all<{ id: number; type: string; label: string; sort_order: number; active: number; associated: number }>()
    return ok(c, rows.results)
  }

  // 模式三：建單用過濾（category_id 關聯＋通用）
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

// GET /api/options/catalog — 建單用：一次抓完所有選項＋關聯（v1.1.7）
// 回傳 { categories:[], locations:[{id,label,category_ids}], descriptions:[{id,label,category_ids}] }
// 前端本地過濾，避免每次換類別都重新請求
optionRoutes.get('/catalog', requireAuth(), async (c) => {
  const options = (await c.env.DB.prepare(
    "SELECT id, type, label, sort_order FROM options WHERE active = 1 ORDER BY type, sort_order, id",
  ).all<{ id: number; type: string; label: string; sort_order: number }>()).results

  const assoc = new Map<number, number[]>()
  const assocRows = await c.env.DB.prepare(
    'SELECT option_id, category_id FROM option_categories',
  ).all<{ option_id: number; category_id: number }>()
  for (const a of assocRows.results) {
    if (!assoc.has(a.option_id)) assoc.set(a.option_id, [])
    assoc.get(a.option_id)!.push(a.category_id)
  }

  const categories = options.filter(o => o.type === 'category').map(o => ({ id: o.id, label: o.label }))
  const locations = options.filter(o => o.type === 'location').map(o => ({ id: o.id, label: o.label, category_ids: assoc.get(o.id) ?? [] }))
  const descriptions = options.filter(o => o.type === 'description').map(o => ({ id: o.id, label: o.label, category_ids: assoc.get(o.id) ?? [] }))
  const comment_descs = options.filter(o => o.type === 'comment_desc').map(o => ({ id: o.id, label: o.label }))

  return ok(c, { categories, locations, descriptions, comment_descs })
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

// POST /api/options/:id/assoc — 以類別為中心設定關聯（v1.1.7）
// :id 是 category，body { type: 'location'|'description', option_ids: number[] }
// 全量覆寫該類別對該 type 的關聯（P7 類別 modal 用）
optionRoutes.post('/:id/assoc', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', z.object({
  type: z.enum(['location', 'description']),
  option_ids: z.array(z.number().int().positive()).max(200),
})), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的類別 id')
  const body = c.req.valid('json')

  // 驗證 :id 是 category
  const cat = await c.env.DB.prepare(
    "SELECT id FROM options WHERE id = ? AND type = 'category'",
  ).bind(id).first()
  if (!cat) return fail(c, 404, 'NOT_FOUND', '類別不存在')

  const optionIds = [...new Set(body.option_ids)]

  // 驗證所有 option_ids 都是指定 type（純讀，任何寫入之前）
  if (optionIds.length > 0) {
    const placeholders = optionIds.map(() => '?').join(',')
    const opts = await c.env.DB.prepare(
      `SELECT id FROM options WHERE id IN (${placeholders}) AND type = ?`,
    ).bind(...optionIds, body.type).all<{ id: number }>()
    if (opts.results.length !== optionIds.length) return fail(c, 400, 'VALIDATION_ERROR', `option_ids 含非${body.type}`)
  }

  // 全量覆寫：先刪該類別對該 type 的所有關聯，再插入
  await c.env.DB.batch([
    c.env.DB.prepare(
      `DELETE FROM option_categories WHERE category_id = ? AND option_id IN
        (SELECT id FROM options WHERE type = ?)`,
    ).bind(id, body.type),
    ...optionIds.map(oid => c.env.DB.prepare(
      'INSERT OR IGNORE INTO option_categories (option_id, category_id) VALUES (?, ?)',
    ).bind(oid, id)),
  ])

  return ok(c, { category_id: id, type: body.type, count: optionIds.length })
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
