// src/lib/csrf.ts — CSRF 防護（§3.3）
// Cookie 改用 SameSite=Lax 後的必要措施：
//  - 所有 mutation（POST/PATCH/DELETE）必須帶自訂 header X-Requested-With: fetch
//  - Sec-Fetch-Site 有送且為 cross-site → 拒絕；沒送 → 僅驗 X-Requested-With（相容舊 WebView）
//  - mutation 只接受 Content-Type: application/json（照片上傳 multipart 除外，同樣驗 header）
//  - 不開放 CORS

import { createMiddleware } from 'hono/factory'
import { fail } from './respond'
import type { Env } from './env'

const MUTATION = new Set(['POST', 'PATCH', 'DELETE', 'PUT'])

export function csrfGuard() {
  return createMiddleware<Env>(async (c, next) => {
    const method = c.req.method

    // GET/HEAD 直接放行
    if (!MUTATION.has(method)) {
      await next()
      return
    }

    // 1. 必帶 X-Requested-With: fetch
    const xrw = c.req.header('X-Requested-With')
    if (xrw !== 'fetch') {
      return fail(c, 403, 'FORBIDDEN', '缺少 CSRF 標頭')
    }

    // 2. Sec-Fetch-Site：有送且為 cross-site → 拒絕；沒送 → 放行（僅驗 X-Requested-With）
    const secFetchSite = c.req.header('Sec-Fetch-Site')
    if (secFetchSite && secFetchSite === 'cross-site') {
      return fail(c, 403, 'FORBIDDEN', '跨站請求被拒絕')
    }

    // 3. mutation 只接受 application/json（multipart 照片上傳除外）
    //    無 body（Content-Length 為 0 或缺）的請求不需 Content-Type（A2：share-token、logout）
    const contentType = c.req.header('Content-Type') ?? ''
    const contentLength = c.req.header('Content-Length')
    const hasBody = contentLength !== undefined && contentLength !== '0'
    const isMultipart = contentType.startsWith('multipart/form-data')
    if (hasBody && !isMultipart && !contentType.startsWith('application/json')) {
      return fail(c, 403, 'FORBIDDEN', '不支援的 Content-Type')
    }

    await next()
  })
}
