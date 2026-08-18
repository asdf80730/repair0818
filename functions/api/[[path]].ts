// functions/api/[[path]].ts —— 整支檔案就這三行（§1.3）
import { handle } from 'hono/cloudflare-pages'
import { app } from '../../src/app'
export const onRequest = handle(app)
