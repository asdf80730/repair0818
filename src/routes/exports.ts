// src/routes/exports.ts — CSV 匯出（§4.8，D3）
// 註冊於全域 requireAuth() 之上；端點內雙軌自驗（軌A Cookie / 軌B 簽名）
// 僅 POST /sign 走標準 Cookie＋CSRF 流程（掛在 requireAuth 之下）

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { ok, fail } from '../lib/respond'
import { requireAuth, resolveUser } from '../lib/auth'
import { exportQuerySchema } from '../lib/validate'
import { toTaipeiDisplay, taipeiDate } from '../lib/time'
import type { AppContext, Env } from '../lib/env'

export const exportRoutes = new Hono<Env>()

const SIGN_PREFIX = 'export:v1|'
const SIGN_TTL_SEC = 300 // 5 分鐘

/** 計算 CSV 下載簽名（domain separation，§4.8） */
export async function signExportUrl(
  secret: string,
  uid: number,
  exp: number,
  status: string,
  from: string,
  to: string,
): Promise<string> {
  const msg = [uid, exp, status || '', from || '', to || ''].join('|')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(SIGN_PREFIX + msg))
  return base64url(new Uint8Array(sig))
}

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** timing-safe 字串比對 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// POST /api/exports/sign — manager/admin，標準 Cookie＋CSRF（§4.8）
exportRoutes.post('/sign', requireAuth({ roles: ['manager', 'admin'] }), zValidator('json', exportQuerySchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json') as z.infer<typeof exportQuerySchema>
  const { status = '', from = '', to = '' } = body
  const exp = Math.floor(Date.now() / 1000) + SIGN_TTL_SEC
  const sig = await signExportUrl(c.env.JWT_SECRET, user.id, exp, status, from, to)
  const qs = new URLSearchParams({ uid: String(user.id), exp: String(exp) })
  if (status) qs.set('status', status)
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  qs.set('sig', sig)
  return ok(c, { url: `/api/exports/tickets.csv?${qs.toString()}` })
})

// GET /api/exports/tickets.csv — 註冊於全域 requireAuth() 之上，端點內雙軌自驗（§4.8）
export async function csvDownload(c: AppContext) {
  // 軌 A：有效 session 且 role 為 manager/admin
  const user = await resolveUser(c)
  if (user && (user.role === 'manager' || user.role === 'admin')) {
    return buildCsv(c, user.id)
  }

  // 軌 B：驗 uid/exp/sig
  const uid = Number(c.req.query('uid'))
  const exp = Number(c.req.query('exp'))
  const sig = c.req.query('sig') ?? ''
  const status = c.req.query('status') ?? ''
  const from = c.req.query('from') ?? ''
  const to = c.req.query('to') ?? ''

  if (!uid || !exp || !sig) {
    return fail(c, 401, 'UNAUTHORIZED', '簽名錯誤')
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    // 過期：偵測 Accept: text/html 回極簡 HTML 頁，API 呼叫仍回 JSON（§4.8）
    const accept = c.req.header('Accept') ?? ''
    if (accept.includes('text/html')) {
      return c.html(
        '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:3em">下載連結已過期，請回系統重新匯出。</body>',
        401,
      )
    }
    return fail(c, 401, 'EXPORT_LINK_EXPIRED', '下載連結已過期')
  }
  const expected = await signExportUrl(c.env.JWT_SECRET, uid, exp, status, from, to)
  if (!timingSafeEqual(sig, expected)) {
    return fail(c, 401, 'UNAUTHORIZED', '簽名錯誤')
  }
  // uid 對應使用者須存在、active=1、role 為 manager/admin
  const row = await c.env.DB.prepare(
    'SELECT id, role, active FROM users WHERE id = ?',
  ).bind(uid).first<{ id: number; role: string; active: number }>()
  if (!row || row.active !== 1 || (row.role !== 'manager' && row.role !== 'admin')) {
    return fail(c, 401, 'UNAUTHORIZED', '簽名錯誤')
  }
  return buildCsv(c, uid)
}

/** 產生 CSV（§4.8 內容規格） */
async function buildCsv(c: AppContext, uid: number) {
  const status = c.req.query('status') ?? ''
  const from = c.req.query('from') ?? ''
  const to = c.req.query('to') ?? ''

  let sql = `SELECT t.id, t.category_label, t.location_label, t.description, t.status,
                    v.name AS vendor_name, u.display_name AS creator,
                    t.created_at, t.last_activity_at, t.closed_at,
                    (SELECT COUNT(*) FROM ticket_updates u
                     WHERE u.ticket_id = t.id AND u.kind = 'status') AS update_count
             FROM tickets t
             LEFT JOIN vendors v ON v.id = t.vendor_id
             LEFT JOIN users u ON u.id = t.created_by
             WHERE 1=1`
  const binds: unknown[] = []
  if (status && status !== 'all' && status !== 'active') {
    sql += ' AND t.status = ?'
    binds.push(status)
  } else if (status === 'active') {
    sql += " AND t.status IN ('open','in_progress')"
  }
  if (from) { sql += ' AND t.created_at >= ?'; binds.push(new Date(from + 'T00:00:00+08:00').toISOString()) }
  if (to) { sql += ' AND t.created_at < ?'; binds.push(new Date(to + 'T23:59:59.999+08:00').toISOString()) }
  sql += ' ORDER BY t.id'

  const rows = await c.env.DB.prepare(sql).bind(...binds).all<{
    id: number; category_label: string; location_label: string; description: string | null
    status: string; vendor_name: string | null; creator: string | null
    created_at: string; last_activity_at: string; closed_at: string | null; update_count: number
  }>()
  const rowList = rows.results

  const header = ['單號', '類別', '地點', '說明', '狀態', '廠商', '建立人', '建立時間', '最後活動', '結案時間', '回報次數']
  const lines = [header.map(csvCell).join(',')]
  for (const r of rowList) {
    lines.push([
      '#' + String(r.id).padStart(4, '0'),
      r.category_label,
      r.location_label,
      r.description ?? '',
      r.status,
      r.vendor_name ?? '',
      r.creator ?? '',
      toTaipeiDisplay(r.created_at),
      toTaipeiDisplay(r.last_activity_at),
      r.closed_at ? toTaipeiDisplay(r.closed_at) : '',
      String(r.update_count ?? 0),
    ].map(csvCell).join(','))
  }

  const body = '\uFEFF' + lines.join('\r\n') // UTF-8 with BOM（§4.8）
  const filename = `repair-tickets-${taipeiDate()}.csv`
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}

/** CSV 儲存格：injection 防護 + quoting（§4.8） */
function csvCell(value: string): string {
  let v = value
  // CSV injection 防護：以 = + - @ \t \r 開頭前綴 '
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v
  // Quoting：含 , " \n \r → 整欄雙引號包住；欄內 " → ""
  if (/[,"\n\r]/.test(v)) {
    v = '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}
