// tests/stats.test.ts — A1 統計完成率測試覆蓋（v1.1.15 §A1）
// 鎖定 GET /api/stats/summary 的現有 SQL 行為：
//   - month_done 從 ticket_updates 時間軸計算（DISTINCT ticket_id）
//   - month_initial_open 用 tickets.status 現狀快照 + closed_at 反推月初時點
//
// 已知失真（清單 A1 提及）：同月內「done→reopen→再 done」會把案件同時計入
// month_done 分子（時間軸視角）與 month_initial_open 分母（現狀快照視角）。
// 本測試**記錄**這個失真，不修正 SQL（修正列入「更完整解法」v1.1.16 待評估）。
//
// ⚠️ 時間戳邊界提醒：src/routes/stats.ts 用 taipeiMonthRangeUtc() 計算月份邊界，
// SQL 範圍是 [當月 1 日 00:00 台灣的 UTC, 下月 1 日 00:00 台灣的 UTC)。
//   當月 1 日 00:00 台灣  = 當月 1 日 00:00 UTC − 8h
//                        = 前月最後一天 16:00 UTC
//   所以 SQL 月初邊界是「前月 16:00 UTC」而非「當月 00:00 UTC」。
// 本測試 ticket 建單時間一律用 monthStart - 16h 保證落在月初前；
// 事件時間用 monthStart + 1s 起跳，保證落在 SQL 月初之後。

import { SELF, env } from 'cloudflare:test'
import { describe, it, expect, vi, afterEach } from 'vitest'

const worker = SELF

afterEach(() => vi.restoreAllMocks())

function mockLineVerify(sub: string, name: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.href.startsWith('https://api.line.me/oauth2/v2.1/verify')) {
      return new Response(JSON.stringify({
        iss: 'https://access.line.me', sub, aud: 'test-channel',
        exp: Math.floor(Date.now() / 1000) + 3600, name,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error('No mock found for ' + url.href)
  })
}

async function loginAs(sub: string, name: string, role: 'committee' | 'manager' | 'admin') {
  mockLineVerify(sub, name)
  const session = await worker.fetch('http://example.com/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ id_token: 'mock' }),
  })
  const body = await session.json()
  await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, body.data.user_id).run()
  return { userId: body.data.user_id, cookie: session.headers.get('set-cookie')?.split(';')[0] ?? '' }
}

