// src/app.ts — app 組裝與 middleware 掛載（§1.3）
// ⚠ middleware 掛載順序即安全邊界，勿更動
// 掛載規則（硬性）：
//  1. 可能在無 Cookie 或 pending 狀態被呼叫的端點，一律註冊於全域 requireAuth() 之上，並在端點內自驗
//  2. 全域 requireAuth() 之上的路由必須自己完成權限驗證
//  3. 角色限制在路由模組內以 requireAuth({ roles }) 逐群掛載

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { csrfGuard } from './lib/csrf'
import { requireAuth } from './lib/auth'
import { exportQuerySchema } from './lib/validate'
import { shareRoutes } from './routes/share'
import { csvDownload } from './routes/exports'
import { authRoutes } from './routes/auth'
import { ticketRoutes } from './routes/tickets'
import { photoRoutes } from './routes/photos'
import { optionRoutes } from './routes/options'
import { vendorRoutes } from './routes/vendors'
import { userRoutes } from './routes/users'
import { statsRoutes } from './routes/stats'
import { exportRoutes } from './routes/exports'
import type { Env } from './lib/env'

export const app = new Hono<Env>().basePath('/api')

// C2：全域錯誤處理器——統一回 500，不洩堆疊/DB 錯誤碼
// C3：env 未設時回明確提示（不 throw 到用戶端）
app.onError((err, c) => {
  const env = c.env
  if (!env?.JWT_SECRET || !env?.LINE_CHANNEL_ID) {
    return c.json({ ok: false, error: { code: 'INTERNAL', message: '伺服器環境變數未設定' } }, 500)
  }
  console.error(err)
  return c.json({ ok: false, error: { code: 'INTERNAL', message: '伺服器錯誤' } }, 500)
})

app.route('/share', shareRoutes)              // 公開唯讀：無 auth、無 csrf
// E6：csv 端點掛 zValidator 驗證 query（status/from/to 格式），非法格式回 400 而非繞過
app.get('/exports/tickets.csv', zValidator('query', exportQuerySchema), csvDownload)
app.get('/hello', (c) => c.json({ ok: true, data: 'hello' })) // M1 部署打通驗證
app.use('/*', csrfGuard())                      // 所有 mutation 驗 CSRF（GET/HEAD 直接放行）
app.route('/auth', authRoutes)   // session 不需登入；me / logout 內部各自掛 requireAuth({ allowPending: true })
app.use('/*', requireAuth())     // ⚠ 以下全部需已開通；此行之上的路由必須自驗權限
app.route('/tickets', ticketRoutes)
app.route('/photos', photoRoutes)
app.route('/options', optionRoutes)
app.route('/vendors', vendorRoutes)
app.route('/users', userRoutes)
app.route('/stats', statsRoutes)
app.route('/exports', exportRoutes)  // 僅 POST /sign（走標準 Cookie＋CSRF 流程）
