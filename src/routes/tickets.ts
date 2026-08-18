// src/routes/tickets.ts — 建單/列表/詳情/編輯/回報/留言/作廢/reopen/share-token（§4.3）
// 註冊於全域 requireAuth() 之下（已開通使用者）

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import {
  createTicketSchema,
  updateTicketSchema,
  createUpdateSchema,
  createCommentSchema,
  voidTicketSchema,
  reopenTicketSchema,
  listTicketsQuerySchema,
} from '../lib/validate'
import type { Env } from '../lib/env'

export const ticketRoutes = new Hono<Env>()

// POST /api/tickets — 三角色（§4.3）
ticketRoutes.post('/', requireAuth(), zValidator('json', createTicketSchema), async (c) => {
  // TODO: 建單（M3）— label 快照、share_token、photo_ids 綁定、env.DB.batch()
  return fail(c, 501, 'INTERNAL', '尚未實作（M3）')
})

// GET /api/tickets — 三角色（§4.3）
ticketRoutes.get('/', requireAuth(), zValidator('query', listTicketsQuerySchema), async (c) => {
  // TODO: 列表（M3）— status 篩選、分頁 limit+1、last_activity_at DESC
  return fail(c, 501, 'INTERNAL', '尚未實作（M3）')
})

// GET /api/tickets/:id — 三角色（§4.3）
ticketRoutes.get('/:id', requireAuth(), async (c) => {
  // TODO: 詳情（M3）— 本體 + photos + updates 時間軸 + share_url
  return fail(c, 501, 'INTERNAL', '尚未實作（M3）')
})

// PATCH /api/tickets/:id — D7：committee 僅自己建的單；manager/admin 全部（§4.3）
ticketRoutes.patch('/:id', requireAuth(), zValidator('json', updateTicketSchema), async (c) => {
  // TODO: 編輯（M4）— 權限、僅 open/in_progress、label 快照同步、system 時間軸留痕
  return fail(c, 501, 'INTERNAL', '尚未實作（M4）')
})

// POST /api/tickets/:id/updates — manager/admin（§4.3）
ticketRoutes.post('/:id/updates', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', createUpdateSchema), async (c) => {
  // TODO: 回報（M4）— status 同步、done 設 closed_at/by、batch
  return fail(c, 501, 'INTERNAL', '尚未實作（M4）')
})

// POST /api/tickets/:id/comments — 三角色（D1，§4.3）
ticketRoutes.post('/:id/comments', requireAuth(), zValidator('json', createCommentSchema), async (c) => {
  // TODO: 留言（M4）— kind=comment、不改 status、void 不可留言
  return fail(c, 501, 'INTERNAL', '尚未實作（M4）')
})

// POST /api/tickets/:id/void — manager/admin（§4.3）
ticketRoutes.post('/:id/void', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', voidTicketSchema), async (c) => {
  // TODO: 作廢（M4）— kind=status status=void、closed_at/by
  return fail(c, 501, 'INTERNAL', '尚未實作（M4）')
})

// POST /api/tickets/:id/reopen — 僅 admin（D2，§4.3）
ticketRoutes.post('/:id/reopen', requireAuth({ roles: ['admin'] }), zValidator('json', reopenTicketSchema), async (c) => {
  // TODO: reopen（M4）— 僅 done/void、note 帶實際前狀態、清空 closed_at/by
  return fail(c, 501, 'INTERNAL', '尚未實作（M4）')
})

// POST /api/tickets/:id/share-token — manager/admin（§4.3）
ticketRoutes.post('/:id/share-token', requireAuth({ roles: ['manager', 'admin'] }), async (c) => {
  // TODO: 重新產生 share_token（M6）— 舊連結立即失效
  return fail(c, 501, 'INTERNAL', '尚未實作（M6）')
})
