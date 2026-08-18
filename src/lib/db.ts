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
