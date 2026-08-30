// functions/index.html.ts — 路徑 /index.html（v1.1.19 改為薄入口）
//
// 實際產出邏輯抽到 functions/lib/dynamic-index.ts（與根路徑 functions/index.ts 共用），
// 避免兩份 HTML 模板各改各的。修改 HTML 結構時改 lib/dynamic-index.ts 即可。

import { serveDynamicIndex, type Env } from './lib/dynamic-index'

export const onRequest: PagesFunction<Env> = async ({ env }) =>
  serveDynamicIndex(env)
