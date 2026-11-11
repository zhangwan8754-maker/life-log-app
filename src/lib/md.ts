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

const noteRe = /^[-*]\s+(?:(\d{1,2}:\d{2})\s+)?(.*)$/

export function parseNotes(md: string): Note[] {
  const sec = getSection(md, '速记')
  if (!sec) return []
  const out: Note[] = []
  for (const l of sec.split('\n')) {
    const m = l.match(noteRe)
    if (m && m[2].trim()) out.push({ time: m[1] ?? '', text: m[2].trim() })
  }
  return out
}

const noteLine = (time: string, text: string) => `- ${time ? `${time} ` : ''}${oneLine(text)}`

export function appendNote(md: string, time: string, text: string): string {
  return insertLine(md, '速记', noteLine(time, text))
}

/** 找到「速记」小节里第一条时间和内容都对得上的行 */
function findNote(ls: string[], time: string, text: string): number {
  const r = sectionRange(ls, '速记')
  if (!r) return -1
  for (let i = r[0] + 1; i < r[1]; i++) {
    const m = ls[i].match(noteRe)
    if (m && (m[1] ?? '') === time && m[2].trim() === text) return i
  }
  return -1
}

export function editNote(md: string, time: string, text: string, next: string): string {
  const ls = lines(md)
  const i = findNote(ls, time, text)
  if (i < 0 || !oneLine(next)) return md
  ls[i] = noteLine(time, next)
  return ls.join('\n')
}

export function deleteNote(md: string, time: string, text: string): string {
  const ls = lines(md)
  const i = findNote(ls, time, text)
  if (i < 0) return md
  ls.splice(i, 1)
  return ls.join('\n')
}

/** 撤销删除：按时间顺序插回原来的位置 */
export function restoreNote(md: string, time: string, text: string): string {
  const ls = lines(md)
  const r = sectionRange(ls, '速记')
  if (!r || findNote(ls, time, text) >= 0) return r ? md : appendNote(md, time, text)
  for (let i = r[0] + 1; i < r[1]; i++) {
    const m = ls[i].match(noteRe)
    if (m && m[2].trim() && (m[1] ?? '') > time) {
      ls.splice(i, 0, noteLine(time, text))
      return ls.join('\n')
    }
  }
  return insertLine(md, '速记', noteLine(time, text))
}

export const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim()

/** 解析 1–10 分，空或非法返回 null */
export function score(v: string): number | null {
  const n = Number(v)
  return v !== '' && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null
}

// ───────────── 速记的三种开头（都可选）─────────────
// 投入：英语 1h，跑步 40min —— 时间花在哪；学到：…… —— 教训或发现；问题：…… —— 答不上来的问题

export type NoteKind = 'plain' | 'spent' | 'learned' | 'question'
export const KIND_LABEL: Record<Exclude<NoteKind, 'plain'>, string> = { spent: '投入', learned: '学到', question: '问题' }
const KIND_OF: Record<string, NoteKind> = { 投入: 'spent', 学到: 'learned', 问题: 'question' }

/** 速记属于哪一种，以及去掉开头后的内容 */
export function noteKind(text: string): { kind: NoteKind; body: string } {
  const m = text.match(/^(投入|学到|问题)(?:[:：]\s*|\s+)(.*)$/)
  return m ? { kind: KIND_OF[m[1]], body: m[2].trim() } : { kind: 'plain', body: text }
}

export const withKind = (kind: NoteKind, body: string) => (kind === 'plain' ? body : `${KIND_LABEL[kind]}：${body}`)

export interface Spent {
  name: string
  hours: number
}

const SPENT_PART = /^(.*?)[\s:：]*(\d+(?:\.\d+)?)\s*(h|hr|小时|个小时|min|m|分钟|分)$/i

/** 「投入：英语 1h，读书 40min」→ 各项时长；不是投入速记返回 null。bad 是认不出时长的片段 */
export function parseSpent(text: string): { items: Spent[]; bad: string[] } | null {
  const k = noteKind(text)
  if (k.kind !== 'spent') return null
  const items: Spent[] = []
  const bad: string[] = []
  for (const part of k.body.split(/[，,、；;]/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(SPENT_PART)
    const name = m?.[1].trim()
    if (!m || !name) {
      bad.push(part)
      continue
    }
    const n = Number(m[2])
    const hours = /^(h|hr|小时|个小时)$/i.test(m[3]) ? n : n / 60
    const cur = items.find((x) => x.name === name)
    if (cur) cur.hours += hours
    else items.push({ name, hours })
  }
  return { items, bad }
}

/** 把若干条投入按名称合并，时长多的在前 */
export function sumSpent(lists: Spent[][]): Spent[] {
  const out: Spent[] = []
  for (const s of lists.flat()) {
    const cur = out.find((x) => x.name === s.name)
    if (cur) cur.hours += s.hours
    else out.push({ ...s })
  }
  return out.sort((a, b) => b.hours - a.hours)
}

/** 一天的投入合计 */
export const daySpent = (md: string): Spent[] => sumSpent(parseNotes(md).map((n) => parseSpent(n.text)?.items ?? []))

/** 1.5 → 1.5h，0.666 → 0.7h */
export const fmtHours = (h: number) => `${Math.round(h * 10) / 10}h`

/** 写进速记的时长：60 → 1h，90 → 1.5h，40 → 40min */
export const fmtMinutes = (min: number) => (min % 30 === 0 && min >= 60 ? `${min / 60}h` : `${min}min`)

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
