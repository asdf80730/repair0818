// tests/share-html.test.ts — v1.1.12 分享頁動態標題 + og 標籤測試（§5.8）
// share.html.ts 是 Pages Function（不在 Hono app 內），直接 import onRequest 並 mock env.DB。
// 驗證：通訊軟體分享卡片抓的 <title>/og:title 是「{類別}－{地點} #{id}」而非「載入中…」。
import { describe, it, expect } from 'vitest'
import { onRequest } from '../functions/share.html.ts'

// 最小 D1 mock：只實作 prepare().bind().first()
function mockDB(row: { id: number; category_label: string; location_label: string } | null) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
      }),
    }),
  } as unknown as D1Database
}

function callShare(token: string, row: { id: number; category_label: string; location_label: string } | null) {
  const request = new Request(`https://example.com/share.html?token=${token}`)
  const env = { DB: mockDB(row) } as unknown as { DB: D1Database }
  return onRequest({ request, env } as any)
}

describe('v1.1.12 分享頁動態標題 + og 標籤（§5.8）', () => {
  it('有效 token → <title> 與 og:title 為「{類別}－{地點} #{id}」', async () => {
    const res = await callShare(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      { id: 7, category_label: '水電', location_label: '頂樓' },
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<title>水電－頂樓 #0007</title>')
    expect(html).toContain('property="og:title" content="水電－頂樓 #0007"')
    expect(html).toContain('property="og:description" content="社區修繕派工單"')
    expect(html).toContain('name="description" content="社區修繕派工單"')
  })

  it('有效 token 但查無案件 → 回退「派工單」', async () => {
    const res = await callShare('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', null)
    const html = await res.text()
    expect(html).toContain('<title>派工單</title>')
    expect(html).toContain('property="og:title" content="派工單"')
  })

  it('非 UUID token → 不查 DB，回退「派工單」', async () => {
    const res = await callShare('not-a-uuid', null)
    const html = await res.text()
    expect(html).toContain('<title>派工單</title>')
  })

  it('類別/地點含特殊字元 → HTML escape 防 XSS', async () => {
    const res = await callShare(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      { id: 1, category_label: '<script>', location_label: 'A"B' },
    )
    const html = await res.text()
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('A&quot;B')
  })

  it('回傳含 CSP / no-cache 標頭（分享頁快取顯示）', async () => {
    const res = await callShare('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', null)
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})
