import { useState } from 'preact/hooks'
import { capture } from '../lib/actions'
import { addDays, cnMonthDay, dayPath, hm, isoWeek, isYmd, parseYmd, relDay, weekday, ymd } from '../lib/dates'
import { dayMd, useFile, useToday, useTodo, useTree } from '../lib/hooks'
import { getMeta, getSection, parseNotes, score } from '../lib/md'
import { store } from '../lib/store'
import { allTasks, INBOX } from '../lib/todo'
import { cx, go } from '../lib/ui'
import { MiniBars, type Metric, METRIC_NAME } from '../components/Charts'
import { ProgressRing } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Card, Empty, Page } from '../components/Page'
import { Sheet } from '../components/Sheet'
import { TaskRow } from '../components/TaskRow'
import { setDraft } from './ThoughtPage'

export function TodayPage({ date }: { date?: string }) {
  const today = useToday()
  const d = date && isYmd(date) ? date : today
  const isToday = d === today
  const path = dayPath(d)
  const md = useFile(path)
  const text = md ?? ''
  const { groups } = useTodo()
  useTree('days/')
  const [scoreSheet, setScoreSheet] = useState<Metric | null>(null)
  const [cal, setCal] = useState(false)
  const [note, setNote] = useState('')

  const tasks = allTasks(groups)
  const due = (isToday ? tasks.filter((t) => !t.done && t.date && t.date <= d) : tasks.filter((t) => !t.done && t.date === d)).sort(
    (a, b) => a.date.localeCompare(b.date),
  )
  const doneHere = tasks.filter((t) => t.done && t.doneOn === d)
  const inboxOpen = groups.find((g) => g.name === INBOX)?.tasks.filter((t) => !t.done && !t.date) ?? []
  const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6))
  const series = (k: Metric) => week.map((x) => score(getMeta(dayMd(x) ?? '', k)))
  const notes = parseNotes(text)
  const journal = getSection(text, '日记') ?? ''

  const title = isToday ? '今天' : relDay(d, today) === cnMonthDay(d) ? cnMonthDay(d) : relDay(d, today)
  const subtitle = (
    <div class="day-sub">
      <a class="icon-btn small" href={addDays(d, -1) === today ? '#/' : `#/day/${addDays(d, -1)}`} aria-label="前一天">
        <Icon name="back" size={18} />
      </a>
      <button type="button" class="day-sub-label" onClick={() => setCal(true)}>
        {cnMonthDay(d)} {weekday(d)} · 第{isoWeek(d)[1]}周
        <Icon name="calendar" size={16} />
      </button>
      <a class="icon-btn small" href={addDays(d, 1) === today ? '#/' : `#/day/${addDays(d, 1)}`} aria-label="后一天">
        <Icon name="right" size={18} />
      </a>
      {!isToday && (
        <a class="chip small" href="#/">
          回到今天
        </a>
      )}
    </div>
  )

  return (
    <Page title={title} subtitle={subtitle}>
      <div class="score-row">
        {(['mood', 'energy'] as Metric[]).map((k) => {
          const v = score(getMeta(text, k))
          return (
            <button type="button" class={cx('score-card', k)} onClick={() => setScoreSheet(k)}>
              <span class="score-name">{METRIC_NAME[k]}</span>
              <span class="score-num">{v ?? '—'}</span>
              <MiniBars values={series(k)} metric={k} />
            </button>
          )
        })}
      </div>

      <Card
        title={isToday ? '今天要做' : '这天的待办'}
        action={due.length + doneHere.length > 0 && <ProgressRing done={doneHere.length} total={due.length + doneHere.length} />}
      >
        {due.length === 0 && doneHere.length === 0 && (
          <div class="empty-block">
            <Empty>{isToday ? '今天还没有安排。' : '这天没有安排待办。'}</Empty>
            {isToday && (
              <div class="row-gap">
                <button type="button" class="btn tonal" onClick={() => capture.set({ mode: 'task' })}>
                  <Icon name="plus" size={18} />
                  新建待办
                </button>
                {inboxOpen.length > 0 && (
                  <a class="btn" href="#/plan">
                    从收件箱挑几件
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        <div class="tasks">
          {due.map((t) => (
            <TaskRow task={t} today={today} showDate={t.date < d} />
          ))}
          {doneHere.map((t) => (
            <TaskRow task={t} today={today} showDate={false} />
          ))}
        </div>
      </Card>

      {isToday && inboxOpen.length > 0 && (
        <a class="banner" href="#/plan">
          <Icon name="inbox" />
          <span>
            收件箱里有 <b>{inboxOpen.length}</b> 件还没安排日期
          </span>
          <Icon name="right" size={18} />
        </a>
      )}

      <Card title="日记" class="journal-card" onClick={() => go(`#/journal/${d}`)}>
        {journal ? <p class="journal-preview">{journal}</p> : <p class="placeholder">{isToday ? '写下今天发生了什么、感受如何……' : '这一天没有日记，点此补写。'}</p>}
      </Card>

      <Card title="速记" action={notes.length > 0 && <span class="count">{notes.length}</span>}>
        {notes.length === 0 && !isToday && <Empty>这一天没有速记。</Empty>}
        <ul class="notes">
          {notes.map((n) => (
            <li>
              <time>{n.time}</time>
              <span>{n.text}</span>
              <button
                type="button"
                class="icon-btn small"
                title="提炼为思想"
                aria-label="提炼为思想"
                onClick={() => {
                  setDraft({ body: n.text, from: d })
                  go('#/thought/new')
                }}
              >
                <Icon name="distill" size={18} />
              </button>
            </li>
          ))}
        </ul>
        {isToday && (
          <form
            class="inline-add"
            onSubmit={(e) => {
              e.preventDefault()
              const v = note.trim()
              if (!v) return
              store.enqueue(path, { kind: 'note', date: d, time: hm(), text: v })
              setNote('')
            }}
          >
            <input value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} placeholder="记一条速记……" enterKeyHint="send" aria-label="速记" />
          </form>
        )}
      </Card>

      <ScoreSheet metric={scoreSheet} date={d} md={text} onClose={() => setScoreSheet(null)} />
      <CalendarSheet open={cal} date={d} onClose={() => setCal(false)} />
    </Page>
  )
}

function ScoreSheet({ metric, date, md, onClose }: { metric: Metric | null; date: string; md: string; onClose: () => void }) {
  const cur = metric ? score(getMeta(md, metric)) : null
  const set = (v: string) => {
    store.enqueue(dayPath(date), { kind: 'meta', date, key: metric!, value: v })
    onClose()
  }
  return (
    <Sheet open={!!metric} onClose={onClose} title={metric ? `${METRIC_NAME[metric]}怎么样？` : ''} label="打分">
      {metric && (
        <>
          <div class={cx('score-grid', metric)}>
            {Array.from({ length: 10 }, (_, i) => (
              <button type="button" class={cx(cur === i + 1 && 'on')} aria-pressed={cur === i + 1} onClick={() => set(String(i + 1))}>
                {i + 1}
              </button>
            ))}
          </div>
          <div class="score-scale">
            <span>{metric === 'mood' ? '很糟' : '精疲力尽'}</span>
            <span>{metric === 'mood' ? '很好' : '精力充沛'}</span>
          </div>
          {cur !== null && (
            <button type="button" class="btn text" onClick={() => set('')}>
              清除
            </button>
          )}
        </>
      )}
    </Sheet>
  )
}

function CalendarSheet({ open, date, onClose }: { open: boolean; date: string; onClose: () => void }) {
  const [month, setMonth] = useState(date.slice(0, 7))
  const today = ymd()
  const first = parseYmd(`${month}-01`)
  const start = addDays(`${month}-01`, -((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const shift = (n: number) => {
    const m = new Date(first.getFullYear(), first.getMonth() + n, 1)
    setMonth(ymd(m).slice(0, 7))
  }
  return (
    <Sheet open={open} onClose={onClose} title={`${first.getFullYear()}年${first.getMonth() + 1}月`} label="选择日期">
      <div class="cal">
        <div class="cal-nav">
          <button type="button" class="icon-btn" aria-label="上个月" onClick={() => shift(-1)}>
            <Icon name="back" />
          </button>
          <button type="button" class="btn text" onClick={() => setMonth(today.slice(0, 7))}>
            本月
          </button>
          <button type="button" class="icon-btn" aria-label="下个月" onClick={() => shift(1)}>
            <Icon name="right" />
          </button>
        </div>
        <div class="cal-grid">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
            <span class="cal-wd">{w}</span>
          ))}
          {cells.map((c) => {
            const m = dayMd(c)
            const v = m ? score(getMeta(m, 'mood')) : null
            return (
              <button
                type="button"
                class={cx('cal-day', !c.startsWith(month) && 'out', c === date && 'sel', c === today && 'today', m && 'has')}
                style={v !== null ? { '--v': v / 10 } : undefined}
                onClick={() => {
                  onClose()
                  go(c === today ? '#/' : `#/day/${c}`)
                }}
              >
                {Number(c.slice(8))}
                {m && <i class={v !== null ? 'mood' : ''} />}
              </button>
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}
