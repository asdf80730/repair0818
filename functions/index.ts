// functions/index.ts — 網站根路徑 /（v1.1.19 修正）
//
// ⚠ 為什麼有這支：CF Pages 依「檔案路由」把 functions/index.html.ts 對應到「/index.html」路徑，
//    而「網站根 /」對應的檔案是 functions/index.ts。先前只有 index.html.ts，根路徑 / 永遠回
//    public/index.html 的靜態舊版（寫死 ?v=1.1.14/1.1.15），cache-busting 完全沒生效。
//    此入口讓根路徑 / 也走動態 cache-busting（與 /index.html 行為一致）。
//
// 注意：根路徑要真正被本 Function 攔截，public/_routes.json 的 include 必須含 "/"
//       （純靜態預設是 fail-open 會攔到，但本專案 _routes.json 用 include 白名單，需顯式列出）。

import { serveDynamicIndex, type Env } from './lib/dynamic-index'

export const onRequest: PagesFunction<Env> = async ({ env }) =>
  serveDynamicIndex(env)
