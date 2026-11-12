/**
 * 每周投入的目标：me.md「方向 · 每周投入」里一行一个 `- 数学 10h`。
 * 复盘时拿这一周实际记下的「投入：」来对，回答「说的和做的一致吗」。
 * 解析规则和数据仓库的 tools/lifelog.py 保持一致。
 */
import { fmtHours, type Spent } from './md'
import { parseMe } from './me'

export const TARGET_SECTION = '方向'
export const TARGET_SUB = '每周投入'

export interface Target {
  name: string
  hours: number
}
export interface Progress extends Target {
  /** 这段时间实际投入的小时数 */
  done: number
}

// 和「投入：」速记同一种写法；不写单位算小时
const LINE = /^(.*?)[\s:：]*(\d+(?:\.\d+)?)\s*(h|hr|小时|个小时|min|m|分钟|分)?$/i

/** 「- 数学 10h」每行一项。bad 是认不出的行 */
export function parseTargets(text: string | null | undefined): { items: Target[]; bad: string[] } {
  const items: Target[] = []
  const bad: string[] = []
  for (const raw of (text ?? '').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const line = raw.replace(/^\s*[-*]\s*/, '').trim()
    if (!line) continue
    const m = line.match(LINE)
    const name = m?.[1].trim()
    const n = Number(m?.[2])
    if (!m || !name || !(n > 0)) {
      bad.push(line)
      continue
    }
    const hours = !m[3] || /^(h|hr|小时|个小时)$/i.test(m[3]) ? n : n / 60
    const cur = items.find((x) => x.name === name)
    if (cur) cur.hours = hours
    else items.push({ name, hours })
  }
  return { items, bad }
}

export const formatTargets = (items: Target[]) => items.map((t) => `- ${t.name} ${fmtHours(t.hours)}`).join('\n')

/** me.md 里写的每周目标 */
export function meTargets(meMd: string | null | undefined): Target[] {
  const text = parseMe(meMd).groups.find((g) => g.title === TARGET_SECTION)?.fields.find((f) => f.sub === TARGET_SUB)?.text
  return parseTargets(text).items
}

/**
 * 实际投入对目标。一笔投入算进名称相同、或者是它开头的那个目标
 * （「英语语法」算进「英语」）；能对上几个时取名称最长的。
 * other 是哪个目标都对不上的小时数。
 */
export function targetProgress(targets: Target[], spent: Spent[]): { items: Progress[]; other: number } {
  const items = targets.map((t) => ({ ...t, done: 0 }))
  let other = 0
  for (const s of spent) {
    const hit = items.filter((t) => s.name === t.name || s.name.startsWith(t.name)).sort((a, b) => b.name.length - a.name.length)[0]
    if (hit) hit.done += s.hours
    else other += s.hours
  }
  return { items, other }
}

export const progressLine = (xs: Progress[]) => xs.map((x) => `${x.name} ${fmtHours(x.done)}/${fmtHours(x.hours)}`).join('、')
