// functions/share.html.ts — 動態渲染派工單頁（v1.1.12）
// 讓通訊軟體分享連結時，卡片標題顯示「案件標題」而非寫死的「派工單」
// 原理：通訊軟體在分享瞬間抓取 /share.html 的 <title>；故 server 端先讀 token 查 D1，
//       把 <title> 組成「{類別}－{地點} #{id}」再回傳 HTML。
// 安全：只取 category_label/location_label（公開白名單欄位，見 §4.5），並做 HTML escape 防 XSS。

interface Env {
  DB: D1Database
  PHOTOS: R2Bucket
  LINE_CHANNEL_ID: string
  JWT_SECRET: string
}

// 防 XSS：選項 label 屬使用者內容，進 HTML 前需 escape
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const token = url.searchParams.get('token') || ''

  let title = '派工單'
  // 只接受標準 UUID 格式（與 §4.5 share 端點一致，防掃描）
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRe.test(token)) {
    const row = await env.DB.prepare(
      'SELECT id, category_label, location_label FROM tickets WHERE share_token = ?',
    ).bind(token).first<{ id: number; category_label: string; location_label: string }>()
    if (row) {
      title = `${row.category_label}－${row.location_label} #${String(row.id).padStart(4, '0')}`
    }
  }

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <!-- v1.1.12：og 標籤讓通訊軟體分享卡片顯示案件標題＋有意義描述（而非「載入中…」） -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="社區修繕派工單">
  <meta name="description" content="社區修繕派工單">
  <link rel="stylesheet" href="/style.css?v=1.1.13">
</head>
<body>
  <div id="share-app">
    <p class="loading">載入中…</p>
  </div>
  <script src="/share.js?v=1.1.13"></script>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 與原本 _headers 對 /share.html 的 CSP 規則一致（function 回傳不會套用 _headers）
      'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'no-cache',
    },
  })
}
