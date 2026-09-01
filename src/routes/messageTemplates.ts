// src/routes/messageTemplates.ts — 訊息模板 CRUD（v1.1.15 F6；v1.1.16 簡化為 new_case / timeline；v1.1.20：type 欄當鍵、label 欄存內容、砍 body 欄）
// 註冊於全域 requireAuth() 之下
//
// 沿用既有 options 字典表。v1.1.20 起 type='message_template_new_case'/'message_template_timeline' 直接當模板鍵、
// label 欄存模板內容（舊 type='message_template'+label 當鍵+body 存內容已併入 type/label，body 欄已 DROP）。
// 類別關聯走 option_categories。
// 對外 API 形狀不變：query/response 的 label 是鍵（new_case/timeline）、body 是內容（取自 label 欄）。
// v1.1.16：模板從 report/empty 改爲「新案件(new_case)／時間軸(timeline)」兩種，供案件動態訊息框使用；
// PUT /:id 就地覆寫 body（UNIQUE(type,label) 下同 label 唯一列，故為更新非新增——v1.1.16 業主決策）。

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import type { Env } from '../lib/env'

export const messageTemplateRoutes = new Hono<Env>()

// 標籤限定：v1.1.16 支援 new_case / timeline 兩種（取代 v1.1.15 的 report/empty）
const ALLOWED_LABELS = ['new_case', 'timeline'] as const

// GET /api/message-templates?category_id=N&label=new_case|timeline
// - 三角色可讀
// - category_id 必填（沿用 F1 決策：不做「全部」，避免訊息過長）
// - label 預設 'new_case'（v1.1.16；原 v1.1.15 為 'report'）
// - 回該類別關聯的模板優先，無則用全域預設（active=1 + 無 option_categories）
messageTemplateRoutes.get('/', requireAuth(), async (c) => {
  const categoryIdStr = c.req.query('category_id')
  if (!categoryIdStr) return fail(c, 400, 'VALIDATION_ERROR', 'category_id 必填')
  const categoryId = Number(categoryIdStr)
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return fail(c, 400, 'VALIDATION_ERROR', 'category_id 需為正整數')
  }

  const label = c.req.query('label') || 'new_case'
  if (!ALLOWED_LABELS.includes(label as typeof ALLOWED_LABELS[number])) {
    return fail(c, 400, 'VALIDATION_ERROR', `label 必須為 ${ALLOWED_LABELS.join('|')}`)
  }

  // 撈模板：類別關聯優先 → 全域預設（無 option_categories 紀錄）
  // v1.1.20：type 欄當鍵（'message_template_'+label）、label 欄即內容 → 回應 body 取自 label 欄
  const rows = await c.env.DB.prepare(
    `SELECT o.id,
       REPLACE(o.type, 'message_template_', '') AS label,
       o.label AS body, o.active, o.sort_order,
       CASE WHEN EXISTS (SELECT 1 FROM option_categories oc WHERE oc.option_id = o.id AND oc.category_id = ?)
         THEN 1 ELSE 0 END AS is_category_specific
     FROM options o
     WHERE o.type = ? AND o.active = 1
     ORDER BY is_category_specific DESC, o.sort_order ASC, o.id ASC`,
  ).bind(categoryId, 'message_template_' + label).all<{
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
  // v1.1.20：type 欄當鍵、label 欄即內容（回應 body 取自 label 欄）
  const row = await c.env.DB.prepare(
    `SELECT id,
       REPLACE(type, 'message_template_', '') AS label,
       label AS body, active, sort_order
     FROM options WHERE id = ? AND type LIKE 'message_template_%'`,
  ).bind(id).first<{ id: number; label: string; body: string | null; active: number; sort_order: number }>()
  if (!row) return fail(c, 404, 'NOT_FOUND', '模板不存在')
  return ok(c, row)
})

// PUT /api/message-templates/:id — manager/admin（編輯內容 body 或鍵 label）
// 只能編輯現有模板（F7：不做新增、不做刪除、不做啟用切換）
// v1.1.20：內容寫入 label 欄、鍵寫入 type 欄（加 message_template_ 前綴）
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
    `SELECT id, type FROM options WHERE id = ? AND type LIKE 'message_template_%'`,
  ).bind(id).first<{ id: number; type: string }>()
  if (!existing) return fail(c, 404, 'NOT_FOUND', '模板不存在')
  const existingKey = existing.type.replace('message_template_', '')

  // 動態組 UPDATE（options 無 updated_at 欄，0001 刻意不設；覆寫即生效）
  // v1.1.20：body→label 欄（內容）、label→type 欄（鍵，加前綴）
  const sets: string[] = []
  const binds: unknown[] = []
  if (body.body !== undefined) { sets.push('label = ?'); binds.push(body.body) }
  if (body.label !== undefined && body.label !== existingKey) {
    // 檢查新鍵是否被另一列占用（UNIQUE(type,label)：同鍵已有其他 id）
    const dup = await c.env.DB.prepare(
      `SELECT id FROM options WHERE type = ? AND id != ?`,
    ).bind('message_template_' + body.label, id).first<{ id: number }>()
    if (dup) return fail(c, 400, 'VALIDATION_ERROR', '同 label 已存在')
    sets.push('type = ?'); binds.push('message_template_' + body.label)
  }
  binds.push(id)
  await c.env.DB.prepare(`UPDATE options SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()

  // v1.1.20：type 欄當鍵、label 欄即內容（回應 body 取自 label 欄）
  const after = await c.env.DB.prepare(
    `SELECT id,
       REPLACE(type, 'message_template_', '') AS label,
       label AS body, active, sort_order
     FROM options WHERE id = ?`,
  ).bind(id).first<{ id: number; label: string; body: string | null; active: number; sort_order: number }>()
  return ok(c, after)
})
