// src/lib/dailyReport.ts — daily-report 讀模型（B1 架構深化 2026-10-11；行為與 SQL 原段搬自 routes/stats.ts）
//
// Interface：
//   buildDailyReport(c, { date, categoryId }) → DailyReportData | null
//     * date：route 已驗過格式與「不晚於今天」（400 系屬 route；taipeiDayRangeUtc 對
//       isValidDate 放行過的日期必回非零邊界，原 handler 的 startMs===0 重複防呆一併退場）
//     * categoryId：number | "all"。"all" 以 implementation 私有的哨兵 -1 處理
//       （SQL 過濾跳過、模板取樣必然落全域預設——v1.1.22 決策藏在內部）
//     * 回傳 null ＝ 類別不存在或已停用；route 映射為 fail(404, NOT_FOUND)
//
// 其餘行為（台灣日界三段 SQL、DESC LIMIT 3 分組＋reverse、status label、has_content）
// 全藏在 implementation 背後——改日報行為＝只改這支檔。
// 規則 1／3：SQL 一律 prepare/bind、逐欄列出；時間一律 ISO。

import type { AppContext } from "./env";
import { taipeiDayRangeUtc } from "./time";
import { getPreferredTemplate } from "./messageTemplates";
import { statusLabel } from "./ticketStatus";

// F1（v1.1.15）：每筆 existing_ticket 的 updates_today 上限（F12-1：撈最新 3 筆）
const UPDATES_PER_TICKET_LIMIT = 3;

export interface DailyReportData {
  date: string;
  category_id: number | null; // v1.1.22：all → null
  category_label: string;
  new_cases: Array<{
    id: number;
    location_label: string;
    status: string;
    description: string;
  }>;
  timeline_updates: Array<{
    id: number;
    location_label: string;
    status: string;
    note: string;
  }>;
  has_content: boolean; // v1.1.16：前端據此決定是否放總系統連結
  templates: { daily: { id: number; body: string } | null };
}

export async function buildDailyReport(
  c: AppContext,
  opts: { date: string; categoryId: number | "all" },
): Promise<DailyReportData | null> {
  const { date } = opts;
  const allOrId = opts.categoryId; // 縮窄用別名（參數屬性存取不進 CFA）
  const isAll = allOrId === "all";
  const categoryId = isAll ? -1 : allOrId;

  const { startMs, endMs } = taipeiDayRangeUtc(date);
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  // 撈類別 label（all：固定「全部類別」，不查 DB）；不存在／停用 → null（route 發 404）
  let categoryLabel = "全部類別";
  if (!isAll) {
    const cat = await c.env.DB.prepare(
      "SELECT label FROM options WHERE type='category' AND id = ? AND active = 1",
    )
      .bind(categoryId)
      .first<{ label: string }>();
    if (!cat) return null;
    categoryLabel = cat.label;
  }

  const catFilter = isAll ? "" : "t.category_id = ? AND ";

  // 1. 新建：當日 created_at 在區間內、屬該類別（all：不限類別）的 tickets
  //    （JOIN users 屬 v1.1.15 SQL 策略原樣保留；creator_name 欄自 v1.1.16 不外顯）
  const newTicketsRaw = await c.env.DB.prepare(
    `SELECT t.id, t.category_label, t.location_label, t.description, t.status,
            t.created_at, u.display_name AS creator_name
     FROM tickets t
     JOIN users u ON u.id = t.created_by
     WHERE ${catFilter}t.created_at >= ? AND t.created_at < ?
     ORDER BY t.id ASC`,
  )
    .bind(...(isAll ? [] : [categoryId]), startIso, endIso)
    .all<{
      id: number;
      category_label: string;
      location_label: string;
      description: string | null;
      status: string;
      created_at: string;
      creator_name: string;
    }>();

  // 標題格式由 lib/db 的 makeTitle 唯一定義（全形「－」）

  // 2. 既有：last_activity_at 落在當日、屬該類別（all：不限類別）、且**非當日新建**
  const existingTicketsRaw = await c.env.DB.prepare(
    `SELECT t.id, t.category_label, t.location_label, t.status
     FROM tickets t
     WHERE ${catFilter}t.last_activity_at >= ? AND t.last_activity_at < ?
       AND t.created_at < ?
     ORDER BY t.id ASC`,
  )
    .bind(...(isAll ? [] : [categoryId]), startIso, endIso, startIso)
    .all<{
      id: number;
      category_label: string;
      location_label: string;
      status: string;
    }>();

  // 3. updates_today：撈上述既有案件的當日所有 update，按 ticket_id 分組、每組最新 3 筆
  //    （F12-1：DESC 是撈最新用，輸出以 .reverse() 回時間正序——避免雙重排序出錯）
  const updatesForTicket = new Map<number, string[]>(); // ticket_id → note 正序清單
  if (existingTicketsRaw.results.length > 0) {
    const existingIds = existingTicketsRaw.results.map((t) => t.id);
    const placeholders = existingIds.map(() => "?").join(",");
    const updatesRaw = await c.env.DB.prepare(
      `SELECT u.ticket_id, u.kind, u.status, u.note, u.amount, u.created_at,
              usr.display_name AS actor_name
       FROM ticket_updates u
       JOIN users usr ON usr.id = u.user_id
       WHERE u.ticket_id IN (${placeholders})
         AND u.created_at >= ? AND u.created_at < ?
       ORDER BY u.ticket_id ASC, u.created_at DESC`,
    )
      .bind(...existingIds, startIso, endIso)
      .all<{
        ticket_id: number;
        kind: string;
        status: string | null;
        note: string | null;
        amount: number | null;
        created_at: string;
        actor_name: string;
      }>();

    // DESC 順序＝每組第一筆是最新：上限填 3 筆後 reverse 回時間正序
    const byTicket = new Map<number, (string | null)[]>();
    for (const u of updatesRaw.results) {
      const arr = byTicket.get(u.ticket_id) ?? [];
      if (arr.length < UPDATES_PER_TICKET_LIMIT) arr.push(u.note);
      byTicket.set(u.ticket_id, arr);
    }
    for (const [tid, notes] of byTicket) {
      updatesForTicket.set(
        tid,
        notes.reverse().map((n) => n ?? ""),
      );
    }
  }

  // 4. timeline_updates：既有案件的今日 update 拉平（v1.1.16：時間軸模板用 flat list）
  //    每筆 { id(案件編號), location_label, status(顯示 label), note }
  const timeline_updates = existingTicketsRaw.results.flatMap((t) =>
    (updatesForTicket.get(t.id) ?? []).map((note) => ({
      id: t.id,
      location_label: t.location_label,
      status: statusLabel(t.status),
      note,
    })),
  );

  // 5. 抓合併模板（v1.1.33：new_case/timeline 併為單一支 daily，body 內含 header/兩段 each/連結）
  //    v1.1.22：all 時 categoryId=-1 → 無任何 option_categories 匹配 → 固定取全域預設模板
  const daily_tpl = await getPreferredTemplate(c, categoryId, "daily");

  // 6. 組裝（v1.1.16 簡化回應格式：純資料，渲染與拼裝在前端 composeDailyMessage）
  const new_cases = newTicketsRaw.results.map((t) => ({
    id: t.id,
    location_label: t.location_label,
    status: "詢價中", // v1.1.16：新案件預設狀態
    description: t.description ?? "",
  }));

  return {
    date,
    category_id: isAll ? null : categoryId,
    category_label: categoryLabel,
    new_cases,
    timeline_updates,
    has_content: new_cases.length > 0 || timeline_updates.length > 0,
    templates: { daily: daily_tpl },
  };
}
