// src/routes/stats.ts — 統計（§4.7，D6：三角色皆可）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { ok } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { taipeiMonthRangeUtc } from '../lib/time'
import type { Env } from '../lib/env'

export const statsRoutes = new Hono<Env>()

// GET /api/stats/summary — 三角色皆可（D6，§4.7）
statsRoutes.get('/summary', requireAuth(), async (c) => {
  const { startMs, endMs } = taipeiMonthRangeUtc()
  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  const [open, inProgress, monthNew, monthDone] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'").first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'in_progress'").first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM tickets WHERE created_at >= ? AND created_at < ?').bind(startIso, endIso).first<{ n: number }>(),
    // month_done：台灣當月內，時間軸出現過 done 回報的不重複案件數（§4.7）
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT ticket_id) AS n FROM ticket_updates
       WHERE kind = 'status' AND status = 'done'
         AND created_at >= ? AND created_at < ?`,
    ).bind(startIso, endIso).first<{ n: number }>(),
  ])

  return ok(c, {
    open_count: open?.n ?? 0,
    in_progress_count: inProgress?.n ?? 0,
    month_new: monthNew?.n ?? 0,
    month_done: monthDone?.n ?? 0,
  })
})