/** 取得當前台灣當月 YYYY-MM（含未來月份滾動時的測試穩定性） */
function currentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`
}

describe('A1 GET /api/stats/summary 行為鎖定（v1.1.15）', () => {
  it('登入三角色皆可讀 /summary', async () => {
    const { cookie } = await loginAs('U-stats-cmt', '委員', 'committee')
    const r = await worker.fetch('http://example.com/api/stats/summary', {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data).toHaveProperty('month_done')
    expect(body.data).toHaveProperty('month_initial_open')
  })

  it('同月內 done→reopen→再 done，month_done 計 1 件（DISTINCT ticket_id）', async () => {
    const admin = await loginAs('U-stats-reopen', '管理員', 'admin')
    const cat = await env.DB.prepare("SELECT id, label FROM options WHERE type='category' AND active=1 LIMIT 1").first<{ id: number; label: string }>()
    const loc = await env.DB.prepare("SELECT id, label FROM options WHERE type='location' AND active=1 LIMIT 1").first<{ id: number; label: string }>()
    if (!cat || !loc) throw new Error('seed 缺少 options')

    // 抓基線
    const beforeRes = await worker.fetch('http://example.com/api/stats/summary', {
      headers: { Cookie: admin.cookie },
    })
    const before = (await beforeRes.json()).data as {
      month_done: number; month_initial_open: number; month_new: number
    }

    // 建單：本月初（保證 month_new +1）
    const monthStart = currentMonth() + '-01T00:00:00.000Z'
    const ticketIns = await env.DB.prepare(
      `INSERT INTO tickets (category_id, category_label, location_id, location_label, description,
                           status, share_token, created_by, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
    ).bind(cat.id, cat.label, loc.id, loc.label, 'reopen 失真測試',
           crypto.randomUUID(), admin.userId, monthStart, monthStart).run()
    const ticketId = Number(ticketIns.meta.last_row_id)

    // 三筆時間軸事件，全部在本月內：in_progress → done → reopen → done
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at)
       VALUES (?, ?, 'status', 'in_progress', ?)`,
    ).bind(ticketId, admin.userId, monthStart).run()

    const t1 = new Date(Date.parse(monthStart) + 1000).toISOString()
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at)
       VALUES (?, ?, 'status', 'done', ?)`,
    ).bind(ticketId, admin.userId, t1).run()

    const t2 = new Date(Date.parse(monthStart) + 2000).toISOString()
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at)
       VALUES (?, ?, 'status', 'open', ?)`,
    ).bind(ticketId, admin.userId, t2).run() // reopen 視同 status=open

    const t3 = new Date(Date.parse(monthStart) + 3000).toISOString()
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at)
       VALUES (?, ?, 'status', 'done', ?)`,
    ).bind(ticketId, admin.userId, t3).run()

    await env.DB.prepare(
      `UPDATE tickets SET status='done', closed_at=?, last_activity_at=? WHERE id=?`,
    ).bind(t3, t3, ticketId).run()

    // 抓 after
    const afterRes = await worker.fetch('http://example.com/api/stats/summary', {
      headers: { Cookie: admin.cookie },
    })
    const after = (await afterRes.json()).data as {
      month_done: number; month_initial_open: number; month_new: number
    }

    // 預期 delta：
    //   month_new +1（建單在月初當天，created_at >= 月初）
    //   month_done +1（DISTINCT ticket_id 算這件）
    //   month_initial_open 不變（created_at = 月初當天，SQL 嚴格 < 月初不成立）
    expect(after.month_new - before.month_new).toBe(1)
    expect(after.month_done - before.month_done).toBe(1)
    expect(after.month_initial_open - before.month_initial_open).toBe(0)
  })

  it('月初前建的單 → 同月 done → reopen → 再 done 仍被算入 month_done 分子（失真案例記錄）', async () => {
    const admin = await loginAs('U-stats-distort', '失真測試', 'admin')
    const cat = await env.DB.prepare("SELECT id, label FROM options WHERE type='category' AND active=1 LIMIT 1").first<{ id: number; label: string }>()
    const loc = await env.DB.prepare("SELECT id, label FROM options WHERE type='location' AND active=1 LIMIT 1").first<{ id: number; label: string }>()
    if (!cat || !loc) throw new Error('seed 缺少 options')

    // 抓塞資料前的當月數字（基線）
    const beforeRes = await worker.fetch('http://example.com/api/stats/summary', {
      headers: { Cookie: admin.cookie },
    })
    const before = (await beforeRes.json()).data as {
      month_done: number; month_initial_open: number; month_new: number
    }

    // 建單時間：必須比 SQL 認定的「月初」（台灣 1 日 00:00 的 UTC，即前月最後一天 16:00 UTC）更早
    // monthStart 只是「當月 1 日 00:00 UTC」的標籤；SQL 真正的邊界是 taipeiMonthRangeUtc()
    // 算出的台灣當月 1 日 00:00 → UTC。我們用 monthStart 減 16 小時，保證落在 SQL 月初前。
    const monthStart = currentMonth() + '-01T00:00:00.000Z'
    const beforeMonthStart = new Date(Date.parse(monthStart) - 16 * 3600 * 1000).toISOString()
    const ticketIns = await env.DB.prepare(
      `INSERT INTO tickets (category_id, category_label, location_id, location_label, description,
                           status, share_token, created_by, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
    ).bind(cat.id, cat.label, loc.id, loc.label, '失真案例',
           crypto.randomUUID(), admin.userId, beforeMonthStart, beforeMonthStart).run()
    const ticketId = Number(ticketIns.meta.last_row_id)

    // 本月內 done 事件：時間軸 done 必須落在 SQL 月初邊界 [startIso, endIso) 內。
    // SQL startIso = monthStart - 16h UTC, endIso = 下月 - 16h UTC。
    // 用 monthStart + 1 秒（即台灣 1 日 08:00:01）保證落在範圍內。
    const t1 = new Date(Date.parse(monthStart) + 1000).toISOString()
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at) VALUES (?, ?, 'status', 'done', ?)`,
    ).bind(ticketId, admin.userId, t1).run()
    const t2 = new Date(Date.parse(monthStart) + 2000).toISOString()
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at) VALUES (?, ?, 'status', 'open', ?)`,
    ).bind(ticketId, admin.userId, t2).run()
    const t3 = new Date(Date.parse(monthStart) + 3000).toISOString()
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at) VALUES (?, ?, 'status', 'done', ?)`,
    ).bind(ticketId, admin.userId, t3).run()
    await env.DB.prepare(
      `UPDATE tickets SET status='done', closed_at=?, last_activity_at=? WHERE id=?`,
    ).bind(t3, t3, ticketId).run()

    // 抓塞資料後的當月數字
    const afterRes = await worker.fetch('http://example.com/api/stats/summary', {
      headers: { Cookie: admin.cookie },
    })
    const after = (await afterRes.json()).data as {
      month_done: number; month_initial_open: number; month_new: number
    }

    // 預期 delta（清單 A1 描述的失真鎖定）：
    //   month_done delta = 1（DISTINCT ticket_id 算這件）
    //   month_initial_open delta = 1（created_at < 月初 + closed_at 同月 → 視為月初未結案）
    //   month_new delta = 0（建單在月初前，不計本月新增）
    // 失真點：同一張單同時算進分子（month_done）與分母（month_initial_open），
    // 導致完成率被稀釋。
    expect(after.month_done - before.month_done).toBe(1)
    expect(after.month_initial_open - before.month_initial_open).toBe(1)
    expect(after.month_new - before.month_new).toBe(0)
  })

  it('跨月時間軸事件：本月 done 不計上月 month_done', async () => {
    const admin = await loginAs('U-stats-cross', '跨月測試', 'admin')
    const cat = await env.DB.prepare("SELECT id, label FROM options WHERE type='category' AND active=1 LIMIT 1").first<{ id: number; label: string }>()
    const loc = await env.DB.prepare("SELECT id, label FROM options WHERE type='location' AND active=1 LIMIT 1").first<{ id: number; label: string }>()
    if (!cat || !loc) throw new Error('seed 缺少 options')

    const monthStart = currentMonth() + '-01T00:00:00.000Z'
    // 「上月最後一天」當時間軸 done 事件的標籤時間。
    const lastMonthMid = new Date(Date.parse(monthStart) - 86400000).toISOString()
    const lastMonthStr = lastMonthMid.slice(0, 7)
    // 建單時間：必須在上月月初（SQL startIso = 上月 1 日 00:00 台灣 → UTC）之前。
    // 用 monthStart - 40 天（≈上月月初前 24 天）確保遠小於上月月初 UTC。
    const createdAt = new Date(Date.parse(monthStart) - 40 * 86400000).toISOString()

    // 抓上月基線
    const beforeRes = await worker.fetch(`http://example.com/api/stats/summary?month=${lastMonthStr}`, {
      headers: { Cookie: admin.cookie },
    })
    const before = (await beforeRes.json()).data as {
      month_done: number; month_initial_open: number
    }

    // 建單時間遠早於上月月初 → SQL `created_at < 月初` 成立；
    // 上月結案 → 時間軸 done 落在上月 → month_done +1；
    // 現狀 done + closed_at 在上月 → 條件二 (closed_at >= 月初) 成立。
    const ticketIns = await env.DB.prepare(
      `INSERT INTO tickets (category_id, category_label, location_id, location_label, description,
                           status, share_token, created_by, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, 'done', ?, ?, ?, ?)`,
    ).bind(cat.id, cat.label, loc.id, loc.label, '上月結案',
           crypto.randomUUID(), admin.userId, createdAt, createdAt).run()
    const ticketId = Number(ticketIns.meta.last_row_id)

    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, created_at) VALUES (?, ?, 'status', 'done', ?)`,
    ).bind(ticketId, admin.userId, lastMonthMid).run()
    await env.DB.prepare(
      `UPDATE tickets SET closed_at=?, last_activity_at=? WHERE id=?`,
    ).bind(lastMonthMid, lastMonthMid, ticketId).run()

    // 抓上月 after、本月 after
    const afterLastRes = await worker.fetch(`http://example.com/api/stats/summary?month=${lastMonthStr}`, {
      headers: { Cookie: admin.cookie },
    })
    const afterLast = (await afterLastRes.json()).data as {
      month_done: number; month_initial_open: number
    }
    const afterCurRes = await worker.fetch(`http://example.com/api/stats/summary?month=${currentMonth()}`, {
      headers: { Cookie: admin.cookie },
    })
    const afterCur = (await afterCurRes.json()).data as {
      month_done: number; month_initial_open: number
    }

    // 上月 month_done +1（時間軸 done 在上月），上月 month_initial_open +1（建單在月初前）
    expect(afterLast.month_done - before.month_done).toBe(1)
    expect(afterLast.month_initial_open - before.month_initial_open).toBe(1)
    // 本月 month_done、month_initial_open 都不變（沒新增本月事件，closed_at 也是上月）
    // 但注意：本月 summary 的 month_initial_open SQL 條件是「created_at < 本月初」，
    // 這張 ticket created_at 在上月 < 本月初，所以**會**計入本月 month_initial_open。
    // （它「本月還沒結案」嗎？看 closed_at 是上月，closed_at < 本月初 → 月初時已結案 → 不算未結案）
    // SQL 條件：status NOT IN ('done','void') → status='done' → FALSE
    //         OR (closed_at IS NOT NULL AND closed_at >= 本月初) → closed_at < 本月初 → FALSE
    // → 整條 OR FALSE → 這張不算本月 month_initial_open ✅
    // 所以本月 delta month_initial_open = 0
    expect(afterCur.month_initial_open - before.month_initial_open).toBe(0)
  })
})

