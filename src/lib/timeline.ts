// src/lib/timeline.ts — ticket_updates 寫入路徑單源（BA2 收攏，2026-10-11）
// 五條寫時間軸的端點（PATCH／updates／comments／void／reopen）共用：
//   ① loadTicketForWrite：守門 SELECT id, status（缺行 → 404 信封同段）
//   ② timelineInsert：INSERT 語句產生器（欄位集合為超集，未用欄位綁 NULL）
//   ③ conditionalTransition：「條件 UPDATE→才 INSERT」樂觀鎖成對寫法（void／reopen）
// 合規：SQL 一律 prepare＋bind；內插的 set／guardSql 片段只允許本專案常數
// （ticketStatus 的 ACTIVE_IN_SQL／CLOSED_IN_SQL 等，零使用者輸入）；
// created_at 一律呼叫端傳入同一 batch 的 new Date().toISOString()（規則 3）。

import type { AppContext } from "./env";
import { fail } from "./respond";

export type TimelineKind = "status" | "comment" | "system";

/** 時間軸列的欄位規格；未提供的 status／note／amount 一律 NULL
 *  （amount 於 schema 無 default，顯式 NULL ≡ 原端點略寫欄位） */
export interface TimelineSpec {
  kind: TimelineKind;
  status?: string | null;
  note?: string | null;
  amount?: number | null;
}

/** INSERT 語句產生器（可直接進 env.DB.batch 或單發 .run()） */
export function timelineInsert(
  c: AppContext,
  ticketId: number,
  userId: number,
  createdAt: string,
  spec: TimelineSpec,
): D1PreparedStatement {
  return c.env.DB.prepare(
    `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, note, created_at, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    ticketId,
    userId,
    spec.kind,
    spec.status ?? null,
    spec.note ?? null,
    createdAt,
    spec.amount ?? null,
  );
}

/** 寫入端點守門讀：四條端點共用同一条 SELECT id, status；缺行回 404。
 *  用法：`if (!guard.ok) return guard.response; const ticket = guard.ticket;` */
export type TicketGuard =
  | { ok: true; ticket: { id: number; status: string } }
  | { ok: false; response: Response };

export async function loadTicketForWrite(
  c: AppContext,
  id: number,
): Promise<TicketGuard> {
  const ticket = await c.env.DB.prepare(
    "SELECT id, status FROM tickets WHERE id = ?",
  )
    .bind(id)
    .first<{ id: number; status: string }>();
  if (!ticket)
    return { ok: false, response: fail(c, 404, "NOT_FOUND", "案件不存在") };
  return { ok: true, ticket };
}

/** 「條件 UPDATE→才 INSERT」樂觀鎖成對寫法（E3 v1.1.14；不能用 batch＋INSERT…WHERE EXISTS：
 *  batch 內依序執行，UPDATE 先改狀態後 EXISTS 已讀到新狀態→永遠 false）。
 *  UPDATE 以 guardSql（ACTIVE_IN_SQL／CLOSED_IN_SQL）守門，影響筆數 0 → 回 400 信封；
 *  變更確實發生後才寫時間軸 INSERT（此刻已無競態）。
 *  回傳 undefined＝成功；回傳 Response＝失敗（呼叫端原樣 return）。 */
export async function conditionalTransition(
  c: AppContext,
  opts: {
    /** SET 片段（不含 last_activity_at，本函式固定附加在其後） */
    set: string;
    /** SET 欄位的綁定值，依 ? 出現順序 */
    values: unknown[];
    /** 狀態守門 IN 片段：ticketStatus 的 ACTIVE_IN_SQL／CLOSED_IN_SQL 常數 */
    guardSql: string;
    id: number;
    now: string;
    userId: number;
    timeline: TimelineSpec;
  },
): Promise<Response | undefined> {
  const upd = await c.env.DB.prepare(
    `UPDATE tickets SET ${opts.set}, last_activity_at = ? WHERE id = ? AND status IN ${opts.guardSql}`,
  )
    .bind(...opts.values, opts.now, opts.id)
    .run();
  if (upd.meta.changes === 0) {
    return fail(c, 400, "VALIDATION_ERROR", "案件狀態已變更，請重新整理");
  }
  await timelineInsert(c, opts.id, opts.userId, opts.now, opts.timeline).run();
  return undefined;
}
