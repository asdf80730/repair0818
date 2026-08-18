// src/lib/time.ts — 時間工具（§2.2、§4.7）
// 一律 ISO8601 UTC；月份邊界用台灣時區（Asia/Taipei）
// 純 Web API（Intl），無 Node.js 專屬 API

const TAIWAN_TZ = 'Asia/Taipei'

/** 目前時間，ISO8601 UTC（寫入 side 一律用這個） */
export function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 台灣當月邊界（UTC 毫秒秒數），供 SQL 帶入。
 * 回傳 { startMs, endMs }：startMs 為當月 1 日 00:00（台灣）的 UTC 值，
 * endMs 為下月 1 日 00:00（台灣）的 UTC 值（不含）。
 * 以「台灣當下日期」決定月份。
 */
export function taipeiMonthRangeUtc(): { startMs: number; endMs: number } {
  const now = new Date()
  // 台灣當下年／月（用 Intl 依時區取得）
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIWAN_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)

  const year = Number(parts.find((p) => p.type === 'year')!.value)
  const month = Number(parts.find((p) => p.type === 'month')!.value)

  // 當月 1 日 00:00 台灣時間 → 換算 UTC
  const start = toUtcMs(year, month, 1)
  // 下月 1 日（月份 +1，跨年時進位）
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = toUtcMs(nextYear, nextMonth, 1)

  return { startMs: start, endMs: end }
}

/**
 * 將「台灣時區的某日 00:00」換算成 UTC 毫秒。
 * 透過 Date 的 reverse-zone offset 技巧（無第三方套件）。
 */
function toUtcMs(year: number, month: number, day: number): number {
  // 先把「疑似台灣該日 00:00 的 UTC 字串」丟進 Date 再推回
  // Date 解析 'YYYY-MM-DDT00:00:00' 當作 UTC；再減去台灣與 UTC 的差。
  const asUtc = Date.UTC(year, month - 1, day, 0, 0, 0)
  // 用 Intl 求台灣時區在該瞬間的偏移（offsetMs = 台灣時間 - UTC）
  const offsetMs = tzOffsetMs(TAIWAN_TZ, asUtc)
  // 台灣 00:00 對應的 UTC = asUtc - offsetMs
  return asUtc - offsetMs
}

/** 某時區在某 UTC 瞬間的偏移（毫秒，正＝比 UTC 快） */
function tzOffsetMs(timeZone: string, utcMs: number): number {
  // 用 Intl 求該瞬間該時區的 local 時間部件，再算差
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return local - utcMs
}

/** 台灣時區的 YYYY-MM-DD（用於 CSV 檔名等） */
export function taipeiDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TAIWAN_TZ }).format(new Date())
}

/**
 * 把 UTC ISO 字串轉成台灣時區的 'YYYY-MM-DD HH:mm'（CSV §4.8 用）。
 */
export function toTaipeiDisplay(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIWAN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}
