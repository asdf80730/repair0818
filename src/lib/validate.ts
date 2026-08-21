// src/lib/validate.ts — zod schemas（§4.1 欄位驗證規則表）
// schema 即 API 契約唯一真相來源

import { z } from 'zod'

// 通用
const id = z.number().int().positive()
// G8：optionalText 允許 null（標準 REST 語意），null 視同未填
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().or(z.literal(''))

// 建單（§4.3 POST /api/tickets）
export const createTicketSchema = z.object({
  category_id: id,
  location_id: id,
  description: optionalText(500),
  photo_ids: z.array(id).max(5).optional(),
})

// 編輯（§4.3 PATCH /api/tickets/:id）
// vendor_id 三態（D1/G1）：undefined=不變、null=清空指派、正整數=指派新廠商
export const updateTicketSchema = z.object({
  category_id: id.optional(),
  location_id: id.optional(),
  description: optionalText(500),
  vendor_id: id.nullable().optional(),
})

// 回報（§4.3 POST /api/tickets/:id/updates）
// v1.1.12：in_progress 代表「已發包」，改成已發包時必填金額（amount）
export const createUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done']),
  note: optionalText(500),
  photo_ids: z.array(id).max(5).optional(),
  amount: z.number().int().positive().optional(),
}).superRefine((val, ctx) => {
  // 改成已發包（in_progress）時必填金額
  if (val.status === 'in_progress' && (val.amount === undefined || val.amount === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: '已發包需填寫金額' })
  }
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
const categoryIds = z.array(z.number().int().positive()).max(20).optional()
export const createOptionSchema = z.object({
  type: z.enum(['category', 'location', 'description', 'comment_desc']),
  label: z.string().trim().min(1).max(30),
  sort_order: z.number().int().default(0),
  category_ids: categoryIds,
}).superRefine((val, ctx) => {
  // A4：type=category 與 type=comment_desc 都不得帶 category_ids
  //  - category 是頂層，不屬於任何類別
  //  - comment_desc（回報範本）不參與類別關聯（v1.1.9，通用追蹤說明）
  if ((val.type === 'category' || val.type === 'comment_desc') && val.category_ids !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['category_ids'], message: '此類型不可設定所屬類別' })
  }
})
export const updateOptionSchema = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  sort_order: z.number().int().optional(),
  active: z.number().int().min(0).max(1).optional(),
  category_ids: categoryIds,
})

// 選項查詢（§4.6 GET /api/options）
// category_id + include_inactive 可併用（P7 modal 查 associated 用；include_inactive 限 manager/admin）
export const listOptionsQuerySchema = z.object({
  type: z.enum(['category', 'location', 'description', 'comment_desc']),
  category_id: z.coerce.number().int().positive().optional(),
  include_inactive: z.enum(['0', '1']).optional().transform(v => v === '1'),
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
  category_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
