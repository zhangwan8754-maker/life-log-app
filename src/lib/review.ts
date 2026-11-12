/** 每周复盘：统计、生成 reviews/YYYY-Www.md、生成给 AI 的提示词 */
import { addDays, isoWeek, parseYmd } from './dates'
import { fmtHours, getMeta, getSection, noteKind, parseNotes, parseSpent, score, setSection, stripFrontmatter, sumSpent, type NoteKind, type Spent } from './md'
import type { Pattern } from './memory'
import { meTargets, progressLine, targetProgress, type Progress } from './targets'
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
  /** 「投入：」速记按名称汇总，时长多的在前 */
  spent: Spent[]
  spentTotal: number
  /** me.md 里的每周目标，和这一周实际投入的对照；没设目标时为空 */
  targets: Progress[]
  /** 标了「学到 / 问题」的速记 */
  marked: { date: string; time: string; text: string; kind: NoteKind }[]
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'
}

export function weekStats(
  r: WeekRange,
  dayMd: (date: string) => string | null | undefined,
  todoMd: string,
  today: string,
  meMd: string | null = '',
): WeekStats {
  const mds = r.days.map((d) => dayMd(d) ?? '')
  const mood = mds.map((m) => score(getMeta(m, 'mood')))
  const energy = mds.map((m) => score(getMeta(m, 'energy')))
  const tasks = allTasks(parseTodo(todoMd))
  const allNotes = mds.flatMap((m, i) => parseNotes(m).map((n) => ({ date: r.days[i], ...n })))
  const spent = sumSpent(allNotes.map((n) => parseSpent(n.text)?.items ?? []))
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
    spent,
    spentTotal: spent.reduce((a, x) => a + x.hours, 0),
    targets: targetProgress(meTargets(meMd), spent).items,
    marked: allNotes.map((n) => ({ ...n, kind: noteKind(n.text).kind })).filter((n) => n.kind === 'learned' || n.kind === 'question'),
  }
}

export const spentLine = (xs: Spent[]) => xs.map((x) => `${x.name} ${fmtHours(x.hours)}`).join('、')

export function dataSection(s: WeekStats): string {
  const lines = [
    `- 记录 ${s.daysLogged}/7 天，速记 ${s.notes} 条`,
    `- 情绪均值 ${s.moodAvg}，精力均值 ${s.energyAvg}`,
    `- 完成待办 ${s.completed.length} 件，逾期 ${s.overdue.length} 件，未完成共 ${s.open} 件`,
  ]
  if (s.spent.length) lines.push(`- 投入 ${fmtHours(s.spentTotal)}：${spentLine(s.spent)}`)
  if (s.targets.length) lines.push(`- 每周目标：${progressLine(s.targets)}`)
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

/** 复盘里「下一步」的每一条（去掉列表符号和复选框） */
export function nextSteps(md: string | null | undefined): string[] {
  return (getSection(md ?? '', '下一步') ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.、)])\s+(?:\[[ xX]\]\s+)?/, '').trim())
    .filter(Boolean)
}

/** 上一周 */
export const prevWeek = (r: WeekRange) => weekOf(addDays(r.from, -1))

