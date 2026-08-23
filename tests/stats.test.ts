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
