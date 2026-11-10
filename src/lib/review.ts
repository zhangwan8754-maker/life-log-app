/** 每周复盘：统计、生成 reviews/YYYY-Www.md、生成给 AI 的提示词 */
import { addDays, isoWeek, parseYmd } from './dates'
import { getMeta, getSection, parseNotes, score, setSection, stripFrontmatter } from './md'
import { allTasks, parseTodo, type Task } from './todo'

export interface WeekRange {
  id: string
  week: number
  from: string
  to: string
  days: string[]
}

export function weekOf(date: string): WeekRange {
  const [y, w] = isoWeek(date)
  const from = addDays(date, -((parseYmd(date).getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  return { id: `${y}-W${String(w).padStart(2, '0')}`, week: w, from, to: days[6], days }
}

/** 2026-W45 → 那一周；格式不对返回 null */
export function weekFromId(id: string): WeekRange | null {
  const m = id.match(/^(\d{4})-W(\d{2})$/)
  if (!m) return null
  const jan4 = new Date(Number(m[1]), 0, 4)
  const mon1 = addDays(`${m[1]}-01-04`, -((jan4.getDay() + 6) % 7))
  return weekOf(addDays(mon1, (Number(m[2]) - 1) * 7))
}

export const reviewPath = (r: WeekRange) => `reviews/${r.id}.md`

export interface WeekStats {
  daysLogged: number
  mood: (number | null)[]
  energy: (number | null)[]
  moodAvg: string
  energyAvg: string
  notes: number
  completed: Task[]
  overdue: Task[]
  open: number
  thoughts: string[]
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'
}

export function weekStats(
  r: WeekRange,
  dayMd: (date: string) => string | null | undefined,
  todoMd: string,
  thoughts: { title: string; created: string }[],
  today: string,
): WeekStats {
  const mds = r.days.map((d) => dayMd(d) ?? '')
  const mood = mds.map((m) => score(getMeta(m, 'mood')))
  const energy = mds.map((m) => score(getMeta(m, 'energy')))
  const tasks = allTasks(parseTodo(todoMd))
  return {
    daysLogged: mds.filter((m) => m.trim()).length,
    mood,
    energy,
    moodAvg: avg(mood),
    energyAvg: avg(energy),
    notes: mds.reduce((a, m) => a + parseNotes(m).length, 0),
    completed: tasks.filter((t) => t.done && t.doneOn >= r.from && t.doneOn <= r.to),
    overdue: tasks.filter((t) => !t.done && t.date && t.date < today),
    open: tasks.filter((t) => !t.done).length,
    thoughts: thoughts.filter((t) => t.created >= r.from && t.created <= r.to).map((t) => t.title),
  }
}

export function dataSection(s: WeekStats): string {
  const lines = [
    `- 记录 ${s.daysLogged}/7 天，速记 ${s.notes} 条`,
    `- 情绪均值 ${s.moodAvg}，精力均值 ${s.energyAvg}`,
    `- 完成待办 ${s.completed.length} 件，逾期 ${s.overdue.length} 件，未完成共 ${s.open} 件`,
  ]
  if (s.thoughts.length) lines.push(`- 新增思想：${s.thoughts.join('、')}`)
  if (s.completed.length) lines.push('', '完成：', ...s.completed.map((t) => `- ${t.text}（${t.group}）`))
  return lines.join('\n')
}

export interface ReviewParts {
  facts: string
  patterns: string
  next: string
}

export function parseReview(md: string | null | undefined): ReviewParts {
  const m = md ?? ''
  return { facts: getSection(m, '事实') ?? '', patterns: getSection(m, '模式') ?? '', next: getSection(m, '下一步') ?? '' }
}

export function reviewMarkdown(r: WeekRange, s: WeekStats, p: ReviewParts, existing?: string | null): string {
  let md =
    existing ||
    `---\nperiod: ${r.id}\nfrom: ${r.from}\nto: ${r.to}\n---\n# 复盘 · ${r.id}\n\n## 事实\n\n## 数据\n\n## 模式\n\n## 下一步\n`
  md = setSection(md, '事实', p.facts)
  md = setSection(md, '数据', dataSection(s))
  md = setSection(md, '模式', p.patterns)
  md = setSection(md, '下一步', p.next)
  return md
}

/** 粘贴给 Claude 的复盘上下文 */
export function aiPrompt(
  r: WeekRange,
  me: string,
  dayMd: (date: string) => string | null | undefined,
  todoMd: string,
  s: WeekStats,
): string {
  const days = r.days
    .map((d) => {
      const md = dayMd(d)
      if (!md) return null
      const notes = parseNotes(md).map((n) => `  - ${n.time} ${n.text}`).join('\n')
      return [
        `### ${d}（情绪 ${getMeta(md, 'mood') || '—'}，精力 ${getMeta(md, 'energy') || '—'}）`,
        (getSection(md, '日记') ?? '').trim() || '（无日记）',
        notes && `速记：\n${notes}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
  const groups = parseTodo(todoMd)
    .map((g) => {
      const open = g.tasks.filter((t) => !t.done)
      if (!open.length) return null
      return `- ${g.name}${g.goal ? `（目标：${g.goal}）` : ''}：${open.map((t) => t.text + (t.date ? ` @${t.date}` : '')).join('；')}`
    })
    .filter(Boolean)
    .join('\n')

  return `请作为我的复盘伙伴，帮我复盘 ${r.id}（${r.from} 至 ${r.to}）。

要求：
- 先事实后解释，引用具体日期和原话；用数据说话。
- 对照「我是谁」里的「在乎」和「方向」。评价我时用我自己的尺子（「好的一天」），和我自己比，不和别人比。
- 「做法」里「借来的」是我读到、听到但还没验证的话，不要当成我的结论；可以指出这周哪件事验证或推翻了它。
- 找出重复出现的模式；不说教，最后给出最多 3 条可执行的下一步。

## 我是谁
${stripFrontmatter(me).trim() || '（未填写）'}

## 本周数据
${dataSection(s)}

## 每天的记录
${days || '（本周没有记录）'}

## 还没完成的待办
${groups || '（无）'}
`
}
