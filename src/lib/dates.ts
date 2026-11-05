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

const SHORT_WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const shortWeekday = (s: string) => SHORT_WD[parseYmd(s).getDay()]

export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 864e5)
}

/** 相对今天的叫法：今天 / 明天 / 昨天 / 周五 / 11月20日 */
export function relDay(date: string, today: string): string {
  const n = daysBetween(today, date)
  if (n === 0) return '今天'
  if (n === 1) return '明天'
  if (n === -1) return '昨天'
  if (n > 1 && n < 7) return shortWeekday(date)
  return cnMonthDay(date)
}

/** 本周末（周六）；今天已是周末则为今天 */
export function weekend(today: string): string {
  const d = parseYmd(today).getDay()
  return d === 6 || d === 0 ? today : addDays(today, 6 - d)
}

/** 下周一 */
export function nextMonday(today: string): string {
  const d = parseYmd(today).getDay()
  return addDays(today, ((8 - d) % 7) || 7)
}
