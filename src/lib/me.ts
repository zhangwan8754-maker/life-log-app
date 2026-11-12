/**
 * me.md（我是谁）的结构：五个问题。
 *   现在 —— 我在哪（只写事实）
 *   在乎 —— 我的尺子：让我有劲的 / 耗我的 / 好的一天
 *   方向 —— 这学期 / 每周投入（每科一周打算投入几小时，见 targets.ts）/ 毕业时 / 更远
 *   做法 —— 验证过的 / 借来的（读到、听到，还没自己试过）
 *   还没想清楚 —— 答不上来、但想弄明白的问题
 * 引导问题只在 App 里显示，不写进文件。写操作是纯函数 (旧文本) => 新文本：
 * 只改一栏，其余内容逐字保留；用户自己加的栏目也保留。
 */
import { getMeta, setMeta, stripFrontmatter } from './md'

export interface FieldDef {
  /** 小栏标题；空字符串表示这一栏没有小栏，整栏就是一个输入 */
  sub: string
  hint: string
  /** 可填可不填：不算进「已填 x / y」 */
  optional?: boolean
}
export interface SectionDef {
  title: string
  note: string
  fields: FieldDef[]
}

export const ME_SECTIONS: SectionDef[] = [
  { title: '现在', note: '事实', fields: [{ sub: '', hint: '只写事实：阶段、专业和年级、城市、正在学什么、身边重要的人。' }] },
  {
    title: '在乎',
    note: '我的尺子',
    fields: [
      { sub: '让我有劲的', hint: '做什么的时候不觉得累、过后还想再做？' },
      { sub: '耗我的', hint: '什么事做完会觉得空、觉得被消耗？' },
      { sub: '好的一天', hint: '按我自己的标准，怎样算过得好的一天？这是和自己比的尺子。' },
    ],
  },
  {
    title: '方向',
    note: '',
    fields: [
      { sub: '这学期', hint: '这学期结束时，我希望哪几件事是真的做成了？' },
      { sub: '每周投入', hint: '每科一周打算投入多少小时？复盘时拿实际记下的投入来对。', optional: true },
      { sub: '毕业时', hint: '毕业那天，我想成为什么样、手里有什么？' },
      { sub: '更远', hint: '只是猜想，写错了随时改。' },
    ],
  },
  {
    title: '做法',
    note: '',
    fields: [
      { sub: '验证过的', hint: '我亲自试过、确实有用的做法，写上日期或事例。' },
      { sub: '借来的', hint: '读到、听到、觉得对，但还没自己验证的话；验证了再搬到上面。' },
    ],
  },
  { title: '还没想清楚', note: '', fields: [{ sub: '', hint: '我现在答不上来、但想弄明白的问题。' }] },
]

/** 旧模板的六栏：完全空着时会被清掉，有内容就原样保留 */
const LEGACY = ['价值观', '长期目标（3–5 年）', '今年', '原则', '当前关注', '已知的我']

// ───── 分块 ─────

interface Sub {
  title: string
  lines: string[]
}
interface Section {
  title: string
  /** 第一个 ### 之前的内容 */
  intro: string[]
  subs: Sub[]
}
interface Doc {
  fm: string
  preamble: string[]
  sections: Section[]
}

const trimBlank = (ls: string[]) => {
  let a = 0
  let b = ls.length
  while (a < b && !ls[a].trim()) a++
  while (b > a && !ls[b - 1].trim()) b--
  return ls.slice(a, b)
}
const text = (ls: string[]) => trimBlank(ls).join('\n')
/** 只有注释、空行和孤零零的「-」，算没写 */
const isBlank = (s: string) => !s.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*[-*]\s*$/gm, '').trim()