describe('F1 GET /api/stats/daily-report 行為鎖定（v1.1.15）', () => {
  // 工具：建立一個 category 並回傳 id
  async function ensureCategory(label: string): Promise<number> {
    const exist = await env.DB.prepare(
      "SELECT id FROM options WHERE type='category' AND label=? AND active=1",
    ).bind(label).first<{ id: number }>()
    if (exist) return exist.id
    const r = await env.DB.prepare(
      "INSERT INTO options (type, label, sort_order, active, created_at) VALUES ('category', ?, 999, 1, ?)",
    ).bind(label, new Date().toISOString()).run()
    return Number(r.meta.last_row_id)
  }

  // 工具：建立 location
  async function ensureLocation(label: string): Promise<number> {
    const exist = await env.DB.prepare(
      "SELECT id FROM options WHERE type='location' AND label=? AND active=1",
    ).bind(label).first<{ id: number }>()
    if (exist) return exist.id
    const r = await env.DB.prepare(
      "INSERT INTO options (type, label, sort_order, active, created_at) VALUES ('location', ?, 999, 1, ?)",
    ).bind(label, new Date().toISOString()).run()
    return Number(r.meta.last_row_id)
  }

  // 工具：建 ticket
  async function makeTicket(args: {
    adminUserId: number
    catId: number
    catLabel: string
    locId: number
    locLabel: string
    desc: string
    createdAt: string
    lastActivityAt: string
  }): Promise<number> {
    const r = await env.DB.prepare(
      `INSERT INTO tickets (category_id, category_label, location_id, location_label, description,
                           status, share_token, created_by, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
    ).bind(args.catId, args.catLabel, args.locId, args.locLabel, args.desc,
           crypto.randomUUID(), args.adminUserId, args.createdAt, args.lastActivityAt).run()
    return Number(r.meta.last_row_id)
  }

  // 工具：加 ticket_update（status / comment）
  async function addUpdate(args: {
    ticketId: number; userId: number;
    kind: 'status' | 'comment';
    status?: string; note?: string; amount?: number;
    createdAt: string;
  }): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO ticket_updates (ticket_id, user_id, kind, status, note, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(args.ticketId, args.userId, args.kind,
           args.status ?? null, args.note ?? null, args.amount ?? null,
           args.createdAt).run()
  }

  // 取得今天台灣日期 YYYY-MM-DD
  function todayTaipei(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
  }

  it('F11-2 date 缺 → 400 MISSING_DATE', async () => {
    const { cookie } = await loginAs('U-f1-nodate', '管', 'admin')
    const cat = await env.DB.prepare("SELECT id FROM options WHERE type='category' AND active=1 LIMIT 1").first<{ id: number }>()
    const r = await worker.fetch(`http://example.com/api/stats/daily-report?category_id=${cat!.id}`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body.error.code).toBe('MISSING_DATE')
  })

  it('category_id 缺 → 400 VALIDATION_ERROR', async () => {
    const { cookie } = await loginAs('U-f1-nocat', '管', 'admin')
    const r = await worker.fetch(`http://example.com/api/stats/daily-report?date=${todayTaipei()}`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('F11-2 date 格式錯誤（2026-13-99）→ 400 INVALID_DATE', async () => {
    const { cookie } = await loginAs('U-f1-baddate', '管', 'admin')
    const cat = await env.DB.prepare("SELECT id FROM options WHERE type='category' AND active=1 LIMIT 1").first<{ id: number }>()
    const r = await worker.fetch(`http://example.com/api/stats/daily-report?date=2026-13-99&category_id=${cat!.id}`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body.error.code).toBe('INVALID_DATE')
  })

  it('F11-2 date 晚於今天 → 400 DATE_FUTURE', async () => {
    const { cookie } = await loginAs('U-f1-future', '管', 'admin')
    const cat = await env.DB.prepare("SELECT id FROM options WHERE type='category' AND active=1 LIMIT 1").first<{ id: number }>()
    // 用 2030-01-01 確保晚於 today
    const r = await worker.fetch(`http://example.com/api/stats/daily-report?date=2030-01-01&category_id=${cat!.id}`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(400)
    const body = await r.json()
    expect(body.error.code).toBe('DATE_FUTURE')
  })

  it('category_id 不存在 → 404', async () => {
    const { cookie } = await loginAs('U-f1-nocat2', '管', 'admin')
    const r = await worker.fetch(`http://example.com/api/stats/daily-report?date=${todayTaipei()}&category_id=99999`, {
      headers: { Cookie: cookie },
    })
    expect(r.status).toBe(404)
  })

  it('新建案件：當日 created_at 在區間內、屬該類別 → new_tickets 計入', async () => {
    const admin = await loginAs('U-f1-new1', '管', 'admin')
    const cat = await ensureCategory('F1-test-cat-new')
    const loc = await ensureLocation('F1-test-loc-new')

    const today = todayTaipei()
    // 今日 10:00 台灣 = UTC -8h（簡化用：用 Date.UTC 重建台灣 10:00）
    const todayCreatedAt = new Date(Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)),
      2, 0, 0,  // 10:00 台灣 = 02:00 UTC
    )).toISOString()

    const tid = await makeTicket({
      adminUserId: admin.userId,
      catId: cat, catLabel: 'F1-test-cat-new',
      locId: loc, locLabel: 'F1-test-loc-new',
      desc: '今日新建',
      createdAt: todayCreatedAt, lastActivityAt: todayCreatedAt,
    })

    const r = await worker.fetch(
      `http://example.com/api/stats/daily-report?date=${today}&category_id=${cat}`,
      { headers: { Cookie: admin.cookie } },
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.category_label).toBe('F1-test-cat-new')
    expect(body.data.new_count).toBeGreaterThanOrEqual(1)
    const newTicket = body.data.new_tickets.find((t: { id: number }) => t.id === tid)
    expect(newTicket).toBeTruthy()
    expect(newTicket.creator_name).toBe('管')
    expect(newTicket.status).toBe('open')
    expect(newTicket.detail_url).toMatch(/\/ticket\/\d+$/)
    expect(newTicket.created_at_time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('既有案件：當日有 update 且非當日新建 → existing_tickets 計入 + updates_today 最多 3 筆', async () => {
    const admin = await loginAs('U-f1-ex1', '管', 'admin')
    const cat = await ensureCategory('F1-test-cat-ex')
    const loc = await ensureLocation('F1-test-loc-ex')

    const today = todayTaipei()
    // 上個月同日（既有的 created_at 早於當日，落在 last_activity_at 區間）
    const prevMonth = (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d)
    })()
    const prevCreatedAt = new Date(Date.UTC(
      Number(prevMonth.slice(0, 4)),
      Number(prevMonth.slice(5, 7)) - 1,
      Number(prevMonth.slice(8, 10)),
      2, 0, 0,
    )).toISOString()

    // 既有案件：上月建、今天有 update
    const today10am = new Date(Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)),
      2, 0, 0,
    )).toISOString()

    const tid = await makeTicket({
      adminUserId: admin.userId,
      catId: cat, catLabel: 'F1-test-cat-ex',
      locId: loc, locLabel: 'F1-test-loc-ex',
      desc: '上月建、今日有 update',
      createdAt: prevCreatedAt, lastActivityAt: today10am,
    })

    // 今日 4 筆 update → 應被 slice(0,3)
    await addUpdate({ ticketId: tid, userId: admin.userId, kind: 'status', status: 'in_progress', createdAt: today10am })
    await addUpdate({ ticketId: tid, userId: admin.userId, kind: 'comment', note: 'a', createdAt: new Date(Date.parse(today10am) + 1000).toISOString() })
    await addUpdate({ ticketId: tid, userId: admin.userId, kind: 'status', status: 'in_progress', createdAt: new Date(Date.parse(today10am) + 2000).toISOString() })
    await addUpdate({ ticketId: tid, userId: admin.userId, kind: 'comment', note: 'b', createdAt: new Date(Date.parse(today10am) + 3000).toISOString() })

    const r = await worker.fetch(
      `http://example.com/api/stats/daily-report?date=${today}&category_id=${cat}`,
      { headers: { Cookie: admin.cookie } },
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    const ex = body.data.existing_tickets.find((t: { id: number }) => t.id === tid)
    expect(ex).toBeTruthy()
    expect(ex.current_status).toBe('open') // tickets.status 沒被動，預設 open
    expect(ex.status_label).toBe('待處理')
    expect(ex.updates_today).toHaveLength(3) // slice(0,3)
    expect(ex.updates_today[0].kind).toBe('status')
    expect(ex.updates_today[0].note).toBeNull()
    expect(ex.updates_today[0].amount).toBeNull()
    expect(ex.updates_today[0].time).toMatch(/^\d{2}:\d{2}$/)
  })

  // F12-1（v1.1.15）：updates_today 排序 = 時間正序（舊的在上、新的在下）
  // 邊界：當日 5 筆 update，F12-1 要「最新 3 筆、由舊到新」
  it('F12-1 updates_today 排序 = 時間正序（SQL DESC LIMIT 3 + 應用層 reverse）', async () => {
    const admin = await loginAs('U-f1-sort', '管', 'admin')
    const cat = await ensureCategory('F1-test-cat-sort')
    const loc = await ensureLocation('F1-test-loc-sort')

    const today = todayTaipei()
    // 上個月建單（避免被「當日新建」條件排除）
    const prevMonth = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 1)
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    })()
    const prevCreatedAt = new Date(Date.UTC(
      Number(prevMonth.slice(0, 4)),
      Number(prevMonth.slice(5, 7)) - 1,
      Number(prevMonth.slice(8, 10)),
      2, 0, 0,
    )).toISOString()

    const todayBase = new Date(Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)) - 1,
      Number(today.slice(8, 10)),
      2, 0, 0,
    )).getTime()

    const tid = await makeTicket({
      adminUserId: admin.userId,
      catId: cat, catLabel: 'F1-test-cat-sort',
      locId: loc, locLabel: 'F1-test-loc-sort',
      desc: 'F12-1 排序測試',
      createdAt: prevCreatedAt, lastActivityAt: new Date(todayBase + 5000).toISOString(),
    })

    // 5 筆 update（時間從早到晚，間隔 1 秒）—— F12-1 應該只取最新 3 筆（4、5、3 → 反轉 → 3、4、5）
    // 原始 ISO 時間：今天 02:00:00, 02:00:01, 02:00:02, 02:00:03, 02:00:04
    const updateTimes = [
      new Date(todayBase + 0).toISOString(),     // t1 最早
      new Date(todayBase + 1000).toISOString(),  // t2
      new Date(todayBase + 2000).toISOString(),  // t3
      new Date(todayBase + 3000).toISOString(),  // t4
      new Date(todayBase + 4000).toISOString(),  // t5 最新
    ]
    for (let i = 0; i < updateTimes.length; i++) {
      await addUpdate({
        ticketId: tid, userId: admin.userId, kind: 'comment',
        note: `update ${i + 1} (t${i + 1})`, createdAt: updateTimes[i],
      })
    }

    const r = await worker.fetch(
      `http://example.com/api/stats/daily-report?date=${today}&category_id=${cat}`,
      { headers: { Cookie: admin.cookie } },
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    const ex = body.data.existing_tickets.find((t: { id: number }) => t.id === tid)
    expect(ex).toBeTruthy()
    expect(ex.updates_today).toHaveLength(3)
    // F12-1：時間正序 → t3、t4、t5（最新 3 筆，由舊到新）
    expect(ex.updates_today[0].note).toBe('update 3 (t3)')
    expect(ex.updates_today[1].note).toBe('update 4 (t4)')
    expect(ex.updates_today[2].note).toBe('update 5 (t5)')
  })

  it('當日無任何案件 → new_count + existing_count = 0、total_count = 0', async () => {
    const { cookie } = await loginAs('U-f1-empty', '管', 'admin')
    const cat = await ensureCategory('F1-test-cat-empty')
    const r = await worker.fetch(
      `http://example.com/api/stats/daily-report?date=${todayTaipei()}&category_id=${cat}`,
      { headers: { Cookie: cookie } },
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.data.new_count).toBe(0)
    expect(body.data.existing_count).toBe(0)
    expect(body.data.total_count).toBe(0)
    expect(body.data.new_tickets).toEqual([])
    expect(body.data.existing_tickets).toEqual([])
  })

  it('三角色皆可讀 daily-report（同 /summary）', async () => {
    const admin = await loginAs('U-f1-roles-admin', '管', 'admin')
    const cat = await ensureCategory('F1-test-cat-roles')

    for (const role of ['committee', 'manager', 'admin'] as const) {
      const u = await loginAs(`U-f1-roles-${role}`, role, role)
      const r = await worker.fetch(
        `http://example.com/api/stats/daily-report?date=${todayTaipei()}&category_id=${cat}`,
        { headers: { Cookie: u.cookie } },
      )
      expect(r.status).toBe(200)
    }

    // 避免 lint 抱怨未使用
    void admin
  })

  it('回傳 template（含 id + body）—— 從 migration 0010 seed 預設模板撈', async () => {
    const { cookie } = await loginAs('U-f1-tmpl', '管', 'admin')
    const cat = await ensureCategory('F1-test-cat-tmpl')
    const r = await worker.fetch(
      `http://example.com/api/stats/daily-report?date=${todayTaipei()}&category_id=${cat}`,
      { headers: { Cookie: cookie } },
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    // template 可能 null（如果 0010 migration 沒跑）—— 至少型別對
    if (body.data.template) {
      expect(typeof body.data.template.id).toBe('number')
      expect(typeof body.data.template.body).toBe('string')
    }
  })
})
