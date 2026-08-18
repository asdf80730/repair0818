// src/routes/tickets.ts — 建單/列表/詳情/編輯/回報/留言/作廢/reopen/share-token（§4.3）
// 註冊於全域 requireAuth() 之下（已開通使用者）

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { activeOptionLabel, activeVendor, makeTitle, validateOwnUnboundPhotos } from '../lib/db'
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
    share_url: `/share.html?token=${ticket.share_token}`,
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
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的案件 id')
  const user = c.get('user')
  const body = c.req.valid('json')

  const ticket = await c.env.DB.prepare(
    'SELECT id, category_id, category_label, location_id, location_label, description, status, created_by, vendor_id FROM tickets WHERE id = ?',
  ).bind(id).first<{
    id: number; category_id: number | null; category_label: string
    location_id: number | null; location_label: string; description: string | null
    status: string; created_by: number; vendor_id: number | null
  }>()
  if (!ticket) return fail(c, 404, 'NOT_FOUND', '案件不存在')

  // D7：committee 僅自己建的單；manager/admin 全部
  if (user.role === 'committee' && ticket.created_by !== user.id) {
    return fail(c, 403, 'FORBIDDEN', '權限不足')
  }

  // 僅 open / in_progress 可編輯（已結案/作廢不可改）
  if (ticket.status !== 'open' && ticket.status !== 'in_progress') {
    return fail(c, 400, 'VALIDATION_ERROR', '已結案或已作廢的案件不可編輯')
  }

  // committee 即使編自己的單也不可改 vendor_id（§4.3）
  if (user.role === 'committee' && body.vendor_id !== undefined) {
    return fail(c, 403, 'FORBIDDEN', '管委會不可指派廠商')
  }

  // 收集變更欄位（before→after 摘要）
  const changes: string[] = []
  const labelMap: Record<string, string> = {}

  let newCategoryId = ticket.category_id
  let newCategoryLabel = ticket.category_label
  if (body.category_id !== undefined && body.category_id !== ticket.category_id) {
    const label = await activeOptionLabel(c, 'category', body.category_id)
    if (!label) return fail(c, 400, 'VALIDATION_ERROR', '類別無效')
    changes.push(`類別 ${ticket.category_label}→${label}`)
    newCategoryId = body.category_id
    newCategoryLabel = label
  }

  let newLocationId = ticket.location_id
  let newLocationLabel = ticket.location_label
  if (body.location_id !== undefined && body.location_id !== ticket.location_id) {
    const label = await activeOptionLabel(c, 'location', body.location_id)
    if (!label) return fail(c, 400, 'VALIDATION_ERROR', '地點無效')
    changes.push(`地點 ${ticket.location_label}→${label}`)
    newLocationId = body.location_id
    newLocationLabel = label
  }

  let newDescription = ticket.description
  if (body.description !== undefined && body.description !== (ticket.description ?? '')) {
    changes.push('說明')
    newDescription = body.description
  }

  let newVendorId: number | null | undefined
  if (body.vendor_id !== undefined && body.vendor_id !== ticket.vendor_id) {
    const vendor = await activeVendor(c, body.vendor_id)
    if (!vendor) return fail(c, 400, 'VALIDATION_ERROR', '廠商無效')
    newVendorId = body.vendor_id
    changes.push('廠商')
  }

  if (changes.length === 0) {
    return ok(c, { id, updated: false, message: '無變更' })
  }

  const now = nowIso()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE tickets SET category_id = ?, category_label = ?, location_id = ?,
         location_label = ?, description = ?, vendor_id = ?, last_activity_at = ?
       WHERE id = ?`,
    ).bind(
      newCategoryId, newCategoryLabel, newLocationId, newLocationLabel,
      newDescription, newVendorId ?? ticket.vendor_id, now, id,
    ),
    // system 時間軸留痕
    c.env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, note, created_at)
       VALUES (?, ?, 'system', NULL, ?, ?)`,
    ).bind(id, user.id, `已修改：${changes.join('；')}`, now),
  ])

  return ok(c, { id, updated: true, changes })
})

