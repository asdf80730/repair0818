// src/lib/respond.ts — 統一回應信封（§4.0）
// 成功：{ ok: true, data }
// 失敗：{ ok: false, error: { code, message } }
// zod 驗證失敗：經 hook 也走同一信封（code=VALIDATION_ERROR）

import type { Context, ValidationTargets } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ZodSchema } from 'zod'
import { zValidator } from '@hono/zod-validator'

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

type ValidationResult = {
  success: boolean
  error?: { issues?: Array<{ message?: string }> }
}

/** zod 驗證失敗 → 統一 400 信封（與 fail() 同形；§4.0 單一信封） */
function unifiedValidation(result: ValidationResult, c: Context): Response | void {
  if (result.success) return
  const message = result.error?.issues?.[0]?.message ?? '欄位驗證失敗'
  return c.json({ ok: false, error: { code: 'VALIDATION_ERROR', message } }, 400)
}

/** zValidator + 統一 400 信封（取代直接 import 的 zValidator，全項目共用） */
export function zv<T extends ZodSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, unifiedValidation as never)
}