function toDoc(md: string): Doc {
  const src = md.replace(/\r\n/g, '\n')
  const body = stripFrontmatter(src)
  const doc: Doc = { fm: src.slice(0, src.length - body.length), preamble: [], sections: [] }
  let sec: Section | null = null
  let sub: Sub | null = null
  for (const l of body.split('\n')) {
    const h2 = l.match(/^##\s+(.+?)\s*$/)
    const h3 = l.match(/^###\s+(.+?)\s*$/)
    if (h2) {
      sec = { title: h2[1], intro: [], subs: [] }
      sub = null
      doc.sections.push(sec)
    } else if (h3 && sec) {
      sub = { title: h3[1], lines: [] }
      sec.subs.push(sub)
    } else if (sub) sub.lines.push(l)
    else if (sec) sec.intro.push(l)
    else doc.preamble.push(l)
  }
  return doc
}

const def = (title: string) => ME_SECTIONS.find((s) => s.title === title)
const single = (d: SectionDef) => d.fields.length === 1 && d.fields[0].sub === ''
/** 没有小栏的栏目：整栏（含里面手写的 ###）都是它的内容 */
const wholeText = (s: Section) => text([...s.intro, ...s.subs.flatMap((x) => [`### ${x.title}`, ...x.lines])])
const sectionBlank = (s: Section) => isBlank(wholeText(s))

function fromDoc(doc: Doc): string {
  const parts: string[] = []
  const pre = text(doc.preamble)
  parts.push(/^#\s/m.test(pre) ? pre : ['# 我是谁', pre].filter(Boolean).join('\n\n'))
  const block = (heading: string, body: string) => (body ? `${heading}\n\n${body}` : heading)

  for (const d of ME_SECTIONS) {
    const s = doc.sections.find((x) => x.title === d.title)
    if (single(d)) {
      parts.push(block(`## ${d.title}`, s ? wholeText(s) : ''))
      continue
    }
    parts.push(block(`## ${d.title}`, s ? text(s.intro) : ''))
    for (const f of d.fields) parts.push(block(`### ${f.sub}`, text(s?.subs.find((x) => x.title === f.sub)?.lines ?? [])))
    // 用户在这一栏里自己加的小栏
    for (const x of s?.subs ?? []) if (!d.fields.some((f) => f.sub === x.title)) parts.push(block(`### ${x.title}`, text(x.lines)))
  }
  // 不认识的栏目原样放在最后；旧模板里空着的清掉
  for (const s of doc.sections) {
    if (def(s.title)) continue
    if (LEGACY.includes(s.title) && sectionBlank(s)) continue
    parts.push(block(`## ${s.title}`, wholeText(s)))
  }
  return doc.fm + parts.join('\n\n') + '\n'
}

export function emptyMe(): string {
  return fromDoc({ fm: '---\nupdated:\n---\n', preamble: [], sections: [] })
}

// ───── 读 ─────

export interface MeField extends FieldDef {
  section: string
  text: string
}
export interface MeGroup {
  title: string
  note: string
  fields: MeField[]
}
export interface Me {
  updated: string
  groups: MeGroup[]
  /** 不属于五栏的内容：用户手写的栏目、旧模板里已经写了字的栏目 */
  extras: { title: string; text: string }[]
  filled: number
  total: number
}

export function parseMe(md: string | null | undefined): Me {
  const doc = toDoc(md ?? '')
  const extras: Me['extras'] = []
  const groups = ME_SECTIONS.map((d) => {
    const s = doc.sections.find((x) => x.title === d.title)
    const fields = d.fields.map((f) => {
      const raw = !s ? '' : single(d) ? wholeText(s) : text(s.subs.find((x) => x.title === f.sub)?.lines ?? [])
      return { ...f, section: d.title, text: isBlank(raw) ? '' : raw }
    })
    if (s && !single(d)) {
      if (!isBlank(text(s.intro))) extras.push({ title: d.title, text: text(s.intro) })
      for (const x of s.subs) if (!d.fields.some((f) => f.sub === x.title) && !isBlank(text(x.lines))) extras.push({ title: `${d.title} · ${x.title}`, text: text(x.lines) })
    }
    return { title: d.title, note: d.note, fields }
  })
  for (const s of doc.sections) if (!def(s.title) && !sectionBlank(s)) extras.push({ title: s.title, text: wholeText(s) })
  const all = groups.flatMap((g) => g.fields).filter((f) => !f.optional)
  return { updated: getMeta(md ?? '', 'updated'), groups, extras, filled: all.filter((f) => f.text).length, total: all.length }
}

/** 每周复盘用来对照的近期方向：「方向 · 这学期」；没写时回退到旧模板的「今年」 */
export function termGoals(md: string | null | undefined): string {
  const me = parseMe(md)
  const now = me.groups.find((g) => g.title === '方向')?.fields.find((f) => f.sub === '这学期')?.text
  return now || me.extras.find((e) => e.title === '今年')?.text.replace(/^\s*[-*]\s*$/gm, '').trim() || ''
}

// ───── 写 ─────

/** 只改一栏。缺的栏目按顺序补齐，`updated` 更新为 date。 */
export function setMeField(md: string | null, section: string, sub: string, value: string, date: string): string {
  const d = def(section)
  const doc = toDoc(md ?? emptyMe())
  if (!d || !d.fields.some((f) => f.sub === sub)) return md ?? emptyMe()
  let s = doc.sections.find((x) => x.title === section)
  if (!s) doc.sections.push((s = { title: section, intro: [], subs: [] }))
  // 内容里的大标题会被当成新栏目，统一降成小标题
  const lines = value
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
    .map((l) => l.replace(/^#{1,3}(?=\s)/, '####'))
  if (single(d)) {
    s.intro = lines
    s.subs = []
  } else {
    const x = s.subs.find((y) => y.title === sub)
    if (x) x.lines = lines
    else s.subs.push({ title: sub, lines })
  }
  return setMeta(fromDoc(doc), 'updated', date)
}
