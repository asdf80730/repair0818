// src/routes/tickets.ts — 建單/列表/詳情/編輯/回報/留言/作廢/reopen/share-token（§4.3）
// 註冊於全域 requireAuth() 之下（已開通使用者）

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { activeOptionLabel, makeTitle, validateOwnUnboundPhotos } from '../lib/db'
import { nowIso } from '../lib/time'
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
  const user = c.get('user')
  const body = c.req.valid('json')

  // 驗證 category/location 是 active 的 option，取 label 快照
  const categoryLabel = await activeOptionLabel(c, 'category', body.category_id)
  const locationLabel = await activeOptionLabel(c, 'location', body.location_id)
  if (!categoryLabel || !locationLabel) {
    return fail(c, 400, 'VALIDATION_ERROR', '類別或地點無效')
  }

  // 驗證 photo_ids：每張須 uploaded_by=本人 且 target_id IS NULL（§4.1）
  const photoIds = body.photo_ids ?? []
  if (photoIds.length > 0) {
    const valid = await validateOwnUnboundPhotos(c, photoIds, user.id)
    if (!valid) {
      return fail(c, 400, 'VALIDATION_ERROR', '照片無效或已被使用')
    }
  }

  const now = nowIso()
  const shareToken = crypto.randomUUID()

  // 先 insert ticket 拿 id
  const insertResult = await c.env.DB.prepare(
    `INSERT INTO tickets
      (category_id, category_label, location_id, location_label, description,
       status, share_token, created_by, created_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
  ).bind(
    body.category_id, categoryLabel,
    body.location_id, locationLabel,
    body.description ?? null,
    shareToken, user.id, now, now,
  ).run()
  const ticketId = insertResult.meta.last_row_id

  // 綁定照片（target_type='ticket'，target_id=ticketId）
  if (photoIds.length > 0) {
    const photoStmts = photoIds.map((pid) =>
      c.env.DB.prepare(
        'UPDATE photos SET target_type = ?, target_id = ? WHERE id = ?',
      ).bind('ticket', ticketId, pid),
    )
    await c.env.DB.batch(photoStmts)
  }

  const title = makeTitle(categoryLabel, locationLabel, ticketId)
  return ok(c, { id: ticketId, title, share_token: shareToken }, 201)
})

// GET /api/tickets — 三角色（§4.3）
ticketRoutes.get('/', requireAuth(), zValidator('query', listTicketsQuerySchema), async (c) => {
  const { status, category_id, page, limit } = c.req.valid('query')

  // status 允許值：active(預設)/open/in_progress/done/void/all
  // active = open + in_progress
  let where = 'WHERE 1=1'
  const binds: unknown[] = []
  if (status === 'active') {
    where += " AND t.status IN ('open','in_progress')"
  } else if (status !== 'all') {
    where += ' AND t.status = ?'
    binds.push(status)
  }
  if (category_id) {
    where += ' AND t.category_id = ?'
    binds.push(category_id)
  }

  // 查 limit+1 筆判斷 has_more（§4.3）
  const offset = (page - 1) * limit
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.category_label, t.location_label, t.status,
            v.name AS vendor_name, t.created_at, t.last_activity_at
     FROM tickets t
     LEFT JOIN vendors v ON v.id = t.vendor_id
     ${where}
     ORDER BY t.last_activity_at DESC
     LIMIT ? OFFSET ?`,
  ).bind(...binds, limit + 1, offset).all<{
    id: number; category_label: string; location_label: string; status: string
    vendor_name: string | null; created_at: string; last_activity_at: string
  }>()

  const items = rows.results.slice(0, limit).map((r) => ({
    id: r.id,
    title: makeTitle(r.category_label, r.location_label, r.id),
    status: r.status,
    category_label: r.category_label,
    location_label: r.location_label,
    vendor_name: r.vendor_name,
    created_at: r.created_at,
    last_activity_at: r.last_activity_at,
  }))

  const has_more = rows.results.length > limit
  return ok(c, { items, page, limit, has_more })
})

// GET /api/tickets/:id — 三角色（§4.3）
ticketRoutes.get('/:id', requireAuth(), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return fail(c, 400, 'VALIDATION_ERROR', '無效的案件 id')
  }

  // 案件本體（含廠商名稱，停用時後綴「（已停用）」）
  const ticket = await c.env.DB.prepare(
    `SELECT t.id, t.category_label, t.location_label, t.description, t.status,
            t.vendor_id, v.name AS vendor_name, v.active AS vendor_active,
            t.created_at, t.last_activity_at, t.closed_at, t.share_token
     FROM tickets t
     LEFT JOIN vendors v ON v.id = t.vendor_id
     WHERE t.id = ?`,
  ).bind(id).first<{
    id: number; category_label: string; location_label: string; description: string | null
    status: string; vendor_id: number | null; vendor_name: string | null; vendor_active: number | null
    created_at: string; last_activity_at: string; closed_at: string | null; share_token: string
  }>()

  if (!ticket) return fail(c, 404, 'NOT_FOUND', '案件不存在')

  // photos（target_type='ticket' 的 url 陣列）
  const photos = await c.env.DB.prepare(
    "SELECT id FROM photos WHERE target_type = 'ticket' AND target_id = ? ORDER BY id",
  ).bind(id).all<{ id: number }>()

  // updates 時間軸（含留言者 display_name 與照片）
  const updates = await c.env.DB.prepare(
    `SELECT u.id, u.kind, u.status, u.note, u.created_at,
            usr.display_name
     FROM ticket_updates u
     LEFT JOIN users usr ON usr.id = u.user_id
     WHERE u.ticket_id = ?
     ORDER BY u.created_at, u.id`,
  ).bind(id).all<{
    id: number; kind: string; status: string | null; note: string | null
    created_at: string; display_name: string | null
  }>()

  // 每筆 update 的照片
  const updateIds = updates.results.map((u) => u.id)
  const updatePhotos = new Map<number, string[]>()
  if (updateIds.length > 0) {
    const placeholders = updateIds.map(() => '?').join(',')
    const up = await c.env.DB.prepare(
      `SELECT target_id, id FROM photos
       WHERE target_type = 'update' AND target_id IN (${placeholders})
       ORDER BY id`,
    ).bind(...updateIds).all<{ target_id: number; id: number }>()
    for (const p of up.results) {
      const arr = updatePhotos.get(p.target_id) ?? []
      arr.push(`/api/photos/${p.id}`)
      updatePhotos.set(p.target_id, arr)
    }
  }

  const vendorName = ticket.vendor_name
    ? ticket.vendor_active === 0
      ? `${ticket.vendor_name}（已停用）`
      : ticket.vendor_name
    : null

  return ok(c, {
    id: ticket.id,
    title: makeTitle(ticket.category_label, ticket.location_label, ticket.id),
    category_label: ticket.category_label,
    location_label: ticket.location_label,
    description: ticket.description,
    status: ticket.status,
    vendor_name: vendorName,
    created_at: ticket.created_at,
    last_activity_at: ticket.last_activity_at,
    closed_at: ticket.closed_at,
    photos: photos.results.map((p) => `/api/photos/${p.id}`),
    share_url: `/api/share/${ticket.share_token}`,
    updates: updates.results.map((u) => ({
      id: u.id,
      kind: u.kind,
      status: u.status,
      note: u.note,
      display_name: u.display_name,
      created_at: u.created_at,
      photo_urls: updatePhotos.get(u.id) ?? [],
    })),
  })
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
