// 暫時性驗證用：small-ICU 環境下補 en-CA 行為（正式碼不含此檔）
const real = Intl.DateTimeFormat
function needsPolyfill() {
  try {
    const s = new real('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date('2026-01-02T00:00:00Z'))
    return s !== '2026-01-02'
  } catch {
    return true
  }
}
function isoParts(tz: string, d: Date, withDay: boolean) {
  const parts = new real('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute'), ss: get('second') }
}
if (needsPolyfill()) {
  ;(Intl as any).DateTimeFormat = function (...args: any[]) {
    const [locale, opts] = args
    const isDate = locale === 'en-CA' && opts && opts.year && opts.month === '2-digit' && opts.day === '2-digit'
    const isMonth = locale === 'en-CA' && opts && opts.year && opts.month === '2-digit' && !opts.day
    if ((isDate || isMonth) && typeof opts?.timeZone === 'string') {
      const tz = opts.timeZone
      return {
        format: (d?: Date) => {
          const s = d ? new Date(d) : new Date()
          const p = isoParts(tz, s, !!opts.day)
          if (isMonth) return `${p.y}-${p.m}`
          return `${p.y}-${p.m}-${p.d}`
        },
        formatToParts: (d?: Date) => {
          const s = d ? new Date(d) : new Date()
          const p = isoParts(tz, s, !!opts.day)
          const mk = (type: string, value: string) => ({ type, value })
          const out: any[] = [mk('year', p.y), mk('literal', '-'), mk('month', p.m)]
          if (isDate) out.push(mk('literal', '-'), mk('day', p.d))
          if (opts.hour && opts.minute) out.push(mk('literal', ' '), mk('hour', p.hh), mk('literal', ':'), mk('minute', p.mm))
          return out
        },
      } as any
    }
    return new real(...(args as []))
  } as any
}

export {}
