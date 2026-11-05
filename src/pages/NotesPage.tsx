import { useState } from 'preact/hooks'
import { cnMonthDay, weekday } from '../lib/dates'
import { useStore, useTree } from '../lib/hooks'
import { getMeta, getSection, parseNotes, stripFrontmatter, thoughtBody } from '../lib/md'
import { cx, go } from '../lib/ui'
import { Chip, Tabs } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Empty, Page } from '../components/Page'
import { NoteRow } from '../components/NoteSheet'
import { tagsOf, titleOf } from './ThoughtPage'

const excerpt = (md: string) => thoughtBody(md).replace(/^[\s>#*-]+/gm, '').replace(/[*_`[\]]/g, '').replace(/\s+/g, ' ').slice(0, 80)

export function NotesPage({ seg }: { seg: 'thoughts' | 'stream' }) {
  const s = useStore()
  const loaded = useTree('days/', 'thoughts/')
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')

  const thoughts = s
    .list('thoughts/')
    .map((p) => ({ p, md: s.read(p) ?? '' }))
    .sort((a, b) => (getMeta(b.md, 'created') || '').localeCompare(getMeta(a.md, 'created') || ''))
  const days = s
    .list('days/')
    .map((p) => ({ date: p.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? '', md: s.read(p) ?? '' }))
    .filter((d) => d.date)
    .sort((a, b) => b.date.localeCompare(a.date))
  const allTags = [...new Set(thoughts.flatMap((t) => tagsOf(t.md)))]
  const shown = thoughts.filter((t) => !tag || tagsOf(t.md).includes(tag))

  return (
    <Page
      title="笔记"
      icon="notes"
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
                { value: 'thoughts', label: `思想${thoughts.length ? ` ${thoughts.length}` : ''}` },
                { value: 'stream', label: '速记' },
              ]}
              onChange={(v) => go(v === 'stream' ? '#/notes/stream' : '#/notes')}
            />
          </div>
          {seg === 'thoughts' ? (
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
                {loaded && !shown.length && <Empty icon="notes">还没有思想。在速记旁点 ↗，把一闪而过的念头写成完整的想法。</Empty>}
              </div>
            </>
          ) : (
            <Stream days={days} />
          )}
        </>
      )}
    </Page>
  )
}

function Stream({ days }: { days: { date: string; md: string }[] }) {
  const withNotes = days.map((d) => ({ ...d, notes: parseNotes(d.md) })).filter((d) => d.notes.length)
  if (!withNotes.length)
    return (
      <div class="group">
        <Empty icon="note">还没有速记。点右下角 ＋ 随手记一条。</Empty>
      </div>
    )
  return (
    <>
      {withNotes.slice(0, 60).map((d) => (
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
      ))}
    </>
  )
}

function Results({ q, thoughts, days }: { q: string; thoughts: { p: string; md: string }[]; days: { date: string; md: string }[] }) {
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
