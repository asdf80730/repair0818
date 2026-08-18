// src/routes/vendors.ts — 廠商管理（§4.6，D5：manager/admin）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { createVendorSchema, updateVendorSchema } from '../lib/validate'
import type { Env } from '../lib/env'

export const vendorRoutes = new Hono<Env>()

// GET /api/vendors — manager/admin，列表（含停用）（§4.6）
vendorRoutes.get('/', requireAuth({ roles: ['manager', 'admin'] }), async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, name, phone, active, created_at FROM vendors ORDER BY active DESC, id',
  ).all()
  return ok(c, rows.results)
})

// POST /api/vendors — manager/admin（§4.6）
vendorRoutes.post('/', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', createVendorSchema), async (c) => {
  // TODO: 新增（M5）
  return fail(c, 501, 'INTERNAL', '尚未實作（M5）')
})

// PATCH /api/vendors/:id — manager/admin（§4.6）
vendorRoutes.patch('/:id', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', updateVendorSchema), async (c) => {
  // TODO: 修改/停用（M5）
  return fail(c, 501, 'INTERNAL', '尚未實作（M5）')
})
