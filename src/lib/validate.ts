// src/lib/validate.ts — zod schemas（§4.1 欄位驗證規則表）
// schema 即 API 契約唯一真相來源

import { z } from 'zod'

// 通用
const id = z.number().int().positive()
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''))

// 建單（§4.3 POST /api/tickets）
export const createTicketSchema = z.object({
  category_id: id,
  location_id: id,
  description: optionalText(500),
  photo_ids: z.array(id).max(5).optional(),
})

// 編輯（§4.3 PATCH /api/tickets/:id）
export const updateTicketSchema = z.object({
  category_id: id.optional(),
  location_id: id.optional(),
  description: optionalText(500),
  vendor_id: id.optional(),
})

// 回報（§4.3 POST /api/tickets/:id/updates）
export const createUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done']),
  note: optionalText(500),
  photo_ids: z.array(id).max(5).optional(),
})

// 留言（§4.3 POST /api/tickets/:id/comments）
export const createCommentSchema = z.object({
  note: z.string().trim().min(1).max(500),
  photo_ids: z.array(id).max(5).optional(),
})

// 作廢（§4.3 POST /api/tickets/:id/void）
export const voidTicketSchema = z.object({
  note: optionalText(500),
})

// reopen（§4.3 POST /api/tickets/:id/reopen）
export const reopenTicketSchema = z.object({
  status: z.enum(['open', 'in_progress']).default('in_progress'),
  note: optionalText(500),
})

// 選項（§4.6）
export const createOptionSchema = z.object({
  type: z.enum(['category', 'location', 'description']),
  label: z.string().trim().min(1).max(30),
  sort_order: z.number().int().default(0),
})
export const updateOptionSchema = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  sort_order: z.number().int().optional(),
  active: z.number().int().min(0).max(1).optional(),
})

// 廠商（§4.6）
export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
})
export const updateVendorSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  active: z.number().int().min(0).max(1).optional(),
})

// 成員（§4.6）
export const updateUserSchema = z.object({
  role: z.enum(['committee', 'manager', 'admin']).optional(),
  active: z.number().int().min(0).max(1).optional(),
  display_name: z.string().trim().min(1).max(20).optional(),
})

// CSV 匯出（§4.8，sign 與下載共用）
export const exportQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'void', 'active', 'all']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// 列表查詢（§4.3 GET /api/tickets）
export const listTicketsQuerySchema = z.object({
  status: z.enum(['active', 'open', 'in_progress', 'done', 'void', 'all']).default('active'),
  category_id: id.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
