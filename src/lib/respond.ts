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
