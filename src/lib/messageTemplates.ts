// src/lib/messageTemplates.ts — 訊息模板 repository（於 options 字典表之上）
// v1.1.20 刻印為本模組唯一定義：type 欄＝模板鍵（前綴 'message_template_'）、
// label 欄＝模板內容；優先序＝該類別關聯優先 → 全域預設（無 option_categories 記錄）。
// 呼叫端（routes）經此縫取用，不再直寫欄位對應。

import type { AppContext } from "./env";

const PREFIX = "message_template_";

/** 列表列：含 is_category_specific（1＝該類別關聯） */
export type TemplateListRow = {
  id: number;
  label: string;
  body: string;
  active: number;
  sort_order: number;
  is_category_specific: number;
};

/** 單取列：{ id, label(鍵), body(內容), active, sort_order } */
export type TemplateView = {
  id: number;
  label: string;
  body: string | null;
  active: number;
  sort_order: number;
};

const VIEW_PROJECTION = `id,
       REPLACE(type, '${PREFIX}', '') AS label,
       label AS body, active, sort_order`;

/** 列表：該鍵全部模板，類別關聯優先 → 全域預設 */
export async function listTemplates(
  c: AppContext,
  categoryId: number,
  key: string,
): Promise<TemplateListRow[]> {
  const res = await c.env.DB.prepare(
    `SELECT o.id,
       REPLACE(o.type, '${PREFIX}', '') AS label,
       o.label AS body, o.active, o.sort_order,
       CASE WHEN EXISTS (SELECT 1 FROM option_categories oc WHERE oc.option_id = o.id AND oc.category_id = ?)
         THEN 1 ELSE 0 END AS is_category_specific
     FROM options o
     WHERE o.type = ? AND o.active = 1
     ORDER BY is_category_specific DESC, o.sort_order ASC, o.id ASC`,
  )
    .bind(categoryId, PREFIX + key)
    .all<TemplateListRow>();
  return res.results;
}

/** 依 id 單取（限模板型） */
export async function getTemplateById(
  c: AppContext,
  id: number,
): Promise<TemplateView | null> {
  return c.env.DB.prepare(
    `SELECT ${VIEW_PROJECTION} FROM options WHERE id = ? AND type LIKE '${PREFIX}%'`,
  )
    .bind(id)
    .first<TemplateView>();
}

/** 單一首選模板：該類別關聯優先，否則全域預設；無則 null */
export async function getPreferredTemplate(
  c: AppContext,
  categoryId: number,
  key: string,
): Promise<{ id: number; body: string } | null> {
  const row = await c.env.DB.prepare(
    `SELECT o.id, o.label AS body
     FROM options o
     WHERE o.type = ? AND o.active = 1
       AND (
         o.id IN (SELECT option_id FROM option_categories WHERE category_id = ?)
         OR o.id NOT IN (SELECT option_id FROM option_categories)
       )
     ORDER BY (o.id IN (SELECT option_id FROM option_categories WHERE category_id = ?)) DESC,
              o.sort_order ASC
     LIMIT 1`,
  )
    .bind(PREFIX + key, categoryId, categoryId)
    .first<{ id: number; body: string }>();
  return row ?? null;
}

/** 現有模板的鍵（去前綴）；非模板列回 null */
export async function findTemplateKey(
  c: AppContext,
  id: number,
): Promise<string | null> {
  const row = await c.env.DB.prepare(
    `SELECT id, type FROM options WHERE id = ? AND type LIKE '${PREFIX}%'`,
  )
    .bind(id)
    .first<{ id: number; type: string }>();
  return row ? row.type.slice(PREFIX.length) : null;
}

/** 新鍵是否被其他列占用 */
export async function isKeyTaken(
  c: AppContext,
  key: string,
  excludeId: number,
): Promise<boolean> {
  const dup = await c.env.DB.prepare(
    `SELECT id FROM options WHERE type = ? AND id != ?`,
  )
    .bind(PREFIX + key, excludeId)
    .first<{ id: number }>();
  return dup !== null;
}

/** 就地覆寫：body→內容、key→鍵（欄位映射由本模組持有）；兩者皆缺＝no-op */
export async function writeTemplate(
  c: AppContext,
  id: number,
  fields: { body?: string; key?: string },
): Promise<void> {
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (fields.body !== undefined) {
    sets.push("label = ?");
    binds.push(fields.body);
  }
  if (fields.key !== undefined) {
    sets.push("type = ?");
    binds.push(PREFIX + fields.key);
  }
  if (sets.length === 0) return;
  binds.push(id);
  await c.env.DB.prepare(`UPDATE options SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
}
