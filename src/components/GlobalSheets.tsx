import { useEffect, useRef, useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { useToday, useTodo } from '../lib/hooks'
import { parseSpent, withKind, type NoteKind } from '../lib/md'
import { INBOX, withDate, type Group, type Task } from '../lib/todo'
import { cx, go, toast, useBox } from '../lib/ui'
import { Pie, Tabs, WhenPicker, whenLabel } from './Controls'
import { Icon } from './Icon'
import { NoteSheet } from './NoteSheet'
import { Sheet } from './Sheet'
import { SpentSheet } from './Spent'

const stripDate = (key: string) => withDate(key, '')

export const groupIcon = (g: Group, size = 20) =>
  g.kind === 'inbox' ? <Icon name="inbox" size={size} /> : g.kind === 'someday' ? <Icon name="box" size={size} /> : <Pie done={g.tasks.filter((t) => t.done).length} total={g.tasks.length} size={size - 2} />

function GroupList({ value, onPick }: { value: string; onPick: (g: string) => void }) {
  const { groups } = useTodo()
  return (
    <div class="pick">
      {groups.map((g) => (
        <button type="button" class={cx('pick-row', g.name === value && 'on')} onClick={() => onPick(g.name)}>
          <span class="pick-icon">{groupIcon(g)}</span>
          <span>{g.name}</span>
          {g.name === value && <Icon name="check" size={18} class="pick-check" />}
        </button>
      ))}
    </div>
  )
}

/** 日期、分组两个轻按钮，点开在下方展开选择 */
function Attrs({ date, group, today, onDate, onGroup }: { date: string; group: string; today: string; onDate: (d: string) => void; onGroup: (g: string) => void }) {
  const [open, setOpen] = useState<'date' | 'group' | null>(null)
  const { groups } = useTodo()
  const g = groups.find((x) => x.name === group)
  return (
    <>
      <div class="attrs">
        <button type="button" class={cx('attr', open === 'date' && 'open', !!date && 'set')} onClick={() => setOpen(open === 'date' ? null : 'date')}>
          <Icon name={date === today ? 'today' : 'calendar'} size={18} />
          {whenLabel(date, today)}
        </button>
        <button type="button" class={cx('attr', open === 'group' && 'open', group !== INBOX && 'set')} onClick={() => setOpen(open === 'group' ? null : 'group')}>
          {g ? groupIcon(g, 18) : <Icon name="inbox" size={18} />}
          {group}
        </button>
      </div>
      {open === 'date' && (
        <WhenPicker
          value={date}
          today={today}
          onPick={(d) => {
            onDate(d)
            setOpen(null)
          }}
        />
      )}
      {open === 'group' && (
        <GroupList
          value={group}
          onPick={(x) => {
            onGroup(x)
            setOpen(null)
          }}
        />
      )}
    </>
  )
}

/** 速记的种类。「想法」不加开头；其余三种会在前面加上「学到：」这样的开头，复盘时能单独找出来 */
const KINDS: { kind: NoteKind; label: string; placeholder: string }[] = [
  { kind: 'plain', label: '想法', placeholder: '此刻在想什么' },
  { kind: 'learned', label: '学到', placeholder: '这次学到了什么' },
  { kind: 'question', label: '问题', placeholder: '想弄明白什么' },
  { kind: 'spent', label: '投入', placeholder: '英语 1h，跑步 40min' },
]

function QuickEntry() {
  const c = useBox(A.capture)
  const today = useToday()
  const [mode, setMode] = useState<'task' | 'note'>('task')
  const [text, setText] = useState('')
  const [date, setDate] = useState(today)
  const [group, setGroup] = useState(INBOX)
  const [added, setAdded] = useState<string[]>([])
  const [kind, setKind] = useState<NoteKind>('plain')
  const input = useRef<HTMLInputElement>(null)
  const k = KINDS.find((x) => x.kind === kind)!

  useEffect(() => {
    if (!c) return
    setMode(c.mode)
    setDate(c.date ?? today)
    setGroup(c.group ?? INBOX)
    setText('')
    setAdded([])
    setKind('plain')
    setTimeout(() => input.current?.focus(), 80)
  }, [c])

  const close = () => A.capture.set(null)
  const submit = (e: Event) => {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    if (mode === 'task') {
      A.add(v, group, date)
      setAdded((a) => [v, ...a].slice(0, 4))
      setText('')
      input.current?.focus()
    } else {
      const note = withKind(kind, v)
      const sp = parseSpent(note)
      if (sp && (sp.bad.length || !sp.items.length)) return toast('写成「英语 1h，跑步 40min」才能统计')
      A.addNote(today, note)
      toast('已记下')
      close()
    }
  }

  return (
    <Sheet open={!!c} onClose={close} label="新建">
      <form class="quick" onSubmit={submit}>
        <div class="quick-top">
          <Tabs
            keepFocus
            value={mode}
            options={[
              { value: 'task', label: '待办' },
              { value: 'note', label: '速记' },
            ]}
            onChange={(m) => {
              setMode(m)
              // 正常情况下焦点一直在输入框上；只有键盘原本就收起时才重新聚焦
              if (document.activeElement !== input.current) input.current?.focus()
            }}
          />
          <button
            type="button"
            class="text-btn"
            onClick={() => {
              close()
              go(`#/journal/${today}`)
            }}
          >
            写日记
          </button>
        </div>
        <input
          ref={input}
          class="quick-input"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          placeholder={mode === 'task' ? '新的待办' : k.placeholder}
          enterKeyHint="done"
          autocomplete="off"
          aria-label={mode === 'task' ? '新的待办' : '速记'}
        />
        {mode === 'task' ? (
          <Attrs date={date} group={group} today={today} onDate={setDate} onGroup={setGroup} />
        ) : (
          <div class="attrs kinds" role="group" aria-label="速记的种类">
            {KINDS.map((x) => (
              <button
                type="button"
                class={cx('attr', kind === x.kind && 'on')}
                aria-pressed={kind === x.kind}
                // 不抢走输入框的焦点：键盘不会收起再弹出
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setKind(x.kind)}
              >
                {x.label}
              </button>
            ))}
          </div>
        )}
        {added.length > 0 && (
          <ul class="added">
            {added.map((a) => (
              <li>
                <Icon name="check" size={15} />
                {a}
              </li>
            ))}
          </ul>
        )}
        <div class="quick-bottom">
          <button type="button" class="text-btn muted" onClick={close}>
            {added.length ? '完成' : '取消'}
          </button>
          <button type="submit" class="text-btn strong" disabled={!text.trim()}>
            {mode === 'task' ? '添加' : '记下'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function TaskSheet() {
  const t0 = useBox(A.taskSheet)
  const today = useToday()
  const [t, setT] = useState<Task | null>(null)
  const [text, setText] = useState('')
  useEffect(() => {
    if (t0) {
      setT(t0)
      setText(stripDate(t0.key))
    }
  }, [t0])
  /** 先保存输入框里尚未提交的文字，返回最新的任务 */
  const commit = (): Task => {
    const cur = t!
    return text.trim() && text.trim() !== stripDate(cur.key) ? A.edit(cur, withDate(text, cur.date)) : cur
  }
  const close = () => {
    if (t) commit()
    A.taskSheet.set(null)
  }
  return (
    <Sheet open={!!t0} onClose={close} label="编辑待办">
      {t && (
        <div class="task-sheet">
          <textarea
            class="task-edit"
            rows={2}
            value={text}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            onBlur={() => setT(commit())}
            aria-label="待办内容"
          />
          <Attrs date={t.date} group={t.group} today={today} onDate={(d) => setT(A.setDate(commit(), d))} onGroup={(g) => setT(A.move(commit(), g))} />
          <div class="quick-bottom">
            <button
              type="button"
              class="text-btn danger"
              onClick={() => {
                A.remove(commit())
                A.taskSheet.set(null)
              }}
            >
              删除
            </button>
            <button
              type="button"
              class="text-btn strong"
              onClick={() => {
                A.toggle(commit())
                A.taskSheet.set(null)
              }}
            >
              {t.done ? '标记为未完成' : '完成'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function DateSheet() {
  const t = useBox(A.dateSheet)
  const today = useToday()
  return (
    <Sheet open={!!t} onClose={() => A.dateSheet.set(null)} title="什么时候做？" label="改期">
      {t && (
        <>
          <p class="sheet-sub">{t.text}</p>
          <WhenPicker
            value={t.date}
            today={today}
            onPick={(d) => {
              A.setDate(t, d)
              A.dateSheet.set(null)
            }}
          />
        </>
      )}
    </Sheet>
  )
}

export function GlobalSheets() {
  return (
    <>
      <QuickEntry />
      <TaskSheet />
      <DateSheet />
      <SpentSheet />
      <NoteSheet />
    </>
  )
}