// POST /api/tickets/:id/updates — manager/admin（§4.3）
ticketRoutes.post('/:id/updates', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', createUpdateSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的案件 id')
  const user = c.get('user')
  const body = c.req.valid('json')

  const ticket = await c.env.DB.prepare(
    'SELECT id, status FROM tickets WHERE id = ?',
  ).bind(id).first<{ id: number; status: string }>()
  if (!ticket) return fail(c, 404, 'NOT_FOUND', '案件不存在')

  // 已結案（done）或作廢（void）不可回報（§4.3）
  if (ticket.status === 'done' || ticket.status === 'void') {
    return fail(c, 400, 'VALIDATION_ERROR', '已結案或已作廢的案件不可回報')
  }

  // 驗證照片
  const photoIds = body.photo_ids ?? []
  if (photoIds.length > 0) {
    const valid = await validateOwnUnboundPhotos(c, photoIds, user.id)
    if (!valid) return fail(c, 400, 'VALIDATION_ERROR', '照片無效或已被使用')
  }

  const now = nowIso()
  const isDone = body.status === 'done'

  // 多步驟寫入用 env.DB.batch()
  const stmts = [
    // 更新 ticket status
    c.env.DB.prepare(
      `UPDATE tickets SET status = ?, last_activity_at = ?, closed_at = ?, closed_by = ? WHERE id = ?`,
    ).bind(body.status, now, isDone ? now : null, isDone ? user.id : null, id),
    // 寫入時間軸（kind=status）
    c.env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, note, created_at)
       VALUES (?, ?, 'status', ?, ?, ?)`,
    ).bind(id, user.id, body.status, body.note ?? null, now),
  ]

  // 綁定照片（target_type='update' + 該筆 update id）—— 需先 insert 拿 update id
  await c.env.DB.batch(stmts)
  const lastUpdate = await c.env.DB.prepare(
    'SELECT id FROM ticket_updates WHERE ticket_id = ? ORDER BY id DESC LIMIT 1',
  ).bind(id).first<{ id: number }>()
  if (photoIds.length > 0 && lastUpdate) {
    await c.env.DB.batch(photoIds.map((pid) =>
      c.env.DB.prepare('UPDATE photos SET target_type = ?, target_id = ? WHERE id = ?')
        .bind('update', lastUpdate.id, pid),
    ))
  }

  return ok(c, { updated: true, status: body.status })
})

// POST /api/tickets/:id/comments — 三角色（D1，§4.3）
ticketRoutes.post('/:id/comments', requireAuth(), zValidator('json', createCommentSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的案件 id')
  const user = c.get('user')
  const body = c.req.valid('json')

  const ticket = await c.env.DB.prepare(
    'SELECT id, status FROM tickets WHERE id = ?',
  ).bind(id).first<{ id: number; status: string }>()
  if (!ticket) return fail(c, 404, 'NOT_FOUND', '案件不存在')

  // void 不可留言（§4.3）
  if (ticket.status === 'void') {
    return fail(c, 400, 'VALIDATION_ERROR', '已作廢的案件不可留言')
  }

  // 驗證照片
  const photoIds = body.photo_ids ?? []
  if (photoIds.length > 0) {
    const valid = await validateOwnUnboundPhotos(c, photoIds, user.id)
    if (!valid) return fail(c, 400, 'VALIDATION_ERROR', '照片無效或已被使用')
  }

  const now = nowIso()

  // 寫入 kind='comment'、status=NULL；不改變 ticket.status；更新 last_activity_at
  const insert = await c.env.DB.prepare(
    `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, note, created_at)
     VALUES (?, ?, 'comment', NULL, ?, ?)`,
  ).bind(id, user.id, body.note, now).run()
  const updateId = insert.meta.last_row_id

  await c.env.DB.prepare(
    'UPDATE tickets SET last_activity_at = ? WHERE id = ?',
  ).bind(now, id).run()

  // 留言照片一律 target_type='update' + target_id=留言 id
  if (photoIds.length > 0) {
    await c.env.DB.batch(photoIds.map((pid) =>
      c.env.DB.prepare('UPDATE photos SET target_type = ?, target_id = ? WHERE id = ?')
        .bind('update', updateId, pid),
    ))
  }

  return ok(c, { id: updateId, kind: 'comment' }, 201)
})

// POST /api/tickets/:id/void — manager/admin（§4.3）
ticketRoutes.post('/:id/void', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', voidTicketSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的案件 id')
  const user = c.get('user')
  const body = c.req.valid('json')

  const ticket = await c.env.DB.prepare(
    'SELECT id, status FROM tickets WHERE id = ?',
  ).bind(id).first<{ id: number; status: string }>()
  if (!ticket) return fail(c, 404, 'NOT_FOUND', '案件不存在')

  // 已結案或已作廢不可再作廢
  if (ticket.status === 'done' || ticket.status === 'void') {
    return fail(c, 400, 'VALIDATION_ERROR', '僅 open/in_progress 可作廢')
  }

  const now = nowIso()
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE tickets SET status = ?, closed_at = ?, closed_by = ?, last_activity_at = ? WHERE id = ?',
    ).bind('void', now, user.id, now, id),
    c.env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, note, created_at)
       VALUES (?, ?, 'status', 'void', ?, ?)`,
    ).bind(id, user.id, body.note ?? null, now),
  ])

  return ok(c, { status: 'void' })
})

