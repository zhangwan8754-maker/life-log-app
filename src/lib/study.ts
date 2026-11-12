/**
 * 学习时间统计：把每天的「投入：」速记按天、按科目、按周汇总。
 * 都是纯函数，页面和「复制给 AI」共用同一套数字。
 */
import { addDays } from './dates'
import { daySpent, type Spent } from './md'

type DayMd = (date: string) => string | null | undefined

export interface DayHours {
  date: string
  items: Spent[]
  hours: number
}

export const hoursOf = (md: string | null | undefined) => daySpent(md ?? '').reduce((a, x) => a + x.hours, 0)

/** 这几天每天投入了什么、一共多久 */
export function spentByDay(dates: string[], dayMd: DayMd): DayHours[] {
  return dates.map((date) => {
    const items = daySpent(dayMd(date) ?? '')
    return { date, items, hours: items.reduce((a, x) => a + x.hours, 0) }
  })
}

/** 每个名称在几天里出现过：{ 数学: 3 } */
export function subjectDays(days: DayHours[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of days) for (const x of d.items) out[x.name] = (out[x.name] ?? 0) + 1
  return out
}

/**
 * 连续有投入的天数，数到今天为止。今天还没记时从昨天往回数：
 * 一天还没过完，不能算断了。
 */
export function streak(today: string, dayMd: DayMd, max = 400): number {
  let d = hoursOf(dayMd(today)) > 0 ? today : addDays(today, -1)
  let n = 0
  while (n < max && hoursOf(dayMd(d)) > 0) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export interface WeekHours {
  /** 这一周的周一 */
  from: string
  hours: number
  /** 有投入的天数 */
  days: number
}

/** 最近 n 周（含本周）每周的投入，旧的在前 */
export function weeklyHours(thisMonday: string, n: number, dayMd: DayMd): WeekHours[] {
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(thisMonday, (i - n + 1) * 7)
    const hs = Array.from({ length: 7 }, (_, j) => hoursOf(dayMd(addDays(from, j))))
    return { from, hours: hs.reduce((a, b) => a + b, 0), days: hs.filter((h) => h > 0).length }
  })
}
