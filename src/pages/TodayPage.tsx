import { useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { recent, visible } from '../lib/actions'
import { addDays, cnMonthDay, dayPath, isYmd, parseYmd, weekday, ymd } from '../lib/dates'
import { dayMd, useFile, useToday, useTodo, useTree } from '../lib/hooks'
import { daySpent, fmtHours, getMeta, getSection, noteKind, parseNotes, score } from '../lib/md'
import { store } from '../lib/store'
import { allTasks } from '../lib/todo'
import { cx, go, useBox } from '../lib/ui'
import { type Metric, METRIC_NAME } from '../components/Charts'
import { Icon } from '../components/Icon'
import { Page } from '../components/Page'
import { Sheet } from '../components/Sheet'
import { spentTotal } from '../components/Spent'
import { TaskRow } from '../components/TaskRow'
import { NoteRow } from '../components/NoteSheet'

/** 情绪 / 精力：标题旁的一枚小标签，点开打分 */
function ScorePill({ metric, value, onClick }: { metric: Metric; value: number | null; onClick: () => void }) {
  return (
    <button type="button" class={cx('score-pill', metric, value === null && 'unset')} aria-label={`${METRIC_NAME[metric]} ${value ?? '未打分'}`} onClick={onClick}>
      {METRIC_NAME[metric]}
      <b>{value ?? '—'}</b>
    </button>
  )
}

/**
 * 一天的全部，只有三块：要做的事、日记、速记（投入并在速记里）。
 * 情绪和精力收在日期那一行。没有内容的块不占地方。
 */
export function TodayPage({ date }: { date?: string }) {
  const today = useToday()
  const d = date && isYmd(date) ? date : today
  const isToday = d === today
  const path = dayPath(d)
  const md = useFile(path) ?? ''
  const { groups } = useTodo()
  const rec = useBox(recent)
  useTree('days/')
  const [score_, setScore] = useState<Metric | null>(null)
  const [cal, setCal] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [text, setText] = useState('')

  const tasks = allTasks(groups)
  const due = tasks
    .filter((t) => visible(t, rec) && t.date && (isToday ? t.date <= d : t.date === d))
    .filter((t) => !t.done || t.doneOn === d)
    .sort((a, b) => a.date.localeCompare(b.date))
  const doneHere = tasks.filter((t) => t.done && t.doneOn === d && !rec[`${t.group}|${t.key}`])
  const notes = parseNotes(md).filter((n) => noteKind(n.text).kind !== 'spent')
  const spent = daySpent(md)
  const journal = (getSection(md, '日记') ?? '').trim()
  const mood = score(getMeta(md, 'mood'))
  const energy = score(getMeta(md, 'energy'))
  const past = d < today
  const openSpent = () => A.spentSheet.set({ date: d })

  const prev = addDays(d, -1)
  const next = addDays(d, 1)
  const subtitle = (
    <div class="day-nav">
      <button type="button" class="day-label" onClick={() => setCal(true)}>
        {cnMonthDay(d)} {weekday(d)}
      </button>
      <a class="icon-btn tiny" href={prev === today ? '#/' : `#/day/${prev}`} aria-label="前一天">
        <Icon name="back" size={16} />
      </a>
      <a class="icon-btn tiny" href={next === today ? '#/' : `#/day/${next}`} aria-label="后一天">
        <Icon name="right" size={16} />
      </a>
      {!isToday && (
        <a class="text-btn small" href="#/">
          回到今天
        </a>
      )}
      <span class="score-pills">
        <ScorePill metric="mood" value={mood} onClick={() => setScore('mood')} />
        <ScorePill metric="energy" value={energy} onClick={() => setScore('energy')} />
      </span>
    </div>
  )

  return (
    <Page title={isToday ? '今天' : cnMonthDay(d)} icon={isToday ? 'today' : 'calendar'} subtitle={subtitle} class="today">
      {due.length > 0 && (
        <div class="group">
          <div class="tasks">
            {due.map((t) => (
              <TaskRow task={t} today={today} showDate={t.date < d} />
            ))}
          </div>
        </div>
      )}
      {doneHere.length > 0 && (
        <>
          <div class={cx('below', !due.length && 'alone')}>
            <button type="button" class="text-btn muted small" onClick={() => setShowDone(!showDone)}>
              {showDone ? '收起已完成' : `已完成 ${doneHere.length} 件`}
            </button>
          </div>
          {showDone && (
            <div class="group done-group">
              <div class="tasks">
                {doneHere.map((t) => (
                  <TaskRow task={t} today={today} showDate={false} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <a class={cx('group journal-card', journal && 'has')} href={`#/journal/${d}`} aria-label="日记">
        {journal ? (
          <>
            <span class="journal-excerpt">{journal.replace(/\n\s*\n/g, '\n')}</span>
            <span class="journal-meta">日记 · {journal.replace(/\s/g, '').length} 字</span>
          </>
        ) : (
          <span class="journal-hint">
            <Icon name="edit" size={18} />
            {isToday ? '今天发生了什么？感受如何？' : '这一天没有写日记，点这里补上。'}
          </span>
        )}
      </a>

      {(isToday || notes.length > 0 || spent.length > 0) && (
        <div class="group day-notes">
          {notes.length > 0 && (
            <ul class="notes in-group">
              {notes.map((n) => (
                <NoteRow date={d} note={n} />
              ))}
            </ul>
          )}
          {spent.length > 0 && (
            <button type="button" class="spent-line" aria-label="查看和修改投入" onClick={openSpent}>
              <span class="spent-line-total">投入 {fmtHours(spentTotal(spent))}</span>
              <span class="spent-line-items">{spent.map((x) => `${x.name} ${fmtHours(x.hours)}`).join(' · ')}</span>
            </button>
          )}
          {isToday && (
            <form
              class="note-add inline"
              onSubmit={(e) => {
                e.preventDefault()
                const v = text.trim()
                if (!v) return
                A.addNote(d, v)
                setText('')
              }}
            >
              <input value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} placeholder="记一条速记……" enterKeyHint="send" aria-label="速记" />
              <button type="button" class="text-btn small spent-btn" onClick={openSpent}>
                记投入
              </button>
            </form>
          )}
        </div>
      )}
      {past && (
        <div class="below">
          <button type="button" class="text-btn muted small spent-btn" onClick={openSpent}>
            补记投入
          </button>
        </div>
      )}

      <ScoreSheet metric={score_} date={d} md={md} onClose={() => setScore(null)} />
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
    <Sheet open={!!metric} onClose={onClose} title={metric ? `${METRIC_NAME[metric]}` : ''} label="打分">
      {metric && (
        <div class="score">
          <div class="score-grid">
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
            <button type="button" class="text-btn muted" onClick={() => set('')}>
              清除
            </button>
          )}
        </div>
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
  const shift = (n: number) => setMonth(ymd(new Date(first.getFullYear(), first.getMonth() + n, 1)).slice(0, 7))
  return (
    <Sheet open={open} onClose={onClose} title="去哪一天" label="选择日期">
      <div class="cal">
        <div class="cal-head">
          <button type="button" class="icon-btn small" aria-label="上个月" onClick={() => shift(-1)}>
            <Icon name="back" size={18} />
          </button>
          <span>
            {first.getFullYear()}年{first.getMonth() + 1}月
          </span>
          <button type="button" class="icon-btn small" aria-label="下个月" onClick={() => shift(1)}>
            <Icon name="right" size={18} />
          </button>
        </div>
        <div class="cal-grid">
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
            <span class="cal-wd">{w}</span>
          ))}
          {cells.map((c) => (
            <button
              type="button"
              class={cx('cal-day', !c.startsWith(month) && 'out', c === date && 'sel', c === today && 'today', !!dayMd(c) && 'has')}
              onClick={() => {
                onClose()
                go(c === today ? '#/' : `#/day/${c}`)
              }}
            >
              {Number(c.slice(8))}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
