const pad = (n: number) => String(n).padStart(2, '0')

/** 本地日期 YYYY-MM-DD */
export function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 本地时间 HH:MM */
export function hm(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

export function dayPath(date: string): string {
  return `days/${date.slice(0, 4)}/${date}.md`
}

export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/** ISO 周：[年, 周数] */
export function isoWeek(s: string): [number, number] {
  const [y, m, day] = s.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, day))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)) // 移到本周四
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return [d.getUTCFullYear(), Math.ceil(((d.getTime() - yearStart) / 864e5 + 1) / 7)]
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function weekday(s: string): string {
  return WEEKDAYS[parseYmd(s).getDay()]
}

export function cnMonthDay(s: string): string {
  const d = parseYmd(s)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
