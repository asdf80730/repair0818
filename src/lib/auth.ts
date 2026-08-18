// src/lib/auth.ts — 認證（§3.2 定案介面）
// 純函式 resolveUser() + middleware requireAuth()
// JWT 以 jose（Web Crypto 原生）簽驗，HMAC-SHA256，效期 60 分鐘
// payload 只放 { sub: user_id }，不放 role（每請求從 D1 讀 role/active，禁止只信 JWT）

import { SignJWT, jwtVerify } from 'jose'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { fail } from './respond'
import type { AppContext, Env, Role, User } from './env'

const SESSION_COOKIE = 'session'
const SESSION_TTL_SEC = 3600 // 60 分鐘

export type ResolveResult =
  | { user: User }
  | { user: null; reason: 'no-jwt' | 'bad-jwt' | 'disabled' | 'not-found' }

/** 從 Cookie 取 JWT secret 的 Web Crypto key（HMAC-SHA256） */
async function secretKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** 簽發 session JWT（payload 只放 sub = user_id） */
export async function signSessionJWT(
  user: Pick<User, 'id'>,
  secret: string,
): Promise<string> {
  const key = await secretKey(secret)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SEC)
    .sign(key)
}

/**
 * 純函式：解析 Cookie、驗 JWT、查 D1，回傳 user 或 null（不拋錯、不寫回應）。
 * 透過 reason 讓 middleware 層可區分 401 / 403 DISABLED。
 */
export async function resolveUser(c: AppContext): Promise<ResolveResult> {
  // 1. 從 Cookie 取 session JWT；無 Cookie → null
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return { user: null, reason: 'no-jwt' }

  const secret = c.env.JWT_SECRET

  // 2. jose 驗簽＋效期 → 失敗回 null
  let payload: { sub?: string }
  try {
    const key = await secretKey(secret)
    const { payload: p } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    })
    payload = p
  } catch {
    return { user: null, reason: 'bad-jwt' }
  }
  if (!payload.sub) return { user: null, reason: 'bad-jwt' }

  // 3. 從 D1 查 user
  const row = await c.env.DB.prepare(
    'SELECT id, role, active FROM users WHERE id = ?',
  )
    .bind(Number(payload.sub))
    .first<{ id: number; role: Role; active: number }>()

  // 4. 查無此人或 active = 0 → null
  if (!row) return { user: null, reason: 'not-found' }
  if (row.active === 0) return { user: null, reason: 'disabled' }

  // 5. 回 user
  return { user: { id: row.id, role: row.role } }
}

export function requireAuth(opts: {
  roles?: Array<Role>
  allowPending?: boolean
} = {}) {
  return createMiddleware<Env>(async (c, next) => {
    const res = await resolveUser(c)
    if (!res.user) {
      // JWT 有效但 active=0 → 403 DISABLED（§3.2）
      if (res.reason === 'disabled') {
        return fail(c, 403, 'DISABLED', '帳號已停用，請洽管理員')
      }
      return fail(c, 401, 'UNAUTHORIZED', '請重新登入')
    }
    const { user } = res
    if (user.role === 'pending' && !opts.allowPending) {
      return fail(c, 403, 'PENDING', '帳號等待開通中')
    }
    if (
      opts.roles &&
      user.role !== 'admin' && // admin 視為萬能，與權限矩陣一致
      !opts.roles.includes(user.role)
    ) {
      return fail(c, 403, 'FORBIDDEN', '權限不足')
    }
    c.set('user', user)
    await next()
  })
}

/** 設定 session Cookie（§3.1） */
export function setSessionCookie(c: AppContext, jwt: string) {
  setCookie(c, SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SEC,
  })
}

/** 清除 session Cookie（§3.5 logout） */
export function clearSessionCookie(c: AppContext) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}
