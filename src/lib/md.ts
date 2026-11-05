/**
 * 纯函数：读写 life-log 的 Markdown 约定（见仓库根目录 AGENTS.md）。
 * 所有写操作都是 (旧文本) => 新文本，只改动必要的行，保留用户手写的其余内容。
 */

const lines = (md: string) => md.replace(/\r\n/g, '\n').split('\n')

// ───────────── frontmatter ─────────────

function fmRange(ls: string[]): [number, number] | null {
  if (ls[0]?.trim() !== '---') return null
  for (let i = 1; i < ls.length; i++) if (ls[i].trim() === '---') return [0, i]
  return null
}

const metaRe = (key: string) => new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*(#.*)?$`)

export function getMeta(md: string, key: string): string {
  const ls = lines(md)
  const r = fmRange(ls)
  if (!r) return ''
  for (let i = r[0] + 1; i < r[1]; i++) {
    const m = ls[i].match(metaRe(key))
    if (m) return m[1]
  }
  return ''
}

export function setMeta(md: string, key: string, value: string): string {
  const ls = lines(md)
  const r = fmRange(ls)
  if (!r) return `---\n${key}: ${value}\n---\n${md}`
  for (let i = r[0] + 1; i < r[1]; i++) {
    const m = ls[i].match(metaRe(key))
    if (m) {
      ls[i] = `${key}:${value === '' ? '' : ' ' + value}${m[2] ? '        ' + m[2] : ''}`
      return ls.join('\n')
    }
  }
  ls.splice(r[1], 0, `${key}: ${value}`)
  return ls.join('\n')
}

export function stripFrontmatter(md: string): string {
  const ls = lines(md)
  const r = fmRange(ls)
  return r ? ls.slice(r[1] + 1).join('\n') : md
}

// ───────────── sections (## 标题) ─────────────

function sectionRange(ls: string[], title: string): [number, number] | null {
  const start = ls.findIndex((l) => l.trim() === `## ${title}`)
  if (start < 0) return null
  let end = start + 1
  while (end < ls.length && !/^##?\s/.test(ls[end])) end++
  return [start, end] // 内容为 (start, end)
}

export function getSection(md: string, title: string): string | null {
  const ls = lines(md)
  const r = sectionRange(ls, title)
  return r ? ls.slice(r[0] + 1, r[1]).join('\n').trim() : null
}

export function setSection(md: string, title: string, text: string): string {
  const ls = lines(md)
  const r = sectionRange(ls, title)
  const body = text.trim()
  const block = body ? ['', body, ''] : ['']
  if (!r) return `${md.replace(/\n*$/, '')}\n\n## ${title}\n${block.join('\n')}`
  ls.splice(r[0] + 1, r[1] - r[0] - 1, ...block)
  return ls.join('\n')
}

/** 在小节末尾（或开头）插入一行 */
export function insertLine(md: string, title: string, line: string, at: 'end' | 'start' = 'end'): string {
  const ls = lines(md)
  const r = sectionRange(ls, title)
  if (!r) return `${md.replace(/\n*$/, '')}\n\n## ${title}\n\n${line}\n`
  const [s, e] = r
  let idx: number
  if (at === 'start') {
    idx = s + 1
    while (idx < e && ls[idx].trim() === '') idx++
    if (idx === e) {
      // 空小节
      ls.splice(s + 1, e - s - 1, '', line, '')
      return ls.join('\n')
    }
  } else {
    idx = e
    while (idx > s + 1 && ls[idx - 1].trim() === '') idx--
    if (idx === s + 1) {
      ls.splice(s + 1, e - s - 1, '', line, '')
      return ls.join('\n')
    }
  }
  ls.splice(idx, 0, line)
  return ls.join('\n')
}

// ───────────── 每日文件 ─────────────

export function newDay(date: string): string {
  return `---\ndate: ${date}\nmood:\nenergy:\ntags: []\n---\n## 日记\n\n## 速记\n`
}

export interface Note {
  time: string
  text: string
}

export function parseNotes(md: string): Note[] {
  const sec = getSection(md, '速记')
  if (!sec) return []
  const out: Note[] = []
  for (const l of sec.split('\n')) {
    const m = l.match(/^[-*]\s+(?:(\d{1,2}:\d{2})\s+)?(.*)$/)
    if (m && m[2].trim()) out.push({ time: m[1] ?? '', text: m[2].trim() })
  }
  return out
}

export function appendNote(md: string, time: string, text: string): string {
  return insertLine(md, '速记', `- ${time} ${oneLine(text)}`)
}

export const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

/** 解析 1–10 分，空或非法返回 null */
export function score(v: string): number | null {
  const n = Number(v)
  return v !== '' && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null
}

// ───────────── 待办 ─────────────

export const TODO_SECTIONS = ['现在', '之后', '完成'] as const
export type TodoSection = (typeof TODO_SECTIONS)[number]

export interface Todo {
  done: boolean
  /** 去掉复选框和完成标记后的文本，用作标识 */
  key: string
  text: string
  due: string
  tags: string[]
  doneOn: string
}

const itemRe = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/

function parseItem(line: string): Todo | null {
  const m = line.match(itemRe)
  if (!m) return null
  let rest = m[2]
  let doneOn = ''
  rest = rest.replace(/\s*✓(\d{4}-\d{2}-\d{2})\s*$/, (_, d) => ((doneOn = d), ''))
  const key = rest.trim()
  const due = key.match(/(?:^|\s)@(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? ''
  const tags = [...key.matchAll(/(?:^|\s)#([^\s#]+)/g)].map((x) => x[1])
  const text = key
    .replace(/(?:^|\s)@\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/(?:^|\s)#[^\s#]+/g, '')
    .trim()
  return { done: m[1] !== ' ', key, text, due, tags, doneOn }
}

export function parseTodos(md: string): Record<TodoSection, Todo[]> {
  const out = { 现在: [], 之后: [], 完成: [] } as Record<TodoSection, Todo[]>
  let cur: TodoSection | null = null
  for (const l of lines(md)) {
    const h = l.match(/^##\s+(.+?)\s*$/)
    if (h) {
      cur = (TODO_SECTIONS as readonly string[]).includes(h[1]) ? (h[1] as TodoSection) : null
      continue
    }
    const it = cur && parseItem(l)
    if (it) out[cur!].push(it)
  }
  return out
}

export function emptyTodo(): string {
  return `# 待办\n\n## 现在\n\n## 之后\n\n## 完成\n`
}

function removeItem(md: string, key: string): [string, Todo | null] {
  const ls = lines(md)
  const i = ls.findIndex((l) => parseItem(l)?.key === key)
  if (i < 0) return [md, null]
  const it = parseItem(ls[i])
  ls.splice(i, 1)
  return [ls.join('\n').replace(/\n{3,}/g, '\n\n'), it]
}

export function addTodo(md: string, text: string, section: TodoSection = '现在'): string {
  return insertLine(md, section, `- [ ] ${oneLine(text)}`)
}

export function toggleTodo(md: string, key: string, today: string): string {
  const [rest, it] = removeItem(md, key)
  if (!it) return md
  return it.done
    ? insertLine(rest, '现在', `- [ ] ${it.key}`)
    : insertLine(rest, '完成', `- [x] ${it.key} ✓${today}`, 'start')
}

export function moveTodo(md: string, key: string, section: TodoSection): string {
  const [rest, it] = removeItem(md, key)
  if (!it) return md
  return insertLine(rest, section, `- [ ] ${it.key}`, section === '现在' ? 'end' : 'start')
}

export function deleteTodo(md: string, key: string): string {
  return removeItem(md, key)[0]
}

// ───────────── 思想 ─────────────

export function safeTitle(s: string): string {
  return oneLine(s).replace(/[\\/:*?"<>|#\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

export function newThought(title: string, body: string, date: string, from = ''): string {
  return `---\ncreated: ${date}\ntags: []\nfrom: ${from}\n---\n# ${title}\n\n${body.trim()}\n`
}

/** 思想卡片正文（去掉 frontmatter 和一级标题） */
export function thoughtBody(md: string): string {
  return stripFrontmatter(md).replace(/^\s*# .*\n?/, '').trim()
}

export function setThoughtBody(md: string, title: string, body: string): string {
  const ls = lines(md)
  const r = fmRange(ls)
  const fm = r ? ls.slice(0, r[1] + 1).join('\n') + '\n' : ''
  return `${fm}# ${title}\n\n${body.trim()}\n`
}
