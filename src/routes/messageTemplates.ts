// src/routes/messageTemplates.ts — 訊息模板 CRUD（F6 v1.1.15）
// 註冊於全域 requireAuth() 之下
//
// 沿用既有 options 字典表（type='message_template'），類別關聯走 option_categories（F12-2 業主決策）
// F12-2 決策：唯一改模板方式 = PUT /:id 編輯 body（無新增、無啟用切換、無刪除——F7 業主決策 2026-08-23）

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { nowIso } from '../lib/time'
import type { Env } from '../lib/env'

export const messageTemplateRoutes = new Hono<Env>()

// 標籤限定：v1.1.15 只支援 report / empty 兩種（F4 業主決策 2026-08-23）
const ALLOWED_LABELS = ['report', 'empty'] as const

// GET /api/message-templates?category_id=N&label=report|empty
// - 三角色可讀
// - category_id 必填（沿用 F1 決策：不做「全部」，避免訊息過長）
// - label 預設 'report'
// - 回該類別關聯的模板優先，無則用全域預設（active=1 + 無 option_categories）
messageTemplateRoutes.get('/', requireAuth(), async (c) => {
  const categoryIdStr = c.req.query('category_id')
  if (!categoryIdStr) return fail(c, 400, 'VALIDATION_ERROR', 'category_id 必填')
  const categoryId = Number(categoryIdStr)
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return fail(c, 400, 'VALIDATION_ERROR', 'category_id 需為正整數')
  }

  const label = c.req.query('label') || 'report'
  if (!ALLOWED_LABELS.includes(label as typeof ALLOWED_LABELS[number])) {
    return fail(c, 400, 'VALIDATION_ERROR', `label 必須為 ${ALLOWED_LABELS.join('|')}`)
  }

  // 撈模板：類別關聯優先 → 全域預設（無 option_categories 紀錄）
  const rows = await c.env.DB.prepare(
    `SELECT o.id, o.label, o.body, o.active, o.sort_order,
       CASE WHEN EXISTS (SELECT 1 FROM option_categories oc WHERE oc.option_id = o.id AND oc.category_id = ?)
         THEN 1 ELSE 0 END AS is_category_specific
     FROM options o
     WHERE o.type = 'message_template' AND o.label = ? AND o.active = 1
     ORDER BY is_category_specific DESC, o.sort_order ASC, o.id ASC`,
  ).bind(categoryId, label).all<{
    id: number; label: string; body: string; active: number;
    sort_order: number;
    is_category_specific: number;
  }>()

  return ok(c, { category_id: categoryId, label, templates: rows.results })
})

// GET /api/message-templates/:id — 三角色可讀
messageTemplateRoutes.get('/:id', requireAuth(), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return fail(c, 400, 'VALIDATION_ERROR', '無效的模板 id')
  }
  const row = await c.env.DB.prepare(
    `SELECT id, label, body, active, sort_order
     FROM options WHERE id = ? AND type = 'message_template'`,
  ).bind(id).first<{ id: number; label: string; body: string | null; active: number; sort_order: number }>()
  if (!row) return fail(c, 404, 'NOT_FOUND', '模板不存在')
  return ok(c, row)
})

// PUT /api/message-templates/:id — manager/admin（編輯 body 或 label）
// 只能編輯現有模板（F7：不做新增、不做刪除、不做啟用切換）
const updateTemplateSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
  label: z.enum(ALLOWED_LABELS).optional(),
}).refine((v) => v.body !== undefined || v.label !== undefined, {
  message: '至少需提供 body 或 label',
})

messageTemplateRoutes.put('/:id', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', updateTemplateSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return fail(c, 400, 'VALIDATION_ERROR', '無效的模板 id')
  }
  const body = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    `SELECT id, label FROM options WHERE id = ? AND type = 'message_template'`,
  ).bind(id).first<{ id: number; label: string }>()
  if (!existing) return fail(c, 404, 'NOT_FOUND', '模板不存在')

  // 動態組 UPDATE
  const sets: string[] = []
  const binds: unknown[] = [nowIso()]
  if (body.body !== undefined) { sets.push('body = ?'); binds.push(body.body) }
  if (body.label !== undefined && body.label !== existing.label) {
    // 檢查新 label 是否被同 type 占用（UNIQUE(type,label) 約束）
    const dup = await c.env.DB.prepare(
      `SELECT id FROM options WHERE type = 'message_template' AND label = ? AND id != ?`,
    ).bind(body.label, id).first<{ id: number }>()
    if (dup) return fail(c, 400, 'VALIDATION_ERROR', '同 label 已存在')
    sets.push('label = ?'); binds.push(body.label)
  }
  binds.push(id)
  await c.env.DB.prepare(`UPDATE options SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()

  const after = await c.env.DB.prepare(
    `SELECT id, label, body, active, sort_order
     FROM options WHERE id = ?`,
  ).bind(id).first<{ id: number; label: string; body: string | null; active: number; sort_order: number }>()
  return ok(c, after)
})
