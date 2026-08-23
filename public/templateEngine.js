// public/templateEngine.js — 訊息模板渲染引擎（F8 v1.1.15，純函式）
// 變數替換 + {{#each array}}...{{/each}} 迴圈（含巢狀）
// 不做 if/else 條件；不做 HTML escape（訊息是純文字，LINE 端自動處理）
// 缺值保留 {{key}} 字面並 console.warn，方便使用者發現漏變數
//
// 同時支援瀏覽器（IIFE，掛 globalThis.templateEngine）與 Node ESM（export）

(function (global) {
  'use strict'

  // 變數點查找：先查 ctx 本身，找不到查當前 each 迴圈的 stack（由內而外）
  function lookup(key, ctx, eachStack) {
    // 自動變數：序（在 each 區段內 = 1-based 計數）
    if (key === '序') {
      if (eachStack.length > 0) return eachStack[eachStack.length - 1].index
      return ''
    }
    // 自動變數：created_at_time（ISO 轉 HH:MM，台灣時區）
    if (key === 'created_at_time') {
      const iso = lookupRaw('created_at', ctx, eachStack)
      if (!iso) return ''
      return isoToHHMM(iso)
    }
    // 自動變數：note_or_status（updates 區段內自動組字）
    // F11-4：kind='system' 也用 note（編輯留痕的系統訊息），不顯示狀態
    if (key === 'note_or_status') {
      const kind = lookupRaw('kind', ctx, eachStack)
      if (kind === 'comment' || kind === 'system') return lookupRaw('note', ctx, eachStack) || ''
      // kind='status'（預設）：顯示「狀態：{label}」
      const statusLabel = lookupRaw('status_label', ctx, eachStack) || lookupRaw('status', ctx, eachStack) || ''
      return `狀態：${statusLabel}`
    }
    // 自動變數：amount_text（updates 區段內）
    if (key === 'amount_text') {
      const amount = lookupRaw('amount', ctx, eachStack)
      if (amount === null || amount === undefined || amount === 0) return ''
      return `（$${Number(amount).toLocaleString('en-US')}）`
    }
    return lookupRaw(key, ctx, eachStack)
  }

  function lookupRaw(key, ctx, eachStack) {
    // 先查 ctx
    if (ctx && Object.prototype.hasOwnProperty.call(ctx, key)) return ctx[key]
    // 再查 each stack（由內而外）
    for (let i = eachStack.length - 1; i >= 0; i--) {
      const item = eachStack[i].item
      if (item && Object.prototype.hasOwnProperty.call(item, key)) return item[key]
    }
    return undefined
  }

  function isoToHHMM(iso) {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(iso))
    } catch (_) {
      return ''
    }
  }

  /**
   * 渲染模板：替換 {{key}} 變數 + 展開 {{#each array}}...{{/each}} 迴圈
   * @param {string} template - 模板字串（含 {{var}} 與 {{#each X}}...{{/each}}）
   * @param {object} ctx - 資料上下文
   * @returns {string} 渲染結果
   */
  function render(template, ctx) {
    if (typeof template !== 'string') return ''
    return renderSegment(template, ctx, [])
  }

  // 處理一段文字（不包含外層 each 控制）
  function renderSegment(text, ctx, eachStack) {
    // 先處理 each 控制語法（可能巢狀）
    // 用正則切出非 each 區段與 each 區段
    const out = []
    let i = 0
    while (i < text.length) {
      const eachOpen = text.indexOf('{{#each ', i)
      if (eachOpen < 0) {
        // 沒了，剩下都是純變數替換
        out.push(replaceVars(text.slice(i), ctx, eachStack))
        break
      }
      // eachOpen 之前是純變數
      out.push(replaceVars(text.slice(i, eachOpen), ctx, eachStack))
      const eachNameStart = eachOpen + '{{#each '.length
      const eachNameEnd = text.indexOf('}}', eachNameStart)
      if (eachNameEnd < 0) {
        // 殘缺的 each，視為純文字
        out.push(text.slice(eachOpen))
        break
      }
      const arrayName = text.slice(eachNameStart, eachNameEnd).trim()
      const blockStart = eachNameEnd + 2
      const blockEnd = findMatchingEnd(text, blockStart)
      if (blockEnd < 0) {
        // 找不到對應 close，原樣輸出
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
      // 空陣列 → 整段不輸出
      i = blockEnd + '{{/each}}'.length
    }
    return out.join('')
  }

  // 找對應的 {{/each}}，處理巢狀（每層都叫 each，巢狀時靠 depth++）
  function findMatchingEnd(text, from) {
    let depth = 1
    let i = from
    while (i < text.length) {
      const openIdx = text.indexOf('{{#each ', i)
      const closeIdx = text.indexOf('{{/each}}', i)
      if (closeIdx < 0) return -1
      if (openIdx >= 0 && openIdx < closeIdx) {
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

  // 替換 {{var}}，缺值保留字面 + console.warn
  function replaceVars(text, ctx, eachStack) {
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

  global.templateEngine = { render }

  // Node ESM 環境兼容：vitest 測試用
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.templateEngine
  }
})(typeof window !== 'undefined' ? window : globalThis)
