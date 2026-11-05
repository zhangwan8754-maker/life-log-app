import { useState } from 'preact/hooks'
import { recent, visible } from '../lib/actions'
import { addDays, cnMonthDay, dayPath, hm, isYmd, parseYmd, weekday, ymd } from '../lib/dates'
import { dayMd, useFile, useToday, useTodo, useTree } from '../lib/hooks'
import { getMeta, getSection, parseNotes, score } from '../lib/md'
import { store } from '../lib/store'
import { allTasks } from '../lib/todo'
import { cx, go, useBox } from '../lib/ui'
import { type Metric, METRIC_NAME } from '../components/Charts'
import { Icon } from '../components/Icon'
import { Empty, Page } from '../components/Page'
import { Sheet } from '../components/Sheet'
import { TaskRow } from '../components/TaskRow'
import { NoteRow } from '../components/NoteSheet'

export function TodayPage({ date }: { date?: string }) {
  const today = useToday()
  const d = date && isYmd(date) ? date : today
  const isToday = d === today
  const path = dayPath(d)
  const md = useFile(path) ?? ''
  const { groups, loading } = useTodo()
  const rec = useBox(recent)
  useTree('days/')
  const [score_, setScore] = useState<Metric | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [cal, setCal] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const tasks = allTasks(groups)
  const due = tasks
    .filter((t) => visible(t, rec) && t.date && (isToday ? t.date <= d : t.date === d))
    .filter((t) => !t.done || t.doneOn === d)
    .sort((a, b) => a.date.localeCompare(b.date))
  const doneHere = tasks.filter((t) => t.done && t.doneOn === d && !rec[`${t.group}|${t.key}`])
  const notes = parseNotes(md)
  const journal = (getSection(md, '日记') ?? '').trim()
  const mood = score(getMeta(md, 'mood'))
  const energy = score(getMeta(md, 'energy'))

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
    </div>
  )

  return (
    <Page title={isToday ? '今天' : cnMonthDay(d)} icon={isToday ? 'today' : 'calendar'} subtitle={subtitle} class="today">
      <div class="group">
        {due.length > 0 ? (
          <div class="tasks">
            {due.map((t) => (
              <TaskRow task={t} today={today} showDate={t.date < d} />
            ))}
          </div>
        ) : (
          !loading && (
            <Empty icon="today">{isToday ? (doneHere.length ? '今天的事都做完了。' : '今天没有安排，留一点空白也很好。') : '这一天没有安排。'}</Empty>
          )
        )}
      </div>
      {doneHere.length > 0 && (
        <>
          <div class="below">
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

      <div class="group status-group">
        <div class="status">
          <button type="button" onClick={() => setScore('mood')}>
            情绪 <b class={cx(mood === null && 'unset')}>{mood ?? '—'}</b>
          </button>
          <i>·</i>
          <button type="button" onClick={() => setScore('energy')}>
            精力 <b class={cx(energy === null && 'unset')}>{energy ?? '—'}</b>
          </button>
          <i>·</i>
          <button type="button" class={cx(journal && 'has')} onClick={() => go(`#/journal/${d}`)}>
            日记
          </button>
          <i>·</i>
          <button type="button" class={cx(notes.length > 0 && 'has')} onClick={() => setNotesOpen(true)}>
            {notes.length ? `${notes.length} 条速记` : '速记'}
          </button>
        </div>
      </div>

      <ScoreSheet metric={score_} date={d} md={md} onClose={() => setScore(null)} />
      <NotesSheet open={notesOpen} date={d} md={md} editable={isToday} onClose={() => setNotesOpen(false)} />
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

function NotesSheet({ open, date, md, editable, onClose }: { open: boolean; date: string; md: string; editable: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const notes = parseNotes(md)
  return (
    <Sheet open={open} onClose={onClose} title="速记" label="速记">
      {notes.length === 0 && <p class="sheet-sub">{editable ? '一闪而过的念头，随手记下。' : '这一天没有速记。'}</p>}
      <ul class="notes">
        {notes.map((n) => (
          <NoteRow date={date} note={n} />
        ))}
      </ul>
      {editable && (
        <form
          class="note-add"
          onSubmit={(e) => {
            e.preventDefault()
            const v = text.trim()
            if (!v) return
            store.enqueue(dayPath(date), { kind: 'note', date, time: hm(), text: v })
            setText('')
          }}
        >
          <input class="field-input" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} placeholder="记一条……" enterKeyHint="send" aria-label="速记" />
        </form>
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
