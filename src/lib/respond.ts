// src/lib/respond.ts — 統一回應信封（§4.0）
// 成功：{ ok: true, data }
// 失敗：{ ok: false, error: { code, message } }

import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** 成功回應 */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true, data }, status)
}

/** 失敗回應 */
export function fail(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  return c.json({ ok: false, error: { code, message } }, status)
}

/** 常用錯誤速記 */
export const errors = {
  validation: (c: Context, message: string) =>
    fail(c, 400, 'VALIDATION_ERROR', message),
  unauthorized: (c: Context, message = '請重新登入') =>
    fail(c, 401, 'UNAUTHORIZED', message),
  forbidden: (c: Context, message = '權限不足') =>
    fail(c, 403, 'FORBIDDEN', message),
  notFound: (c: Context, message = '資源不存在') =>
    fail(c, 404, 'NOT_FOUND', message),
  internal: (c: Context, message = '伺服器錯誤') =>
    fail(c, 500, 'INTERNAL', message),
}
