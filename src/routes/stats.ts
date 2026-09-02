// src/routes/stats.ts — 統計（§4.7，D6：三角色皆可）
// 註冊於全域 requireAuth() 之下

import { Hono } from 'hono'
import { ok, fail } from '../lib/respond'
import { requireAuth } from '../lib/auth'
import { taipeiMonthRangeUtc, taipeiDayRangeUtc, isValidDate, toTaipeiDisplay, taipeiToday } from '../lib/time'
import { nowIso } from '../lib/time'
import type { Env } from '../lib/env'

// F1（v1.1.15）：status 字串 → 顯示用 label
// 與前端 app.js:480 的 STATUS_COLOR_MAP 對齊
const STATUS_LABEL: Record<string, string> = {
  open: '待處理',
  in_progress: '已發包',
  done: '已完成',
  void: '已作廢',
}

// F1（v1.1.15）：detail_url base，env 未設 fallback 為正式網域
const DEFAULT_BASE_URL = 'https://repair-system-4re.pages.dev'

// F1（v1.1.15）：每筆 existing_ticket 的 updates_today 上限
const UPDATES_PER_TICKET_LIMIT = 3

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

// GET /api/stats/daily-report — 三角色皆可（F1 v1.1.15；v1.1.16 簡化回應格式）
// Query 必填：date=YYYY-MM-DD、category_id=N 或 'all'（v1.1.22：全部類別，固定用全域預設模板）
// 回傳純資料 + new_case / timeline 兩模板 body（v1.1.16：前端自行渲染並拼成成品）
// 用途：保全每天對委員發 LINE 群組報告該類別（或全部類別）當日案件動態
const ALL_CATEGORIES = 'all'
statsRoutes.get('/daily-report', requireAuth(), async (c) => {
  const date = c.req.query('date')
  const categoryIdStr = c.req.query('category_id')

  if (!date) return fail(c, 400, 'MISSING_DATE', 'date 必填（YYYY-MM-DD）')
  if (!isValidDate(date)) return fail(c, 400, 'INVALID_DATE', 'date 格式需為 YYYY-MM-DD 且為真實日期')
  if (date > taipeiToday()) return fail(c, 400, 'DATE_FUTURE', 'date 不可晚於今天（台灣）')
  if (!categoryIdStr) return fail(c, 400, 'VALIDATION_ERROR', 'category_id 必填')
  const isAll = categoryIdStr === ALL_CATEGORIES
  const categoryId = isAll ? -1 : Number(categoryIdStr) // -1：all 時當「不存在」的 category_id 用（SQL 過濾跳過、模板取樣落全域）
  if (!isAll && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    return fail(c, 400, 'VALIDATION_ERROR', 'category_id 需為正整數或 "all"')
  }

  const { startMs, endMs } = taipeiDayRangeUtc(date)
  if (startMs === 0) return fail(c, 400, 'INVALID_DATE', 'date 格式需為 YYYY-MM-DD')
  const startIso = new Date(startMs).toISOString()
  const endIso = new Date(endMs).toISOString()

  // 撈類別 label（all：固定「全部類別」，不查 DB）
  let categoryLabel = '全部類別'
  if (!isAll) {
    const cat = await c.env.DB.prepare(
      "SELECT label FROM options WHERE type='category' AND id = ? AND active = 1",
    ).bind(categoryId).first<{ label: string }>()
    if (!cat) return fail(c, 404, 'NOT_FOUND', '類別不存在或已停用')
    categoryLabel = cat.label
  }

  const baseUrl = c.env.BASE_URL || DEFAULT_BASE_URL
  const catFilter = isAll ? '' : 't.category_id = ? AND '

  // 1. 新建：當日 created_at 在區間內、屬該類別（all：不限類別）的 tickets
  const newTicketsRaw = await c.env.DB.prepare(
    `SELECT t.id, t.category_label, t.location_label, t.description, t.status,
            t.created_at, u.display_name AS creator_name
     FROM tickets t
     JOIN users u ON u.id = t.created_by
     WHERE ${catFilter}t.created_at >= ? AND t.created_at < ?
     ORDER BY t.id ASC`,
  ).bind(...(isAll ? [] : [categoryId]), startIso, endIso).all<{
    id: number; category_label: string; location_label: string; description: string | null;
    status: string; created_at: string; creator_name: string
  }>()

  // tickets 表無 title 欄位（migration 0001: 無 ticket_no 註解）—— 用 category_label+location_label+id 組標題
  const pad4 = (n: number) => String(n).padStart(4, '0')
  const buildTitle = (t: { category_label: string; location_label: string; id: number }) =>
    `${t.category_label}-${t.location_label} #${pad4(t.id)}`

  const newTickets = newTicketsRaw.results.map((t) => ({
    id: t.id,
    title: buildTitle(t),
    location_label: t.location_label,
    description: t.description ?? '',
    creator_name: t.creator_name,
    created_at: t.created_at,
    created_at_time: toTaipeiDisplay(t.created_at).slice(11), // HH:MM
    status: t.status,
    detail_url: `${baseUrl}/#/ticket/${t.id}`,
  }))

  // 2. 既有：last_activity_at 落在當日、屬該類別（all：不限類別）、且**非當日新建**
  const existingTicketsRaw = await c.env.DB.prepare(
    `SELECT t.id, t.category_label, t.location_label, t.status
     FROM tickets t
     WHERE ${catFilter}t.last_activity_at >= ? AND t.last_activity_at < ?
       AND t.created_at < ?
     ORDER BY t.id ASC`,
  ).bind(...(isAll ? [] : [categoryId]), startIso, endIso, startIso).all<{
    id: number; category_label: string; location_label: string; status: string
  }>()

  // 3. updates_today：撈上述既有案件的當日所有 update（按時間正序）
  let existingTickets: Array<{
    id: number; title: string; location_label: string;
    current_status: string; status_label: string;
    detail_url: string;
    updates_today: Array<{
      kind: string; status: string | null;
      actor_name: string; time: string;
      note: string | null; amount: number | null;
    }>;
  }> = []

  if (existingTicketsRaw.results.length > 0) {
    const existingIds = existingTicketsRaw.results.map((t) => t.id)
    const placeholders = existingIds.map(() => '?').join(',')
    // F12-1：每張 ticket 取**最新 3 筆**（DESC LIMIT 3），應用層再 .reverse() 回時間正序輸出
    // （DESC 是撈最新用，輸出按 F12-1 時間正序——避免雙重排序出錯）
    const updatesRaw = await c.env.DB.prepare(
      `SELECT u.ticket_id, u.kind, u.status, u.note, u.amount, u.created_at,
              usr.display_name AS actor_name
       FROM ticket_updates u
       JOIN users usr ON usr.id = u.user_id
       WHERE u.ticket_id IN (${placeholders})
         AND u.created_at >= ? AND u.created_at < ?
       ORDER BY u.ticket_id ASC, u.created_at DESC`,
    ).bind(...existingIds, startIso, endIso).all<{
      ticket_id: number; kind: string; status: string | null;
      note: string | null; amount: number | null;
      created_at: string; actor_name: string
    }>()

    // 按 ticket_id 分組（DESC 順序 = 每組第一筆是最新），slice 0..3、reverse 回 ASC 輸出
    const byTicket = new Map<number, typeof updatesRaw.results>()
    for (const u of updatesRaw.results) {
      const arr = byTicket.get(u.ticket_id) ?? []
      if (arr.length < UPDATES_PER_TICKET_LIMIT) arr.push(u)
      byTicket.set(u.ticket_id, arr)
    }

    existingTickets = existingTicketsRaw.results.map((t) => {
      const updates = (byTicket.get(t.id) ?? []).slice(0, UPDATES_PER_TICKET_LIMIT).reverse()
      return {
        id: t.id,
        title: buildTitle(t),
        location_label: t.location_label,
        current_status: t.status,
        status_label: STATUS_LABEL[t.status] ?? t.status,
        detail_url: `${baseUrl}/#/ticket/${t.id}`,
        updates_today: updates.map((u) => ({
          kind: u.kind,
          status: u.status,
          actor_name: u.actor_name,
          time: toTaipeiDisplay(u.created_at).slice(11), // HH:MM
          note: u.note,
          amount: u.amount,
        })),
      }
    })
  }

  // 5. timeline_updates：把既有案件的今日 update 拉平（v1.1.16：時間軸模板用 flat list）
  //    每筆 { id(案件編號), location_label, status(顯示 label), note }；note 空值轉 ''
  const timeline_updates = existingTickets.flatMap((t) =>
    t.updates_today.map((u) => ({
      id: t.id,
      location_label: t.location_label,
      status: t.status_label,
      note: u.note ?? '',
    })),
  )

  // 6. 抓兩種模板內容（v1.1.20：type 欄當鍵、label 欄存內容；v1.1.16：new_case / timeline，各別走類別專用 / 全域預設）
  //    回應形狀不變：{ id, body }，body 現在取自 label 欄（內容），key 由 type 導出
  //    v1.1.22：all 時 categoryId=-1 → 無任何 option_categories 匹配 → 固定取全域預設模板
  const fetchTmpl = async (label: 'new_case' | 'timeline') => {
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
    ).bind('message_template_' + label, categoryId, categoryId).first<{ id: number; body: string }>()
    return row ? { id: row.id, body: row.body } : null
  }
  const [new_case_tpl, timeline_tpl] = await Promise.all([
    fetchTmpl('new_case'),
    fetchTmpl('timeline'),
  ])

  return ok(c, {
    date,
    category_id: isAll ? null : categoryId, // v1.1.22：all → null
    category_label: categoryLabel,
    // v1.1.16：前端自行渲染兩種模板並拼成成品（砍後端 templateEngine）
    new_cases: newTickets.map((t) => ({
      id: t.id,
      location_label: t.location_label,
      status: '詢價中', // v1.1.16：新案件預設狀態
      description: t.description ?? '',
    })),
    timeline_updates,
    has_content: newTickets.length > 0 || timeline_updates.length > 0, // v1.1.16：前端據此決定是否放總系統連結
    templates: { new_case: new_case_tpl, timeline: timeline_tpl },
  })
})