/** 「历史复盘」里的叫法：2026-W45 → 2026 年第 45 周，2026-11 → 2026 年 11 月 */
export function periodLabel(id: string): string {
  const w = id.match(/^(\d{4})-W(\d+)$/)
  if (w) return `${w[1]} 年第 ${Number(w[2])} 周`
  const m = id.match(/^(\d{4})-(\d{2})$/)
  if (m) return `${m[1]} 年 ${Number(m[2])} 月`
  return /^\d{4}$/.test(id) ? `${id} 年` : id
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

// ───── 复制给 AI ─────

export interface PromptExtra {
  prevNext?: string[]
  patterns?: Pattern[]
  /** 今天。给了就写明这一周过到哪了，没发生的日子不算缺记录 */
  today?: string
  /** 上一周的统计：和上一期的自己比 */
  prev?: WeekStats
  /** memory/timeline.md 原文：更早发生过什么 */
  timeline?: string | null
  /** 各个 AI 还挂着、等主人决定的建议 */
  pending?: { name: string; n: number; text: string }[]
}

const WD = '日一二三四五六'
const wd = (date: string) => WD[parseYmd(date).getDay()]
/** 仓库里的相对链接在聊天窗口里点不开，只留文字 */
const plain = (md: string) => md.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
const pct = (done: number, want: number) => `${Math.round((done / want) * 100)}%`

/** 给 AI 看的数据：比写进复盘文件的那几行多出每天一行、每科几天、对目标、和上周比 */
function promptData(r: WeekRange, dayMd: (date: string) => string | null | undefined, s: WeekStats, x: PromptExtra): string {
  const out: string[] = [dataSection(s).split('\n\n完成：')[0]]
  const upto = x.today && x.today >= r.from && x.today < r.to ? x.today : r.to
  const past = r.days.filter((d) => d <= upto)
  const rows = past
    .map((d) => ({ d, md: dayMd(d) ?? '' }))
    .filter((v) => v.md.trim())
    .map(({ d, md }) => {
      const sp = sumSpent(parseNotes(md).map((n) => parseSpent(n.text)?.items ?? []))
      const chars = (getSection(md, '日记') ?? '').replace(/\s/g, '').length
      return { d, sp, line: `| ${d} | ${wd(d)} | ${getMeta(md, 'mood') || '—'} | ${getMeta(md, 'energy') || '—'} | ${chars} | ${sp.length ? spentLine(sp) : '—'} |` }
    })
  if (rows.length) out.push('### 每天', ['| 日期 | 周 | 情绪 | 精力 | 日记字数 | 投入 |', '|---|---|---|---|---|---|', ...rows.map((v) => v.line)].join('\n'))

  if (s.spent.length) {
    const on = (name: string) => rows.filter((v) => v.sp.some((i) => i.name === name)).length
    const studied = rows.filter((v) => v.sp.length).length
    out.push('### 投入', [...s.spent.map((i) => `- ${i.name}：${fmtHours(i.hours)}，${on(i.name)} 天`), `- 合计 ${fmtHours(s.spentTotal)}；过去的 ${past.length} 天里有 ${studied} 天记了投入`].join('\n'))
  } else out.push('### 投入', '这一周没有「投入：…」速记，时间花在哪只能从日记原文里读。')

  if (s.targets.length)
    out.push('### 每周目标（实际 / 目标，是我自己定的）', s.targets.map((t) => `- ${t.name}：${fmtHours(t.done)} / ${fmtHours(t.hours)}（${pct(t.done, t.hours)}）`).join('\n'))

  if (x.prev) {
    const p = x.prev
    out.push(
      `### 和上周比（上周 → 这周${upto < r.to ? '，这周还没过完' : ''}）`,
      [
        `- 记录天数：${p.daysLogged} → ${s.daysLogged}`,
        `- 情绪均值：${p.moodAvg} → ${s.moodAvg}`,
        `- 精力均值：${p.energyAvg} → ${s.energyAvg}`,
        `- 投入：${fmtHours(p.spentTotal)} → ${fmtHours(s.spentTotal)}`,
        `- 完成待办：${p.completed.length} → ${s.completed.length}`,
      ].join('\n'),
    )
  }
  if (s.completed.length) out.push('### 这周完成的待办', s.completed.map((t) => `- ${t.text}（${t.group}）`).join('\n'))
  if (s.overdue.length) out.push('### 逾期的待办', s.overdue.map((t) => `- ${t.text}（${t.group}，@${t.date}）`).join('\n'))
  return out.join('\n\n')
}

/** 大事记：去掉说明文字和链接，只留最近的 60 行 */
function timelineText(md: string | null | undefined): string {
  const ls = plain(stripFrontmatter(md ?? ''))
    .split('\n')
    .filter((l) => l.trim() && !/^\s*>/.test(l) && !/^# /.test(l))
  // 里面的小标题不和上下文的标题撞层级
  return ls.slice(-60).map((l) => l.replace(/^#+\s+(.*)$/, '【$1】')).join('\n')
}

/**
 * 粘贴给任何一个 AI 的复盘上下文。
 * 顺序是 AI 复盘时用到的顺序：规则 → 我是谁（尺子）→ 数据 → 上周的承诺 → 记忆（模式、大事记、已经提过的建议）→ 原始记录 → 怎么回答。
 */
export function aiPrompt(
  r: WeekRange,
  me: string,
  dayMd: (date: string) => string | null | undefined,
  todoMd: string,
  s: WeekStats,
  extra: PromptExtra = {},
): string {
  const partial = extra.today && extra.today >= r.from && extra.today < r.to ? extra.today : ''
  const now = partial ? `\n今天是 ${partial}（周${wd(partial)}），这一周还没过完：之后的几天还没发生，不要当成缺记录或没完成。\n` : ''
  const prevNext = extra.prevNext?.length ? `\n## 上周说的下一步\n${extra.prevNext.map((x) => `- ${x}`).join('\n')}\n` : '\n## 上周说的下一步\n（上周没有写）\n'
  const patterns = extra.patterns?.length
    ? `\n## 模式账本（之前记下的假设，不是结论）\n${extra.patterns
        .map((p) => `### ${p.id ? `${p.id} ` : ''}${p.title}${p.status ? `（${p.status}）` : ''}\n${clip(plain(p.body), 900)}`.trim())
        .join('\n\n')}\n`
    : ''
  const tl = timelineText(extra.timeline)
  const timeline = tl ? `\n## 大事记（更早发生过什么，只有事实）\n${tl}\n` : ''
  const pending = extra.pending?.length
    ? `\n## 已经提过、还在等我决定的建议（不要重复）\n${extra.pending.map((p) => `- ${p.name} 第 ${p.n} 条：${clip(plain(p.text).split('\n')[0], 120)}`).join('\n')}\n`
    : ''
  const days = r.days
    .map((d) => {
      const md = dayMd(d)
      if (!md) return null
      const notes = parseNotes(md).map((n) => `  - ${n.time} ${n.text}`).join('\n')
      return [
        `### ${d} 周${wd(d)}（情绪 ${getMeta(md, 'mood') || '—'}，精力 ${getMeta(md, 'energy') || '—'}）`,
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
${now}
要求：
- 先事实后解释，引用具体日期和原话。数字只用「本周数据」里的，不要自己估。
- 用我自己的尺子评价（「我是谁 · 在乎 · 好的一天」），和上一周的我比，不和别人比。
- 时间花在哪，和「方向 · 这学期」对得上吗？有「每周目标」时指出差多少、差在哪几天；改目标还是改做法由我决定。
- 「做法 · 借来的」是我读到、听到但还没验证的话，不要当成我的结论；可以指出这周哪件事验证或推翻了它。
- 先逐条核对「上周说的下一步」做了没有。
- 找重复出现的事，对照「模式账本」：哪条多了证据、哪条出现了反例，证据和反例一起给；只出现一次的不算模式，样本少就说少。
- 「已经提过的建议」不要换个说法再提一次。
- 不做心理诊断，不说教。

## 我是谁
${stripFrontmatter(me).trim() || '（未填写）'}

## 本周数据
${promptData(r, dayMd, s, extra)}
${prevNext}${patterns}${timeline}${pending}
## 每天的记录
${days || '（本周没有记录）'}

## 还没完成的待办
${groups || '（无）'}

## 请这样回答
按下面三段写，我会把它们分别贴进每周复盘的「事实」「模式」「下一步」：

### 事实
先逐条写上周说的下一步做了没有（没有就略过），再写这一周发生了什么、时间花在哪。带日期、原话和数字。

### 模式
重复出现的事，每条写清证据和反例各是哪天。没有就写没有。

### 下一步
最多 3 条，每条一行，写成下周就能做、做没做一眼看得出来的动作。
`
}
