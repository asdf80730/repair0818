// functions/index.html.ts — 動態提供 root index.html，注入 commit SHA 作 cache-busting（v1.1.16）
// 問題：public/index.html 寫死 app.js?v=…，即便 _headers 對 /index.html 設 no-cache，
//      瀏覽器仍長快取舊版 app.js?v=1.1.15 → 每次部署後用戶端看不到新程式（「每次都忘改」的根因）。
// 解法：本 Function 在請求時把 ?v=<CF_PAGES_COMMIT_SHA> 寫進所有本機 asset，
//      讓每次部署產生唯一 URL、強制抓取最新版；舊快取副本留著不影響。index.html 本身 no-cache。
// ⚠ 若修改 public/index.html 的結構（增減 script/link），請同步調整此處模板底部。
//
// 注意：Function 回傳不會套用 public/_headers，故下列安全標頭需自行補齊
//      （與 _headers 對 /index.html、/* 的設定保持一致；主站原本無 CSP）。

interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  LINE_CHANNEL_ID: string
  JWT_SECRET: string
}

// Pages 整合部署時由平台注入；本機 wrangler pages dev 取 'dev'（開發環境快取無所謂）
const VERSION = (process.env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 12)

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>社區修繕系統</title>
  <link rel="stylesheet" href="/style.css?v=${VERSION}">
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
  <script src="/vendor/liff-mock.js?v=${VERSION}"></script>
  <!-- browser-image-compression（vendored，§1.2） -->
  <script src="/vendor/browser-image-compression.js?v=${VERSION}"></script>
  <!-- F8（v1.1.15）訊息模板渲染引擎（純函式）——必須在 app.js 之前載入 -->
  <script src="/templateEngine.js?v=${VERSION}"></script>
  <!-- 主系統邏輯 -->
  <script src="/app.js?v=${VERSION}"></script>
</body>
</html>`

export const onRequest: PagesFunction<Env> = async () => {
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