// POST /api/tickets/:id/reopen — 僅 admin（D2，§3）
ticketRoutes.post('/:id/reopen', requireAuth({ roles: ['admin'] }), zValidator('json', reopenTicketSchema), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的案件 id')
  const user = c.get('user')
  const body = c.req.valid('json')

  const ticket = await c.env.DB.prepare(
    'SELECT id, status FROM tickets WHERE id = ?',
  ).bind(id).first<{ id: number; status: string }>()
  if (!ticket) return fail(c, 404, 'NOT_FOUND', '案件不存在')

  // 僅限 done / void 的案件
  if (ticket.status !== 'done' && ticket.status !== 'void') {
    return fail(c, 400, 'VALIDATION_ERROR', '僅已結案或已作廢的案件可重新開啟')
  }

  const now = nowIso()
  const targetStatus = body.status ?? 'in_progress'
  const prevStatusLabel = ticket.status === 'done' ? '已完成' : '已作廢'

  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE tickets SET status = ?, closed_at = NULL, closed_by = NULL, last_activity_at = ? WHERE id = ?',
    ).bind(targetStatus, now, id),
    c.env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, note, created_at)
       VALUES (?, ?, 'status', ?, ?, ?)`,
    ).bind(id, user.id, targetStatus, `重新開啟（原狀態：${prevStatusLabel}）：${body.note ?? ''}`, now),
  ])

  return ok(c, { status: targetStatus })
})

// POST /api/tickets/:id/share-token — manager/admin（§4.3）
ticketRoutes.post('/:id/share-token', requireAuth({ roles: ['manager', 'admin'] }), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return fail(c, 400, 'VALIDATION_ERROR', '無效的案件 id')

  const ticket = await c.env.DB.prepare(
    'SELECT id FROM tickets WHERE id = ?',
  ).bind(id).first<{ id: number }>()
  if (!ticket) return fail(c, 404, 'NOT_FOUND', '案件不存在')

  // 重新產生 share_token，舊連結立即失效（§4.3）
  const newToken = crypto.randomUUID()
  await c.env.DB.prepare(
    'UPDATE tickets SET share_token = ? WHERE id = ?',
  ).bind(newToken, id).run()

  return ok(c, { share_url: `/share.html?token=${newToken}` })
})
