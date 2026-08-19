// src/lib/db.ts — 共用查詢（§1.2）
// 硬性規則：SQL 一律 prepare().bind()，禁止字串拼接；禁止 SELECT *（逐欄列出）

import type { AppContext } from './env'

/** 依 option id 取 active 的 label；不存在或停用回 null */
export async function activeOptionLabel(
  c: AppContext,
  type: 'category' | 'location' | 'description',
  id: number,
): Promise<string | null> {
  const row = await c.env.DB.prepare(
    'SELECT label FROM options WHERE id = ? AND type = ? AND active = 1',
  )
    .bind(id, type)
    .first<{ label: string }>()
  return row?.label ?? null
}

/** 依 vendor id 取 active 的 vendor；不存在或停用回 null */
export async function activeVendor(
  c: AppContext,
  id: number,
): Promise<{ id: number; name: string } | null> {
  const row = await c.env.DB.prepare(
    'SELECT id, name FROM vendors WHERE id = ? AND active = 1',
  )
    .bind(id)
    .first<{ id: number; name: string }>()
  return row ?? null
}

/** 產生顯示用單號：'#' + id 補零 4 位（§2.1 註） */
export function ticketNo(id: number): string {
  return '#' + String(id).padStart(4, '0')
}

/** 產生 title：{category_label}－{location_label} #{id 補零 4 位}（全角「－」） */
export function makeTitle(categoryLabel: string, locationLabel: string, id: number): string {
  return `${categoryLabel}－${locationLabel} ${ticketNo(id)}`
}

/** 驗證 photo_ids：每張須 uploaded_by=本人 且 target_id IS NULL（§4.1） */
export async function validateOwnUnboundPhotos(
  c: AppContext,
  photoIds: number[],
  userId: number,
): Promise<boolean> {
  if (photoIds.length === 0) return true
  const placeholders = photoIds.map(() => '?').join(',')
  const rows = await c.env.DB.prepare(
    `SELECT id FROM photos
     WHERE id IN (${placeholders}) AND uploaded_by = ? AND target_id IS NULL`,
  )
    .bind(...photoIds, userId)
    .all<{ id: number }>()
  return rows.results.length === photoIds.length
}

/** 驗證 location 是否屬於 category 或為通用（§4.1 v1.1.7） */
export async function optionAllowedInCategory(
  c: AppContext,
  optionId: number,
  categoryId: number,
): Promise<boolean> {
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM options o
     WHERE o.id = ? AND o.type = 'location'
       AND (
         EXISTS (SELECT 1 FROM option_categories oc
                 WHERE oc.option_id = o.id AND oc.category_id = ?)
         OR NOT EXISTS (SELECT 1 FROM option_categories oc2
                        WHERE oc2.option_id = o.id)   -- 通用
       )`,
  )
    .bind(optionId, categoryId)
    .first()
  return !!row
}

/** 驗證 category_ids 是否全為 category（v1.1.7，POST 新增時用，option 尚不存在） */
export async function assertCategoryIds(
  c: AppContext,
  categoryIds: number[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (categoryIds.length === 0) return { ok: true }
  const placeholders = categoryIds.map(() => '?').join(',')
  const cats = await c.env.DB.prepare(
    `SELECT id FROM options WHERE id IN (${placeholders}) AND type = 'category'`,
  ).bind(...categoryIds).all<{ id: number }>()
  if (cats.results.length !== categoryIds.length) return { ok: false, reason: 'category_ids 含非類別' }
  return { ok: true }
}

/** 驗證 category_ids 關聯合法性（§2.6 v1.1.7，應用層強制，SQLite CHECK 不能跨表）
 * 用於 PATCH：option 已存在，須驗 type 為 location/description、category_ids 全為 category、不得自我關聯 */
export async function assertValidAssoc(
  c: AppContext,
  optionId: number,
  categoryIds: number[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (categoryIds.length === 0) return { ok: true }
  // ① option_id 的 type 必須是 location/description
  const opt = await c.env.DB.prepare(
    "SELECT type FROM options WHERE id = ? AND type IN ('location','description')",
  ).bind(optionId).first<{ type: string }>()
  if (!opt) return { ok: false, reason: '僅地點或說明可設定所屬類別' }
  // ② 每個 category_id 的 type 必須是 category
  const check = await assertCategoryIds(c, categoryIds)
  if (!check.ok) return check
  // ③ 不得自我關聯
  if (categoryIds.includes(optionId)) return { ok: false, reason: '不可自我關聯' }
  return { ok: true }
}
