// src/routes/options.ts — 選項管理（§4.6，D5：manager/admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { createOptionSchema, updateOptionSchema } from '../lib/validate'
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
  // TODO: 新增/啟用（M5）— (type,label) 存在則 active=1 並更新 sort_order，否則新增
  return fail(c, 501, 'INTERNAL', '尚未實作（M5）')
})

// PATCH /api/options/:id — manager/admin（§4.6）
optionRoutes.patch('/:id', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', updateOptionSchema), async (c) => {
  // TODO: 改名/排序/停用（M5）
  return fail(c, 501, 'INTERNAL', '尚未實作（M5）')
})
