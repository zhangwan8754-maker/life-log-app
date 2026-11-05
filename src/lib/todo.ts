/**
 * todo.md 的模型：每个 `## 标题` 是一个分组。
 *   收件箱 —— 默认分组；将来 —— 也许会做；其余 —— 项目（可选 `> 目标`）。
 * 任务：`- [ ] 内容 @计划日期 #标签`，完成后 `- [x] 内容 ✓完成日期`，留在原分组。
 * 所有写操作都是纯函数 (旧文本) => 新文本，并且会先把旧格式（现在/之后/完成）迁移过来。
 */

export const INBOX = '收件箱'
export const SOMEDAY = '将来'
const LEGACY: Record<string, string> = { 现在: INBOX, 之后: SOMEDAY, 完成: INBOX }

export type GroupKind = 'inbox' | 'someday' | 'project'

export interface Task {
  done: boolean
  /** 去掉复选框和 ✓日期 后的原文，用作标识 */
  key: string
  text: string
  date: string
  tags: string[]
  doneOn: string
  group: string
}

export interface Group {
  name: string
  kind: GroupKind
  goal: string
  tasks: Task[]
}

const DATE = /(?:^|\s)@(\d{4}-\d{2}-\d{2})(?=\s|$)/
const itemRe = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/

export function parseTask(line: string, group = ''): Task | null {
  const m = line.match(itemRe)
  if (!m) return null
  let doneOn = ''
  const key = m[2].replace(/\s*✓(\d{4}-\d{2}-\d{2})\s*$/, (_, d) => ((doneOn = d), '')).trim()
  const date = key.match(DATE)?.[1] ?? ''
  const tags = [...key.matchAll(/(?:^|\s)#([^\s#]+)/g)].map((x) => x[1])
  const text = key.replace(new RegExp(DATE.source, 'g'), ' ').replace(/(?:^|\s)#[^\s#]+/g, ' ').replace(/\s+/g, ' ').trim()
  return { done: m[1] !== ' ', key, text, date, tags, doneOn, group }
}

const kindOf = (name: string): GroupKind => (name === INBOX ? 'inbox' : name === SOMEDAY ? 'someday' : 'project')
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

// ───── 分块 ─────

interface Block {
  title: string | null // null = 第一个 ## 之前的部分
  lines: string[]
}

function toBlocks(md: string): Block[] {
  const out: Block[] = [{ title: null, lines: [] }]
  for (const l of md.replace(/\r\n/g, '\n').split('\n')) {
    const h = l.match(/^##\s+(.+?)\s*$/)
    if (h) out.push({ title: h[1], lines: [] })
    else out[out.length - 1].lines.push(l)
  }
  return out
}

const trimBlank = (ls: string[]) => {
  let a = 0
  let b = ls.length
  while (a < b && !ls[a].trim()) a++
  while (b > a && !ls[b - 1].trim()) b--
  return ls.slice(a, b)
}

function fromBlocks(bs: Block[]): string {
  const parts: string[] = []
  for (const b of bs) {
    const body = trimBlank(b.lines)
    if (b.title === null) {
      if (body.length) parts.push(body.join('\n'))
    } else parts.push(body.length ? `## ${b.title}\n\n${body.join('\n')}` : `## ${b.title}`)
  }
  return parts.join('\n\n') + '\n'
}

export function emptyTodo(): string {
  return `# 待办\n\n## ${INBOX}\n\n## ${SOMEDAY}\n`
}

export function isLegacy(md: string): boolean {
  return toBlocks(md).some((b) => b.title !== null && b.title in LEGACY)
}

/** 旧格式（现在 / 之后 / 完成）→ 新格式。已是新格式时原样返回。 */
export function migrateTodo(md: string): string {
  if (!isLegacy(md)) return md
  const bs = toBlocks(md)
  const moved: Record<string, string[]> = { [INBOX]: [], [SOMEDAY]: [] }
  const keep = bs.filter((b) => {
    if (b.title === null || !(b.title in LEGACY)) return true
    moved[LEGACY[b.title]].push(...trimBlank(b.lines).filter((l) => l.trim()))
    return false
  })
  for (const [name, ls] of Object.entries(moved)) {
    let b = keep.find((x) => x.title === name)
    if (!b) {
      b = { title: name, lines: [] }
      if (name === INBOX) keep.splice(1, 0, b)
      else keep.push(b)
    }
    b.lines = [...trimBlank(b.lines), ...ls]
  }
  return fromBlocks(keep)
}

// ───── 读 ─────

export function parseTodo(md: string): Group[] {
  const groups: Group[] = []
  for (const b of toBlocks(migrateTodo(md))) {
    if (b.title === null) continue
    const g: Group = { name: b.title, kind: kindOf(b.title), goal: '', tasks: [] }
    for (const l of b.lines) {
      const t = parseTask(l, b.title)
      if (t) g.tasks.push(t)
      else if (!g.goal && /^>\s?/.test(l)) g.goal = l.replace(/^>\s?/, '').trim()
    }
    groups.push(g)
  }
  if (!groups.some((g) => g.kind === 'inbox')) groups.unshift({ name: INBOX, kind: 'inbox', goal: '', tasks: [] })
  if (!groups.some((g) => g.kind === 'someday')) groups.push({ name: SOMEDAY, kind: 'someday', goal: '', tasks: [] })
  // 收件箱永远在最前，将来永远在最后
  return [...groups.filter((g) => g.kind === 'inbox'), ...groups.filter((g) => g.kind === 'project'), ...groups.filter((g) => g.kind === 'someday')]
}

export const allTasks = (gs: Group[]) => gs.flatMap((g) => g.tasks)

// ───── 写 ─────

type Edit = (bs: Block[]) => void

function edit(md: string | null, fn: Edit): string {
  const bs = toBlocks(migrateTodo(md ?? emptyTodo()))
  fn(bs)
  return fromBlocks(bs)
}

function ensureBlock(bs: Block[], name: string): Block {
  let b = bs.find((x) => x.title === name)
  if (b) return b
  b = { title: name, lines: [] }
  if (name === INBOX) bs.splice(1, 0, b)
  else if (name === SOMEDAY) bs.push(b)
  else {
    const i = bs.findIndex((x) => x.title === SOMEDAY)
    bs.splice(i < 0 ? bs.length : i, 0, b)
  }
  return b
}

/** 找到任务所在的行；group 为空时在所有分组里找（兼容旧版排队中的操作） */
function findTask(bs: Block[], key: string, group?: string): [Block, number] | null {
  for (const b of bs) {
    if (b.title === null || (group && b.title !== group)) continue
    const i = b.lines.findIndex((l) => parseTask(l)?.key === key)
    if (i >= 0) return [b, i]
  }
  return group ? findTask(bs, key) : null
}

function insertTask(b: Block, line: string) {
  const ls = trimBlank(b.lines)
  // 放在最后一个未完成任务之后；没有就放在目标行之后、已完成任务之前
  let at = -1
  ls.forEach((l, i) => {
    const t = parseTask(l)
    if (t && !t.done) at = i
  })
  if (at < 0) {
    at = ls.findIndex((l) => parseTask(l)) - 1
    if (at < -1) at = ls.length - 1
  }
  ls.splice(at + 1, 0, line)
  b.lines = ls
}

export function withDate(key: string, date: string): string {
  const base = key.replace(new RegExp(DATE.source, 'g'), ' ').replace(/\s+/g, ' ').trim()
  return date ? `${base} @${date}` : base
}

export const addTask = (md: string | null, text: string, group = INBOX, date = '') =>
  edit(md, (bs) => insertTask(ensureBlock(bs, group), `- [ ] ${withDate(oneLine(text), date)}`))

export const toggleTask = (md: string | null, key: string, today: string, group?: string) =>
  edit(md, (bs) => {
    const f = findTask(bs, key, group)
    if (!f) return
    const t = parseTask(f[0].lines[f[1]])!
    f[0].lines[f[1]] = t.done ? `- [ ] ${t.key}` : `- [x] ${t.key} ✓${today}`
  })

export const setTaskDate = (md: string | null, key: string, date: string, group?: string) =>
  edit(md, (bs) => {
    const f = findTask(bs, key, group)
    if (!f) return
    const t = parseTask(f[0].lines[f[1]])!
    f[0].lines[f[1]] = `- [${t.done ? 'x' : ' '}] ${withDate(t.key, date)}${t.done ? ` ✓${t.doneOn}` : ''}`
  })

export const editTask = (md: string | null, key: string, text: string, group?: string) =>
  edit(md, (bs) => {
    const f = findTask(bs, key, group)
    if (!f || !oneLine(text)) return
    const t = parseTask(f[0].lines[f[1]])!
    f[0].lines[f[1]] = `- [${t.done ? 'x' : ' '}] ${oneLine(text)}${t.done ? ` ✓${t.doneOn}` : ''}`
  })

export const moveTask = (md: string | null, key: string, to: string, group?: string) =>
  edit(md, (bs) => {
    const f = findTask(bs, key, group)
    if (!f || f[0].title === to) return
    const [line] = f[0].lines.splice(f[1], 1)
    insertTask(ensureBlock(bs, to), line)
  })

export const deleteTask = (md: string | null, key: string, group?: string) =>
  edit(md, (bs) => {
    const f = findTask(bs, key, group)
    if (f) f[0].lines.splice(f[1], 1)
  })

export const addProject = (md: string | null, name: string, goal = '') =>
  edit(md, (bs) => {
    const b = ensureBlock(bs, oneLine(name))
    if (goal.trim() && !b.lines.some((l) => /^>\s?/.test(l))) b.lines.unshift(`> ${oneLine(goal)}`)
  })

export const renameProject = (md: string | null, from: string, to: string) =>
  edit(md, (bs) => {
    const name = oneLine(to)
    if (!name || kindOf(from) !== 'project' || kindOf(name) !== 'project' || bs.some((b) => b.title === name)) return
    const b = bs.find((x) => x.title === from)
    if (b) b.title = name
  })

export const setProjectGoal = (md: string | null, name: string, goal: string) =>
  edit(md, (bs) => {
    const b = ensureBlock(bs, name)
    const ls = trimBlank(b.lines).filter((l) => !/^>\s?/.test(l))
    b.lines = goal.trim() ? [`> ${oneLine(goal)}`, ...ls] : ls
  })

/** 只能删除没有未完成任务的项目；已完成的任务一并删除 */
export const deleteProject = (md: string | null, name: string) =>
  edit(md, (bs) => {
    const i = bs.findIndex((b) => b.title === name)
    if (i < 0 || kindOf(name) !== 'project') return
    if (bs[i].lines.some((l) => parseTask(l)?.done === false)) return
    bs.splice(i, 1)
  })
