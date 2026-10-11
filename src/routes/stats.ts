// src/routes/stats.ts — 統計（§4.7，D6：三角色皆可）
// 註冊於全域 requireAuth() 之下

import { Hono } from "hono";
import { ok, fail } from "../lib/respond";
import { taipeiMonthRangeIso, isValidDate, taipeiToday } from "../lib/time";
import type { Env } from "../lib/env";
import { CLOSED_IN_SQL } from "../lib/ticketStatus";
import { buildDailyReport } from "../lib/dailyReport";

export const statsRoutes = new Hono<Env>();

// GET /api/stats/summary — 三角色皆可（D6，§4.7）
// 支援 ?month=YYYY-MM（缺省為當月）——A4 月份切換（v1.1.14）
statsRoutes.get("/summary", async (c) => {
  const month = c.req.query("month"); // YYYY-MM，缺省為當月
  const { startIso, endIso } = taipeiMonthRangeIso(month);
  if (startIso === "")
    return fail(c, 400, "VALIDATION_ERROR", "月份格式需為 YYYY-MM");

  const [open, inProgress, monthNew, monthDone, monthInitialOpen] =
    await Promise.all([
      c.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'",
      ).first<{ n: number }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM tickets WHERE status = 'in_progress'",
      ).first<{ n: number }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM tickets WHERE created_at >= ? AND created_at < ?",
      )
        .bind(startIso, endIso)
        .first<{ n: number }>(),
      // month_done：台灣當月內，時間軸出現過 done 回報的不重複案件數（§4.7）
      c.env.DB.prepare(
        `SELECT COUNT(DISTINCT ticket_id) AS n FROM ticket_updates
       WHERE kind = 'status' AND status = 'done'
         AND created_at >= ? AND created_at < ?`,
      )
        .bind(startIso, endIso)
        .first<{ n: number }>(),
      // A3（v1.1.14 方案②）：期初未結案 = 本月月初時點尚未結案（open+in_progress；done/void 不計）
      // 限定「月初前建立」（created_at < 月初），避免把本月新增誤算；因 status 是現狀快照且 reopen 會改狀態，
      // 以「現在仍非 done/void」＋「done/void 但月初後才結案（closed_at >= 月初）」推導月初時未結案
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM tickets
       WHERE created_at < ?
         AND (status NOT IN ${CLOSED_IN_SQL}
              OR (closed_at IS NOT NULL AND closed_at >= ?))`,
      )
        .bind(startIso, startIso)
        .first<{ n: number }>(),
    ]);

  return ok(c, {
    open_count: open?.n ?? 0,
    in_progress_count: inProgress?.n ?? 0,
    month_new: monthNew?.n ?? 0,
    month_done: monthDone?.n ?? 0,
    month_initial_open: monthInitialOpen?.n ?? 0, // A3 完成率分母基準（期初未結案）
  });
});

// GET /api/stats/amount-by-category — 三角色皆可（v1.1.12）
// 各類別金額，以「發包時間（amount_at）」為月份基準，每月統計加總
// 例：?month=2026-08 → 2026-08 台灣當月發包的案件，各類別 amount 加總
statsRoutes.get("/amount-by-category", async (c) => {
  const month = c.req.query("month"); // YYYY-MM，缺省為當月
  const { startIso, endIso } = taipeiMonthRangeIso(month);
  if (startIso === "")
    return fail(c, 400, "VALIDATION_ERROR", "月份格式需為 YYYY-MM");

  // 以 amount_at（發包時間）為基準，各類別金額加總
  const rows = await c.env.DB.prepare(
    `SELECT t.category_label, COALESCE(SUM(t.amount), 0) AS total_amount, COUNT(*) AS count
     FROM tickets t
     WHERE t.amount IS NOT NULL AND t.amount_at >= ? AND t.amount_at < ?
     GROUP BY t.category_label
     ORDER BY total_amount DESC`,
  )
    .bind(startIso, endIso)
    .all<{ category_label: string; total_amount: number; count: number }>();

  return ok(c, { month: month || undefined, items: rows.results });
});

// GET /api/stats/daily-report — 三角色皆可（F1 v1.1.15；v1.1.16 簡化回應格式）
// Query 必填：date=YYYY-MM-DD、category_id=N 或 'all'（v1.1.22：全部類別，固定用全域預設模板）
// 回應形狀 §4.7；組裝邏輯收攏於 src/lib/dailyReport.ts（2026-10-11 B1 深化）——
// route 職責＝信封：date/category 的 400 系、類別不存在 404、ok()。
const ALL_CATEGORIES = "all";
statsRoutes.get("/daily-report", async (c) => {
  const date = c.req.query("date");
  const categoryIdStr = c.req.query("category_id");

  if (!date) return fail(c, 400, "MISSING_DATE", "date 必填（YYYY-MM-DD）");
  if (!isValidDate(date))
    return fail(
      c,
      400,
      "INVALID_DATE",
      "date 格式需為 YYYY-MM-DD 且為真實日期",
    );
  if (date > taipeiToday())
    return fail(c, 400, "DATE_FUTURE", "date 不可晚於今天（台灣）");
  if (!categoryIdStr)
    return fail(c, 400, "VALIDATION_ERROR", "category_id 必填");

  let categoryId: number | "all";
  if (categoryIdStr === ALL_CATEGORIES) {
    categoryId = ALL_CATEGORIES;
  } else {
    const n = Number(categoryIdStr);
    if (!Number.isInteger(n) || n <= 0)
      return fail(c, 400, "VALIDATION_ERROR", 'category_id 需為正整數或 "all"');
    categoryId = n;
  }

  const data = await buildDailyReport(c, { date, categoryId });
  if (data === null) return fail(c, 404, "NOT_FOUND", "類別不存在或已停用");
  return ok(c, data);
});
