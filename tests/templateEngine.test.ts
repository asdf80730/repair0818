// tests/templateEngine.test.ts — F8 訊息模板渲染引擎單元測試（v1.1.15）
// templateEngine 是純函式，無 DOM/workerd 依賴。
// vitest-pool-workers 跑在 workerd，無法 import public/*.js，
// 改用 readFileSync（workerd 支援 minimal node:fs）— 若不行則改 eval 字串。
import { SELF, env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 動態載入 templateEngine.js 到 globalThis.templateEngine
async function loadEngine() {
  if ((globalThis as any).templateEngine) return (globalThis as any).templateEngine
  const src = readFileSync(join(import.meta.dirname, '..', 'public', 'templateEngine.js'), 'utf-8')
  // eslint-disable-next-line no-new-func
  new Function(src)() // 在當前 globalThis 執行 IIFE
  return (globalThis as any).templateEngine
}

describe('F8 模板渲染引擎', () => {
  it('簡單變數替換', async () => {
    const e = await loadEngine()
    const out = e.render('Hello {{name}}, date={{date}}', { name: 'World', date: '2026-08-23' })
    expect(out).toBe('Hello World, date=2026-08-23')
  })

  it('缺值保留 {{key}} 字面', async () => {
    const e = await loadEngine()
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (msg: string) => warnings.push(msg)
    try {
      const out = e.render('A={{a}} B={{b}}', { a: '1' })
      expect(out).toBe('A=1 B={{b}}')
      expect(warnings.some((w) => w.includes('{{b}}') || w.includes('變數 b'))).toBe(true)
    } finally {
      console.warn = origWarn
    }
  })

  it('each 區段展開（陣列非空）', async () => {
    const e = await loadEngine()
    const tpl = '{{#each items}}\n{{序}}. {{name}}\n{{/each}}'
    const out = e.render(tpl, { items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] })
    expect(out).toBe('\n1. A\n2. B\n3. C\n')
  })

  it('each 區段空陣列不渲染', async () => {
    const e = await loadEngine()
    const tpl = '前\n{{#each items}}\n{{序}}. {{name}}\n{{/each}}後'
    const out = e.render(tpl, { items: [] })
    expect(out).toBe('前\n後')
  })

  it('巢狀 each 展開', async () => {
    const e = await loadEngine()
    const tpl = '{{#each outer}}{{序}}. {{name}}: {{#each inner}}({{序}}/{{inner序}}-{{val}}){{/each}}\n{{/each}}'
    const out = e.render(tpl, {
      outer: [
        { name: 'A', inner: [{ val: 'x' }, { val: 'y' }] },
        { name: 'B', inner: [{ val: 'z' }] },
      ],
    })
    expect(out).toContain('1. A: (1/1-x)(1/2-y)')
    expect(out).toContain('2. B: (2/1-z)')
  })

  it('自動變數 created_at_time（ISO → HH:MM 台灣時區）', async () => {
    const e = await loadEngine()
    const tpl = '{{#each rows}}{{序}} {{created_at_time}}{{/each}}'
    const out = e.render(tpl, { rows: [{ created_at: '2026-08-23T10:30:00.000Z' }] })
    // 10:30 UTC = 18:30 台灣
    expect(out).toContain('18:30')
  })

  it('自動變數 note_or_status（comment 用 note，其他用狀態）', async () => {
    const e = await loadEngine()
    const tpl1 = '{{#each rows}}{{序}}. {{note_or_status}}\n{{/each}}'
    const out1 = e.render(tpl1, {
      rows: [
        { kind: 'comment', note: '請加快' },
        { kind: 'status', status: 'done', status_label: '已完成' },
      ],
    })
    expect(out1).toContain('1. 請加快')
    expect(out1).toContain('2. 狀態：已完成')
  })

  it('自動變數 amount_text', async () => {
    const e = await loadEngine()
    const tpl = '{{#each rows}}{{序}}. {{amount_text}}\n{{/each}}'
    const out = e.render(tpl, { rows: [{ amount: 5000 }, { amount: 0 }, { amount: null }] })
    expect(out).toContain('1. （$5,000）')
    expect(out).toContain('2. ')
    expect(out).toContain('3. ')
  })

  it('多行模板（含 \\n）正確保留換行', async () => {
    const e = await loadEngine()
    const tpl = '{{#each updates_today}}\n   {{time}} {{actor_name}}\n{{/each}}'
    const out = e.render(tpl, {
      updates_today: [
        { time: '10:23', actor_name: '王小明' },
        { time: '14:00', actor_name: '李大' },
      ],
    })
    expect(out).toBe('\n   10:23 王小明\n\n   14:00 李大\n')
  })

  it('完整 daily-report 模板（snapshot 測試）', async () => {
    const e = await loadEngine()
    const tpl = '📅 {{date}} {{category_label}}（{{total_count}} 件）\n{{#each new_tickets}}{{序}}. {{title}}\n{{/each}}{{#each existing_tickets}}{{序}}. {{title}} → {{status_label}}\n{{/each}}'
    const out = e.render(tpl, {
      date: '2026-08-23',
      category_label: '水電',
      total_count: 3,
      new_tickets: [{ title: '水電－頂樓 #0007' }, { title: '水電－大廳 #0008' }],
      existing_tickets: [{ title: '水電－梯廳 #0003', status_label: '已發包' }],
    })
    expect(out).toBe('📅 2026-08-23 水電（3 件）\n1. 水電－頂樓 #0007\n2. 水電－大廳 #0008\n1. 水電－梯廳 #0003 → 已發包\n')
  })

  it('空模板回空字串', async () => {
    const e = await loadEngine()
    expect(e.render('', { a: 1 })).toBe('')
  })

  it('null/undefined 模板回空字串', async () => {
    const e = await loadEngine()
    expect(e.render(null as any, {})).toBe('')
    expect(e.render(undefined as any, {})).toBe('')
  })
})
