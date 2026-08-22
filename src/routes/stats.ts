// src/routes/stats.ts — 統計（§4.7，D6：三角色皆可）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { taipeiMonthRangeUtc } from '../lib/time'
import type { Env } from '../lib/env'

export const statsRoutes = new Hono<Env>()

// GET /api/stats/summary — 三角色皆可（D6，§4.7）
// 支援 ?month=YYYY-MM（缺省為當月）——A4 月份切換（v1.1.14）
statsRoutes.get('/summary', requireAuth(), async (c) => {
  const month = c.req.query('month') // YYYY-MM，缺省為當月
  const { startMs, endMs } = month
    ? (() => {
        // 與 amount-by-category 相同驗證（F4）：嚴格 YYYY-MM 且真月份
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { startMs: 0, endMs: 0 }
        const [y, m] = month.split('-').map(Number)
        const start = new Date(Date.UTC(y, m - 1, 1))
        const end = new Date(Date.UTC(y, m, 1))
        const startIso = new Date(start.getTime() - 8 * 3600 * 1000).toISOString()
        const endIso = new Date(end.getTime() - 8 * 3600 * 1000).toISOString()
        return { startMs: Date.parse(startIso), endMs: Date.parse(endIso) }
      })()
    : taipeiMonthRangeUtc()
  if (startMs === 0) return fail(c, 400, 'VALIDATION_ERROR', '月份格式需為 YYYY-MM')
  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  const [open, inProgress, monthNew, monthDone, monthInitialOpen] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'").first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'in_progress'").first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM tickets WHERE created_at >= ? AND created_at < ?').bind(startIso, endIso).first<{ n: number }>(),
    // month_done：台灣當月內，時間軸出現過 done 回報的不重複案件數（§4.7）
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT ticket_id) AS n FROM ticket_updates
       WHERE kind = 'status' AND status = 'done'
         AND created_at >= ? AND created_at < ?`,
    ).bind(startIso, endIso).first<{ n: number }>(),
    // A3（v1.1.14 方案②）：期初未結案 = 本月月初時點尚未結案（open+in_progress；done/void 不計）
    // 限定「月初前建立」（created_at < 月初），避免把本月新增誤算；因 status 是現狀快照且 reopen 會改狀態，
    // 以「現在仍非 done/void」＋「done/void 但月初後才結案（closed_at >= 月初）」推導月初時未結案
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tickets
       WHERE created_at < ?
         AND (status NOT IN ('done','void')
              OR (closed_at IS NOT NULL AND closed_at >= ?))`,
    ).bind(startIso, startIso).first<{ n: number }>(),
  ])

  return ok(c, {
    open_count: open?.n ?? 0,
    in_progress_count: inProgress?.n ?? 0,
    month_new: monthNew?.n ?? 0,
    month_done: monthDone?.n ?? 0,
    month_initial_open: monthInitialOpen?.n ?? 0, // A3 完成率分母基準（期初未結案）
  })
})

// GET /api/stats/amount-by-category — 三角色皆可（v1.1.12）
// 各類別金額，以「發包時間（amount_at）」為月份基準，每月統計加總
// 例：?month=2026-08 → 2026-08 台灣當月發包的案件，各類別 amount 加總
statsRoutes.get('/amount-by-category', requireAuth(), async (c) => {
  const month = c.req.query('month') // YYYY-MM，缺省為當月
  const { startMs, endMs } = month
    ? (() => {
        // F4（v1.1.14）：嚴格驗證月份格式為 YYYY-MM 且為真月份（擋 2026-8、2026-0008、2026-08-extra、2026-13）
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { startMs: 0, endMs: 0 }
        const [y, m] = month.split('-').map(Number)
        const start = new Date(Date.UTC(y, m - 1, 1))
        const end = new Date(Date.UTC(y, m, 1))
        // 換算台灣時區當月邊界
        const startIso = new Date(start.getTime() - 8 * 3600 * 1000).toISOString()
        const endIso = new Date(end.getTime() - 8 * 3600 * 1000).toISOString()
        return { startMs: Date.parse(startIso), endMs: Date.parse(endIso) }
      })()
    : taipeiMonthRangeUtc()
  if (startMs === 0) return fail(c, 400, 'VALIDATION_ERROR', '月份格式需為 YYYY-MM')

  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  // 以 amount_at（發包時間）為基準，各類別金額加總
  const rows = await c.env.DB.prepare(
    `SELECT t.category_label, COALESCE(SUM(t.amount), 0) AS total_amount, COUNT(*) AS count
     FROM tickets t
     WHERE t.amount IS NOT NULL AND t.amount_at >= ? AND t.amount_at < ?
     GROUP BY t.category_label
     ORDER BY total_amount DESC`,
  ).bind(startIso, endIso).all<{ category_label: string; total_amount: number; count: number }>()

  return ok(c, { month: month || undefined, items: rows.results })
})
