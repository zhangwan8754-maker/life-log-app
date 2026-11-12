import { useEffect, useState } from 'preact/hooks'
import { addDays, cnMonthDay, parseYmd, shortWeekday, weekday, ymd } from '../lib/dates'
import { useStore, useToday, useTree } from '../lib/hooks'
import { daySpent, fmtHours, getMeta, getSection, noteKind, parseNotes, score, stripFrontmatter, thoughtBody, type NoteKind } from '../lib/md'
import { parsePatterns, PATTERNS, STATUSES, TIMELINE, type Pattern } from '../lib/memory'
import { store } from '../lib/store'
import { cx, go, markdown } from '../lib/ui'
import { Chip, ListRow, Tabs } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Empty, Page } from '../components/Page'
import { NoteRow } from '../components/NoteSheet'
import { Sheet } from '../components/Sheet'
import { spentTotal } from '../components/Spent'
import { tagsOf, titleOf } from './ThoughtPage'

export type MemorySeg = 'timeline' | 'notes' | 'thoughts' | 'patterns'
interface DayDoc {
  date: string
  md: string
}

const excerpt = (md: string) => thoughtBody(md).replace(/^[\s>#*-]+/gm, '').replace(/[*_`[\]]/g, '').replace(/\s+/g, ' ').slice(0, 80)
const journalOf = (md: string) => (getSection(md, '日记') ?? '').replace(/\s+/g, ' ').trim()

/**
 * 记忆：想得起。
 *   时间线 —— 过去的每一天，以及「那时的今天」
 *   速记   —— 所有速记，可以只看「学到」或「问题」
 *   思想   —— 沉淀下来的卡片
 *   模式   —— AI 记下的假设，由我裁决
 * 顶上的搜索同时找思想、速记和日记。
 */
export function MemoryPage({ seg }: { seg: MemorySeg }) {
  const s = useStore()
  const loaded = useTree('days/', 'thoughts/', 'memory/')
  const [q, setQ] = useState('')

  const thoughts = s
    .list('thoughts/')
    .map((p) => ({ p, md: s.read(p) ?? '' }))
    .sort((a, b) => (getMeta(b.md, 'created') || '').localeCompare(getMeta(a.md, 'created') || ''))
  const days: DayDoc[] = s
    .list('days/')
    .map((p) => ({ date: p.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? '', md: s.read(p) ?? '' }))
    .filter((d) => d.date)
    .sort((a, b) => b.date.localeCompare(a.date))
  const patterns = parsePatterns(s.read(PATTERNS))

  return (
    <Page
      title="记忆"
      icon="memory"
      actions={
        <a class="icon-btn" href="#/thought/new" aria-label="新建思想">
          <Icon name="edit" size={21} />
        </a>
      }
    >
      <label class="search">
        <Icon name="search" size={19} />
        <input type="search" value={q} placeholder="搜索思想、速记、日记" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      {q.trim() ? (
        <Results q={q.trim()} thoughts={thoughts} days={days} />
      ) : (
        <>
          <div class="notes-tabs">
            <Tabs
              value={seg}
              options={[
                { value: 'timeline', label: '时间线' },
                { value: 'notes', label: '速记' },
                { value: 'thoughts', label: '思想' },
                { value: 'patterns', label: '模式' },
              ]}
              onChange={(v) => go(v === 'timeline' ? '#/memory' : `#/memory/${v}`)}
            />
          </div>
          {seg === 'timeline' && <Timeline days={days} loaded={loaded} hasAiTimeline={!!s.read(TIMELINE)} />}
          {seg === 'notes' && <NoteStream days={days} />}
          {seg === 'thoughts' && <Thoughts thoughts={thoughts} loaded={loaded} />}
          {seg === 'patterns' && <Patterns patterns={patterns} loaded={loaded} />}
        </>
      )}
    </Page>
  )
}

// ───── 时间线 ─────

type Filter = 'notes' | 'learned' | 'question'
const FILTERS: [Filter, string][] = [
  ['notes', '全部'],
  ['learned', '学到'],
  ['question', '问题'],
]
const PAGE = 45

/** 一周前、一个月前、一年前的今天 */
function recall(today: string, days: DayDoc[]): { label: string; day: DayDoc }[] {
  const t = parseYmd(today)
  const sameDay = (y: number, m: number) => {
    const d = new Date(y, m, t.getDate())
    return d.getDate() === t.getDate() ? ymd(d) : ''
  }
  const targets: [string, string][] = [
    ['一周前', addDays(today, -7)],
    ['一个月前', sameDay(t.getFullYear(), t.getMonth() - 1)],
    ['一年前', sameDay(t.getFullYear() - 1, t.getMonth())],
  ]
  return targets.flatMap(([label, date]) => {
    const day = days.find((d) => d.date === date)
    return day && (journalOf(day.md) || parseNotes(day.md).length) ? [{ label, day }] : []
  })
}

function DayCard({ day, label }: { day: DayDoc; label?: string }) {
  const journal = journalOf(day.md)
  const notes = parseNotes(day.md)
  const plain = notes.filter((n) => noteKind(n.text).kind !== 'spent')
  const spent = spentTotal(daySpent(day.md))
  const mood = score(getMeta(day.md, 'mood'))
  const energy = score(getMeta(day.md, 'energy'))
  const meta = [plain.length && `${plain.length} 条速记`, spent && `投入 ${fmtHours(spent)}`].filter(Boolean).join(' · ')
  return (
    <a class="row day-card" href={`#/day/${day.date}`}>
      <span class="day-date">
        {label ? <small class="accent">{label}</small> : <b>{Number(day.date.slice(8))}</b>}
        <small>{label ? cnMonthDay(day.date) : shortWeekday(day.date)}</small>
      </span>
      <span class="day-main">
        <span class={cx('day-excerpt', !journal && 'muted')}>{journal || noteKind(plain[0]?.text ?? '').body || '只有打分'}</span>
        {meta && <span class="day-meta">{meta}</span>}
      </span>
      {(mood !== null || energy !== null) && (
        <span class="day-scores" aria-label={`情绪 ${mood ?? '无'}，精力 ${energy ?? '无'}`}>
          <i class={cx('mood', mood === null && 'none')}>{mood ?? '·'}</i>
          <i class={cx('energy', energy === null && 'none')}>{energy ?? '·'}</i>
        </span>
      )}
    </a>
  )
}

function Timeline({ days, loaded, hasAiTimeline }: { days: DayDoc[]; loaded: boolean; hasAiTimeline: boolean }) {
  const today = useToday()
  const [shown, setShown] = useState(PAGE)
  const back = recall(today, days)
  const page = days.slice(0, shown)
  const months = [...new Set(page.map((d) => d.date.slice(0, 7)))]
  return (
    <>
      {back.length > 0 && (
        <>
          <p class="group-label">那时的今天</p>
          <div class="group recall">
            {back.map((b) => (
              <DayCard day={b.day} label={b.label} />
            ))}
          </div>
        </>
      )}
      {months.map((m) => (
        <>
          <p class="group-label">
            {m.slice(0, 4)} 年 {Number(m.slice(5))} 月
          </p>
          <div class="group">
            {page
              .filter((d) => d.date.startsWith(m))
              .map((d) => (
                <DayCard day={d} />
              ))}
          </div>
        </>
      ))}
      {loaded && !days.length && (
        <div class="group">
          <Empty icon="journal">还没有记录。从「今天」开始记第一天。</Empty>
        </div>
      )}
      {days.length > shown && <More left={days.length - shown} onClick={() => setShown(shown + PAGE)} />}
      {hasAiTimeline && (
        <div class="group after">
          <ListRow icon="sparkle" label="大事记" detail="AI 整理" href={`#/file/${TIMELINE}`} chev />
        </div>
      )}
    </>
  )
}

/** 所有速记，按天分组；可以只看标了「学到」或「问题」的 */
function NoteStream({ days }: { days: DayDoc[] }) {
  const [filter, setFilter] = useState<Filter>('notes')
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [filter])
  const want = (k: NoteKind) => (filter === 'notes' ? k !== 'spent' : k === filter)
  const withNotes = days.map((d) => ({ ...d, notes: parseNotes(d.md).filter((n) => want(noteKind(n.text).kind)) })).filter((d) => d.notes.length)
  return (
    <>
      <div class="chips scroll">
        {FILTERS.map(([v, label]) => (
          <Chip on={filter === v} onClick={() => setFilter(v)}>
            {label}
          </Chip>
        ))}
      </div>
      {withNotes.length === 0 ? (
        <div class="group">
          <Empty icon="note">
            {filter === 'notes' ? '还没有速记。点右下角 ＋ 随手记一条。' : `还没有标了「${filter === 'learned' ? '学到' : '问题'}」的速记。记速记时选一下种类，以后就能在这里一起看。`}
          </Empty>
        </div>
      ) : (
        withNotes.slice(0, shown).map((d) => (
          <>
            <a class="group-label link" href={`#/day/${d.date}`}>
              {cnMonthDay(d.date)} {weekday(d.date)}
            </a>
            <div class="group">
              <ul class="notes in-group">
                {d.notes.map((n) => (
                  <NoteRow date={d.date} note={n} />
                ))}
              </ul>
            </div>
          </>
        ))
      )}
      {withNotes.length > shown && <More left={withNotes.length - shown} onClick={() => setShown(shown + PAGE)} />}
    </>
  )
}

const More = ({ left, onClick }: { left: number; onClick: () => void }) => (
  <div class="more">
    <button type="button" class="text-btn" onClick={onClick}>
      更早的 {left} 天
    </button>
  </div>
)

// ───── 思想 ─────

function Thoughts({ thoughts, loaded }: { thoughts: { p: string; md: string }[]; loaded: boolean }) {
  const [tag, setTag] = useState('')
  const allTags = [...new Set(thoughts.flatMap((t) => tagsOf(t.md)))]
  const shown = thoughts.filter((t) => !tag || tagsOf(t.md).includes(tag))
  return (
    <>
      {allTags.length > 0 && (
        <div class="chips scroll">
          <Chip on={!tag} onClick={() => setTag('')}>
            全部
          </Chip>
          {allTags.map((t) => (
            <Chip on={tag === t} onClick={() => setTag(tag === t ? '' : t)}>
              #{t}
            </Chip>
          ))}
        </div>
      )}
      <div class="group">
        {shown.map(({ p, md }) => (
          <a class="row thought-row" href={`#/thought/${encodeURIComponent(p)}`}>
            <span class="thought-title">{titleOf(p, md)}</span>
            <span class="thought-excerpt">{excerpt(md)}</span>
            <span class="thought-meta">
              {getMeta(md, 'created')}
              {tagsOf(md).map((t) => (
                <span class="tag">#{t}</span>
              ))}
            </span>
          </a>
        ))}
        {loaded && !shown.length && <Empty icon="notes">还没有思想。点开一条速记，选「提炼为思想」，把一闪而过的念头写成完整的想法。</Empty>}
      </div>
    </>
  )
}

// ───── 模式 ─────

const STATUS_CLASS: Record<string, string> = { 观察中: 'watching', 成立: 'holds', 推翻: 'rejected' }

function Patterns({ patterns, loaded }: { patterns: Pattern[]; loaded: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const cur = patterns.find((p) => p.heading === open) ?? null
  return (
    <>
      <div class="group">
        {patterns.map((p) => (
          <button type="button" class="row pattern-row" onClick={() => setOpen(p.heading)}>
            <span class="pattern-top">
              {p.id && <span class="pattern-id">{p.id}</span>}
              {p.status && <span class={cx('status-chip', STATUS_CLASS[p.status])}>{p.status}</span>}
            </span>
            <span class="pattern-title">{p.title}</span>
          </button>
        ))}
        {loaded && !patterns.length && <Empty icon="pattern">还没有记下模式。让 AI 帮你复盘一次，它会把重复出现的事写进 memory/patterns.md，然后出现在这里。</Empty>}
      </div>
      {patterns.length > 0 && <p class="group-note">AI 记下的假设，带证据和反例。点开一条，成立还是推翻由你定。</p>}
      <PatternSheet pattern={cur} onClose={() => setOpen(null)} />
    </>
  )
}

function PatternSheet({ pattern, onClose }: { pattern: Pattern | null; onClose: () => void }) {
  // 关闭动画期间保留内容
  const [p, setP] = useState<Pattern | null>(null)
  useEffect(() => {
    if (pattern) setP(pattern)
  }, [pattern])
  return (
    <Sheet open={!!pattern} onClose={onClose} title={p ? p.title : ''} label="模式">
      {p && (
        <div class="pattern-sheet">
          <div class="verdict" role="group" aria-label="裁决">
            {STATUSES.map((st) => (
              <button
                type="button"
                class={cx('verdict-btn', STATUS_CLASS[st], p.status === st && 'on')}
                aria-pressed={p.status === st}
                onClick={() => {
                  if (p.status === st) return
                  store.enqueue(PATTERNS, { kind: 'pattern.status', heading: p.heading, status: st, date: ymd() })
                  setP({ ...p, status: st })
                }}
              >
                {st}
              </button>
            ))}
          </div>
          {p.note && <p class="sheet-sub">{p.note}</p>}
          <div
            class="prose pattern-body"
            onClick={(e) => (e.target as HTMLElement).closest('a[href^="#"]') && onClose()}
            dangerouslySetInnerHTML={{ __html: markdown(p.body) }}
          />
          {p.status === '成立' && (
            <p class="hint">
              成立的模式如果对应一个做法，可以写进 <a href="#/me" onClick={onClose}>我是谁 · 做法 · 验证过的</a>。
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ───── 搜索 ─────

function Results({ q, thoughts, days }: { q: string; thoughts: { p: string; md: string }[]; days: DayDoc[] }) {
  const kw = q.toLowerCase()
  const snip = (text: string) => {
    const i = text.toLowerCase().indexOf(kw)
    if (i < 0) return null
    return (i > 20 ? '…' : '') + text.slice(Math.max(0, i - 20), i + kw.length + 50).replace(/\s+/g, ' ')
  }
  const mark = (t: string) => {
    const i = t.toLowerCase().indexOf(kw)
    return i < 0 ? t : [t.slice(0, i), <mark>{t.slice(i, i + kw.length)}</mark>, t.slice(i + kw.length)]
  }
  const hits: { href: string; kind: string; title: string; snip: string }[] = []
  for (const { p, md } of thoughts) {
    const sn = snip(`${titleOf(p, md)} ${stripFrontmatter(md)}`)
    if (sn) hits.push({ href: `#/thought/${encodeURIComponent(p)}`, kind: '思想', title: titleOf(p, md), snip: sn })
  }
  for (const d of days) {
    for (const n of parseNotes(d.md)) {
      const sn = snip(n.text)
      if (sn) hits.push({ href: `#/day/${d.date}`, kind: '速记', title: `${d.date} ${n.time}`, snip: sn })
    }
    const sn = snip(getSection(d.md, '日记') ?? '')
    if (sn) hits.push({ href: `#/journal/${d.date}`, kind: '日记', title: d.date, snip: sn })
  }
  return (
    <div class="group search-results">
      {hits.slice(0, 50).map((h) => (
        <a class="row result" href={h.href}>
          <span class="result-top">
            <span class={cx('result-kind', h.kind === '思想' && 'accent')}>{h.kind}</span>
            <span class="result-title">{h.title}</span>
          </span>
          <span class="result-snip">{mark(h.snip)}</span>
        </a>
      ))}
      {!hits.length && <Empty icon="search">没有找到「{q}」。</Empty>}
    </div>
  )
}
