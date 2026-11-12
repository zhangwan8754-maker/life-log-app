import { describe, expect, it } from 'vitest'
import { spentByDay, streak, subjectDays, weeklyHours } from './study'

const day = (notes: string[]) => `---\nmood: 7\n---\n## 日记\n\n## 速记\n\n${notes.map((n) => `- 21:00 ${n}`).join('\n')}\n`
const days: Record<string, string> = {
  '2026-11-02': day(['投入：数学 1h']),
  '2026-11-09': day(['投入：英语 1h，数学 30min']),
  '2026-11-10': day(['投入：数学 2h', '投入：英语 30min']),
  '2026-11-11': day(['只是一条速记']),
  '2026-11-12': day(['投入：数学 47min']),
}
const md = (d: string) => days[d]

describe('学习时间统计', () => {
  it('按天汇总，数出每科学了几天', () => {
    const week = spentByDay(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'], md)
    expect(week.map((d) => Math.round(d.hours * 100) / 100)).toEqual([1.5, 2.5, 0, 0.78, 0])
    expect(subjectDays(week)).toEqual({ 英语: 2, 数学: 3 })
  })

  it('连续天数：今天还没记就从昨天往回数，中间断了就停', () => {
    expect(streak('2026-11-12', md)).toBe(1)
    expect(streak('2026-11-11', md)).toBe(2)
    expect(streak('2026-11-10', md)).toBe(2)
    expect(streak('2026-11-13', md)).toBe(1)
    expect(streak('2026-11-14', md)).toBe(0)
  })

  it('最近几周每周的投入，旧的在前', () => {
    const ws = weeklyHours('2026-11-09', 3, md)
    expect(ws.map((w) => [w.from, Math.round(w.hours * 100) / 100, w.days])).toEqual([
      ['2026-10-26', 0, 0],
      ['2026-11-02', 1, 1],
      ['2026-11-09', 4.78, 3],
    ])
  })
})
