// functions/lib/dynamic-index.ts — 動態 index.html 的共用產出（v1.1.19）
// 同時供 functions/index.ts（根路徑 /）與 functions/index.html.ts（/index.html）呼叫，
// 避免兩份 HTML 模板各改各的。
//
// 問題：public/index.html 寫死 app.js?v=…，即便 _headers 對 /index.html 設 no-cache，
//      瀏覽器仍長快取舊版 app.js → 每次部署後用戶端看不到新程式（「每次都忘改」的根因）。
// 解法：本模組在請求時把 ?v=<CF_PAGES_COMMIT_SHA> 寫進所有本機 asset，
//      讓每次部署產生唯一 URL、強制抓取最新版；舊快取副本留著不影響。
//
// 注意：Function 回傳不會套用 public/_headers，故下列安全標頭需自行補齊
//      （與 _headers 對 /index.html、/* 的設定保持一致；主站原本無 CSP）。
//
// ⚠ CF_PAGES_COMMIT_SHA 必須在「執行時」從 Env 讀（Pages runtime 於建構時注入）。
//    不能在 module top-level 用 process.env.CF_PAGES_COMMIT_SHA——Cloudflare Worker 沒有 Node `process`，
//    top-level 求值會立即拋 ReferenceError: process is not defined，導致整支 Function 發布失敗。

export interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  LINE_CHANNEL_ID: string
  JWT_SECRET: string
  CF_PAGES_COMMIT_SHA?: string // Pages 部署注入；optional（dev 環境無此變數 → fallback 'dev'）
}

export function serveDynamicIndex(env: Env): Response {
  // 執行時從 Env 讀 SHA（dev 環境無此變數 → fallback 'dev'）
  const version = (env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 12)

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>社區修繕系統</title>
  <link rel="stylesheet" href="/style.css?v=${version}">
</head>
<body>
  <div id="app">
    <!-- hash router 掛載點 -->
    <div id="page"></div>
  </div>
  <!-- 底部導覽 -->
  <nav id="nav"></nav>

  <!-- LIFF SDK（LINE 官方 CDN，平台 SDK） -->
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <!-- liff-mock（測試用，僅 ?mock=true 時啟用，§1.2 vendored） -->
  <script src="/vendor/liff-mock.js?v=${version}"></script>
  <!-- browser-image-compression（vendored，§1.2） -->
  <script src="/vendor/browser-image-compression.js?v=${version}"></script>
  <!-- heic2any（vendored，§1.2；v1.1.23 HEIC/HEIF → JPEG，需先於 app.js） -->
  <script src="/vendor/heic2any.js?v=${version}"></script>
  <!-- F8（v1.1.15）訊息模板渲染引擎（純函式）——必須在 app.js 之前載入 -->
  <script src="/templateEngine.js?v=${version}"></script>
  <!-- 主系統邏輯 -->
  <script src="/app.js?v=${version}"></script>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 與 public/_headers 對 /index.html、/* 的設定保持一致
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
