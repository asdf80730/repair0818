// src/lib/templateEngine.ts — 訊息模板渲染引擎（F8 v1.1.15，純函式）
// 變數替換 + {{#each array}}...{{/each}} 迴圈（含巢狀）
// 不做 if/else 條件；不做 HTML escape（訊息是純文字，LINE 端自動處理）
// 缺值保留 {{key}} 字面並 console.warn，方便使用者發現漏變數
//
// 與 public/templateEngine.js 同源：兩份檔案需同步維護（ESM 給 vitest 測試，
// IIFE 給瀏覽器載入）。任何邏輯變更必須同步兩處。

export interface RenderContext {
  date?: string
  category_label?: string
  total_count?: number | string
  new_count?: number
  existing_count?: number
  new_tickets?: any[]
  existing_tickets?: any[]
  [key: string]: any
}

interface EachFrame {
  item: any
  index: number
}

function lookupRaw(key: string, ctx: any, eachStack: EachFrame[]): any {
  if (ctx && Object.prototype.hasOwnProperty.call(ctx, key)) return ctx[key]
  for (let i = eachStack.length - 1; i >= 0; i--) {
    const item = eachStack[i].item
    if (item && Object.prototype.hasOwnProperty.call(item, key)) return item[key]
  }
  return undefined
}

function isoToHHMM(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso))
  } catch (_) {
    return ''
  }
}

function lookup(key: string, ctx: any, eachStack: EachFrame[]): any {
  if (key === '序') {
    if (eachStack.length > 0) return eachStack[eachStack.length - 1].index
    return ''
  }
  if (key === 'created_at_time') {
    const iso = lookupRaw('created_at', ctx, eachStack)
    if (!iso) return ''
    return isoToHHMM(iso)
  }
  if (key === 'note_or_status') {
    const kind = lookupRaw('kind', ctx, eachStack)
    if (kind === 'comment') return lookupRaw('note', ctx, eachStack) || ''
    const statusLabel = lookupRaw('status_label', ctx, eachStack) || lookupRaw('status', ctx, eachStack) || ''
    return `狀態：${statusLabel}`
  }
  if (key === 'amount_text') {
    const amount = lookupRaw('amount', ctx, eachStack)
    if (amount === null || amount === undefined || amount === 0) return ''
    return `（$${Number(amount).toLocaleString('en-US')}）`
  }
  return lookupRaw(key, ctx, eachStack)
}

function findMatchingEnd(text: string, from: number): number {
  let depth = 1
  let i = from
  while (i < text.length) {
    const openIdx = text.indexOf('{{#each ', i)
    const closeIdx = text.indexOf('{{/each}}', i)
    if (closeIdx < 0) return -1
    if (openIdx >= 0 && openIdx < closeIdx) {
      // 內層又是 each → depth++
      depth++
      const innerEnd = text.indexOf('}}', openIdx + '{{#each '.length)
      i = (innerEnd >= 0 ? innerEnd : openIdx) + 2
      continue
    }
    depth--
    if (depth === 0) return closeIdx
    i = closeIdx + '{{/each}}'.length
  }
  return -1
}

function replaceVars(text: string, ctx: any, eachStack: EachFrame[]): string {
  return text.replace(/\{\{([^#/][^}]*?)\}\}/g, (m, key) => {
    const k = key.trim()
    const v = lookup(k, ctx, eachStack)
    if (v === undefined || v === null) {
      console.warn(`[templateEngine] 變數 ${k} 缺值，保留字面`)
      return m
    }
    if (typeof v === 'object') {
      console.warn(`[templateEngine] 變數 ${k} 是物件（陣列？），需用 {{#each}} 展開`)
      return m
    }
    return String(v)
  })
}

function renderSegment(text: string, ctx: any, eachStack: EachFrame[]): string {
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const eachOpen = text.indexOf('{{#each ', i)
    if (eachOpen < 0) {
      out.push(replaceVars(text.slice(i), ctx, eachStack))
      break
    }
    out.push(replaceVars(text.slice(i, eachOpen), ctx, eachStack))
    const eachNameStart = eachOpen + '{{#each '.length
    const eachNameEnd = text.indexOf('}}', eachNameStart)
    if (eachNameEnd < 0) {
      out.push(text.slice(eachOpen))
      break
    }
    const arrayName = text.slice(eachNameStart, eachNameEnd).trim()
    const blockStart = eachNameEnd + 2
    const blockEnd = findMatchingEnd(text, blockStart)
    if (blockEnd < 0) {
      out.push(text.slice(eachOpen))
      break
    }
    const block = text.slice(blockStart, blockEnd)
    const arr = lookupRaw(arrayName, ctx, eachStack)
    if (Array.isArray(arr) && arr.length > 0) {
      for (let idx = 0; idx < arr.length; idx++) {
        const newStack = eachStack.concat({ item: arr[idx], index: idx + 1 })
        out.push(renderSegment(block, ctx, newStack))
      }
    }
    i = blockEnd + '{{/each}}'.length
  }
  return out.join('')
}

export function render(template: string, ctx: RenderContext): string {
  if (typeof template !== 'string') return ''
  return renderSegment(template, ctx, [])
}
