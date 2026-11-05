import { useState } from 'preact/hooks'
import { cnMonthDay, weekday } from '../lib/dates'
import { useStore, useTree } from '../lib/hooks'
import { getMeta, getSection, parseNotes, stripFrontmatter, thoughtBody } from '../lib/md'
import { cx, go } from '../lib/ui'
import { Chip, Segmented } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Card, Empty, Page } from '../components/Page'
import { setDraft, tagsOf, titleOf } from './ThoughtPage'

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

  return (
    <Page
      title="笔记"
      subtitle="积累与检索：思想卡片和所有速记"
      actions={
        <a class="icon-btn" href="#/thought/new" aria-label="新建思想">
          <Icon name="edit" />
        </a>
      }
    >
      <label class="search">
        <Icon name="search" size={20} />
        <input type="search" value={q} placeholder="搜索思想、速记、日记" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      {q.trim() ? (
        <Results q={q.trim()} thoughts={thoughts} days={days} />
      ) : (
        <>
          <Segmented
            value={seg}
            options={[
              { value: 'thoughts', label: `思想 ${thoughts.length || ''}`.trim() },
              { value: 'stream', label: '速记流' },
            ]}
            onChange={(v) => go(v === 'stream' ? '#/notes/stream' : '#/notes')}
          />
          {!loaded && <div class="loading-block" />}
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
              <div class="thought-grid">
                {thoughts
                  .filter((t) => !tag || tagsOf(t.md).includes(tag))
                  .map(({ p, md }) => (
                    <a class="card thought-card" href={`#/thought/${encodeURIComponent(p)}`}>
                      <h3>{titleOf(p, md)}</h3>
                      <p>{thoughtBody(md).replace(/^[\s>#*-]+/gm, '').replace(/[*_`[\]]/g, '').slice(0, 140)}</p>
                      <div class="thought-meta">
                        <span>{getMeta(md, 'created')}</span>
                        {tagsOf(md).map((t) => (
                          <span class="tag">#{t}</span>
                        ))}
                      </div>
                    </a>
                  ))}
              </div>
              {loaded && !thoughts.length && <Empty>还没有思想卡片。在速记旁点 ↗ 把一闪而过的念头提炼成完整的想法。</Empty>}
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
  if (!withNotes.length) return <Empty>还没有速记。点右下角 ＋ 随手记一条。</Empty>
  return (
    <>
      {withNotes.slice(0, 60).map((d) => (
        <Card
          title={
            <a href={`#/day/${d.date}`}>
              {cnMonthDay(d.date)}
              <span class="card-title-sub">{weekday(d.date)}</span>
            </a>
          }
        >
          <ul class="notes">
            {d.notes.map((n) => (
              <li>
                <time>{n.time}</time>
                <span>{n.text}</span>
                <button
                  type="button"
                  class="icon-btn small"
                  aria-label="提炼为思想"
                  title="提炼为思想"
                  onClick={() => {
                    setDraft({ body: n.text, from: d.date })
                    go('#/thought/new')
                  }}
                >
                  <Icon name="distill" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  )
}

function Results({ q, thoughts, days }: { q: string; thoughts: { p: string; md: string }[]; days: { date: string; md: string }[] }) {
  const kw = q.toLowerCase()
  const snip = (text: string) => {
    const i = text.toLowerCase().indexOf(kw)
    if (i < 0) return null
    return (i > 24 ? '…' : '') + text.slice(Math.max(0, i - 24), i + kw.length + 60).replace(/\s+/g, ' ')
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
  if (!hits.length) return <Empty>没有找到「{q}」。</Empty>
  return (
    <div class="card results">
      {hits.slice(0, 50).map((h) => (
        <a class="result" href={h.href}>
          <span class={cx('result-kind', h.kind === '思想' && 'accent')}>{h.kind}</span>
          <span class="result-title">{h.title}</span>
          <span class="result-snip">{mark(h.snip)}</span>
        </a>
      ))}
    </div>
  )
}
