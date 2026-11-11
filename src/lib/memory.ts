/**
 * memory/ —— AI 维护的记忆层（见数据仓库的 AGENTS.md）。
 *   timeline.md   大事记：只读，按 Markdown 显示
 *   patterns.md   模式账本：每个 `## 标题` 是一条假设，「状态：」一行由主人裁决
 *   proposals.md  提议：编号的列表项，主人处理完一条就删一条
 * App 只做两种写入：改一条模式的状态、删一条提议。都是 (旧文本) => 新文本，其余内容逐字保留。
 */
import { getMeta, setMeta, stripFrontmatter } from './md'

export const TIMELINE = 'memory/timeline.md'
export const PATTERNS = 'memory/patterns.md'
export const PROPOSALS = 'memory/proposals.md'

export const STATUSES = ['观察中', '成立', '推翻'] as const
export type PatternStatus = (typeof STATUSES)[number]

export interface Pattern {
  /** 完整的标题行（不含 ##），用作标识 */
  heading: string
  /** P1、P2……没有编号时为空 */
  id: string
  title: string
  status: PatternStatus | ''
  /** 「状态：」那一行里状态后面的说明 */
  note: string
  /** 去掉状态行后的正文 */
  body: string
}

const STATUS_LINE = /^状态[:：]\s*(\S+)\s*(.*)$/
const RULED = /\s*·?\s*主人裁决 \d{4}-\d{2}-\d{2}/

interface Block {
  heading: string | null
  lines: string[]
}

const split = (md: string): Block[] => {
  const out: Block[] = [{ heading: null, lines: [] }]
  for (const l of md.replace(/\r\n/g, '\n').split('\n')) {
    const h = l.match(/^##\s+(.+?)\s*$/)
    if (h) out.push({ heading: h[1], lines: [] })
    else out[out.length - 1].lines.push(l)
  }
  return out
}
const join = (bs: Block[]) => bs.map((b) => (b.heading === null ? b.lines : [`## ${b.heading}`, ...b.lines]).join('\n')).join('\n')

export function parsePatterns(md: string | null | undefined): Pattern[] {
  return split(stripFrontmatter(md ?? ''))
    .filter((b) => b.heading !== null)
    .map((b) => {
      const heading = b.heading!
      const m = heading.match(/^(P\d+)\s+(.*)$/)
      const i = b.lines.findIndex((l) => STATUS_LINE.test(l))
      const s = i >= 0 ? b.lines[i].match(STATUS_LINE)! : null
      const status = s && (STATUSES as readonly string[]).includes(s[1]) ? (s[1] as PatternStatus) : ''
      return {
        heading,
        id: m?.[1] ?? '',
        title: m?.[2] ?? heading,
        status,
        note: (s?.[2] ?? '').replace(/^·\s*/, '').trim(),
        body: b.lines.filter((_, j) => j !== i).join('\n').trim(),
      }
    })
}

/** 主人裁决一条模式：改状态，并在状态行记下是哪天由主人定的（改回「观察中」则去掉这个记号） */
export function setPatternStatus(md: string, heading: string, status: PatternStatus, date: string): string {
  const bs = split(md)
  const b = bs.find((x) => x.heading === heading)
  if (!b) return md
  const i = b.lines.findIndex((l) => STATUS_LINE.test(l))
  const rest = i >= 0 ? b.lines[i].match(STATUS_LINE)![2].replace(RULED, '').replace(/^·\s*/, '').trim() : ''
  const line = [`状态：${status}`, rest, status === '观察中' ? '' : `主人裁决 ${date}`].filter(Boolean).join(' · ')
  if (i >= 0) b.lines[i] = line
  else {
    while (b.lines.length && b.lines[0].trim() === '') b.lines.shift()
    b.lines.unshift('', line, '')
  }
  const out = join(bs)
  return getMeta(out, 'updated') ? setMeta(out, 'updated', date) : out
}

export interface Proposal {
  /** 文件里的编号 */
  n: number
  /** 所在小节的标题 */
  section: string
  /** 第一行（不含编号），用作标识 */
  key: string
  /** 整条内容（不含编号），Markdown */
  text: string
}

const ITEM = /^(\d+)\.\s+(.*)$/

function proposalRanges(ls: string[]): (Proposal & { from: number; to: number })[] {
  const out: (Proposal & { from: number; to: number })[] = []
  let section = ''
  let fm = ls[0]?.trim() === '---'
  for (let i = fm ? 1 : 0; i < ls.length; i++) {
    if (fm) {
      if (ls[i].trim() === '---') fm = false
      continue
    }
    const h = ls[i].match(/^##\s+(.+?)\s*$/)
    if (h) {
      section = h[1]
      continue
    }
    const m = ls[i].match(ITEM)
    if (!m) continue
    let to = i + 1
    // 缩进的续行、紧跟的非空行都算这一条；空行之后必须缩进才继续
    while (to < ls.length && !ITEM.test(ls[to]) && !/^#{1,6}\s/.test(ls[to]) && (ls[to].trim() === '' ? /^\s+\S/.test(ls[to + 1] ?? '') : true)) to++
    const body = [m[2], ...ls.slice(i + 1, to).map((l) => l.replace(/^ {1,3}/, ''))].join('\n').trim()
    out.push({ n: Number(m[1]), section, key: m[2].trim(), text: body, from: i, to })
    i = to - 1
  }
  return out
}

export function parseProposals(md: string | null | undefined): Proposal[] {
  return proposalRanges((md ?? '').replace(/\r\n/g, '\n').split('\n')).map(({ from: _f, to: _t, ...p }) => p)
}

/** 删掉一条提议（已处理或不采纳）。不重新编号：「第 N 条」在对话里还要能对上 */
export function removeProposal(md: string, key: string, date: string): string {
  const ls = md.replace(/\r\n/g, '\n').split('\n')
  const hit = proposalRanges(ls).find((p) => p.key === key)
  if (!hit) return md
  let to = hit.to
  while (to < ls.length && ls[to].trim() === '' && ls[hit.from - 1]?.trim() === '') to++
  ls.splice(hit.from, to - hit.from)
  const out = ls.join('\n')
  return getMeta(out, 'updated') ? setMeta(out, 'updated', date) : out
}
