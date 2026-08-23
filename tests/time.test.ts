// tests/time.test.ts — v1.1.15 time helper 測試
// 鎖定 F11-2「taipeiToday 必須回 YYYY-MM-DD（regex 嚴格驗證）」
// + F11-7「taipeiDayRangeUtc 半開區間」
import { describe, it, expect } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { taipeiToday, taipeiDayRangeUtc, isValidDate } from '../src/lib/time'

describe('v1.1.15 time helpers', () => {
  it('taipeiToday 回傳 YYYY-MM-DD 格式（無斜線、有前導零）', () => {
    const out = taipeiToday()
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)  // regex 嚴格，與 dateStrOrDay 一致
    // 不能是 'zh-TW' locale 格式（會出 2026/8/23 或 2026/08/23 不一定）
    expect(out).not.toContain('/')
  })

  it('taipeiToday 不會炸（重複呼叫 100 次都正確格式）', () => {
    for (let i = 0; i < 100; i++) {
      const out = taipeiToday()
      expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('taipeiDayRangeUtc(date) 回 {startMs, endMs}（毫秒數字，非字串）', () => {
    const r = taipeiDayRangeUtc('2026-08-23')
    expect(typeof r.startMs).toBe('number')
    expect(typeof r.endMs).toBe('number')
    expect(r.endMs - r.startMs).toBe(24 * 3600 * 1000)  // 半開區間 = 24h
  })

  it('taipeiDayRangeUtc 半開區間 = 該日 00:00:00.000 UTC ~ 明日 00:00:00.000 UTC', () => {
    const r = taipeiDayRangeUtc('2026-08-23')
    expect(new Date(r.startMs).toISOString()).toBe('2026-08-23T00:00:00.000Z')
    expect(new Date(r.endMs).toISOString()).toBe('2026-08-24T00:00:00.000Z')
  })

  it('F11-2 F11-7：date 字串格式錯或空 → startMs=0（caller 應回 400 INVALID_DATE）', () => {
    expect(taipeiDayRangeUtc('2026-13-99').startMs).toBe(0)
    expect(taipeiDayRangeUtc('').startMs).toBe(0)
    expect(taipeiDayRangeUtc('not-a-date').startMs).toBe(0)
  })

  it('isValidDate 接受 2026-08-23，拒絕 2026-02-30', () => {
    expect(isValidDate('2026-08-23')).toBe(true)
    expect(isValidDate('2026-02-30')).toBe(false)  // Date.parse 容忍溢位，需反向驗證
    expect(isValidDate('2026-13-99')).toBe(false)
    expect(isValidDate('2026/08/23')).toBe(false)  // 拒絕斜線
    expect(isValidDate('')).toBe(false)
  })
})
