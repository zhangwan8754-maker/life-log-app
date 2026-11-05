import { useEffect, useRef, useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { dayPath, hm } from '../lib/dates'
import { useToday, useTodo } from '../lib/hooks'
import { store } from '../lib/store'
import { INBOX, withDate, type Task } from '../lib/todo'
import { go, toast, useBox } from '../lib/ui'
import { Chip, DateChips, Segmented } from './Controls'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

const stripDate = (key: string) => withDate(key, '')

function GroupChips({ value, onChange }: { value: string; onChange: (g: string) => void }) {
  const { groups } = useTodo()
  return (
    <div class="chips">
      {groups.map((g) => (
        <Chip on={g.name === value} icon={g.kind === 'inbox' ? 'inbox' : g.kind === 'someday' ? 'flag' : 'folder'} onClick={() => onChange(g.name)}>
          {g.name}
        </Chip>
      ))}
    </div>
  )
}

function CaptureSheet() {
  const c = useBox(A.capture)
  const today = useToday()
  const [mode, setMode] = useState<'task' | 'note'>('task')
  const [text, setText] = useState('')
  const [date, setDate] = useState(today)
  const [group, setGroup] = useState(INBOX)
  const [added, setAdded] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!c) return
    setMode(c.mode)
    setDate(c.date ?? today)
    setGroup(c.group ?? INBOX)
    setText('')
    setAdded([])
    setTimeout(() => input.current?.focus(), 60)
  }, [c])

  const close = () => A.capture.set(null)
  const submit = (e: Event) => {
    e.preventDefault()
    const v = text.trim()
    if (!v) return
    if (mode === 'task') {
      A.add(v, group, date)
      setAdded((a) => [v, ...a].slice(0, 3))
      setText('')
      input.current?.focus()
    } else {
      store.enqueue(dayPath(today), { kind: 'note', date: today, time: hm(), text: v })
      toast('已记入今天')
      close()
    }
  }

  return (
    <Sheet open={!!c} onClose={close} label="新建">
      <form class="capture" onSubmit={submit}>
        <Segmented
          value={mode}
          options={[
            { value: 'task', label: '待办' },
            { value: 'note', label: '速记' },
            { value: 'journal' as 'task', label: '日记' },
          ]}
          onChange={(m) => {
            if ((m as string) === 'journal') {
              close()
              go(`#/journal/${today}`)
            } else setMode(m)
          }}
        />
        <div class="capture-field">
          <input
            ref={input}
            class="capture-input"
            value={text}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            placeholder={mode === 'task' ? '要做什么？' : '此刻在想什么？'}
            enterKeyHint={mode === 'task' ? 'done' : 'send'}
            autocomplete="off"
          />
          <button type="submit" class="send" aria-label="添加" disabled={!text.trim()}>
            <Icon name={mode === 'task' ? 'plus' : 'check'} />
          </button>
        </div>
        {mode === 'task' && (
          <>
            <div class="field-label">哪天做</div>
            <DateChips value={date} today={today} onChange={setDate} />
            <div class="field-label">放进</div>
            <GroupChips value={group} onChange={setGroup} />
            {added.length > 0 && (
              <ul class="added">
                {added.map((a) => (
                  <li>
                    <Icon name="check" size={16} />
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {mode === 'note' && <p class="hint">记入今天的速记，按时间排列。之后可以在「笔记」里提炼成思想。</p>}
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
    <Sheet open={!!t0} onClose={close} title="待办" label="编辑待办">
      {t && (
        <div class="task-sheet">
          <textarea
            class="task-edit"
            rows={2}
            value={text}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            onBlur={() => setT(commit())}
          />
          <div class="field-label">哪天做</div>
          <DateChips value={t.date} today={today} onChange={(d) => setT(A.setDate(commit(), d))} />
          <div class="field-label">放进</div>
          <GroupChips value={t.group} onChange={(g) => setT(A.move(commit(), g))} />
          <div class="sheet-actions">
            <button
              type="button"
              class="btn danger"
              onClick={() => {
                A.remove(commit())
                A.taskSheet.set(null)
              }}
            >
              <Icon name="trash" size={18} />
              删除
            </button>
            <button
              type="button"
              class="btn primary"
              onClick={() => {
                A.toggle(commit())
                A.taskSheet.set(null)
              }}
            >
              <Icon name="check" size={18} />
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
    <Sheet open={!!t} onClose={() => A.dateSheet.set(null)} title="改到哪天" label="改期">
      {t && (
        <>
          <p class="sheet-sub">{t.text}</p>
          <DateChips
            value={t.date}
            today={today}
            onChange={(d) => {
              A.setDate(t, d)
              A.dateSheet.set(null)
              toast(d ? '已改期' : '已移出日程')
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
      <CaptureSheet />
      <TaskSheet />
      <DateSheet />
    </>
  )
}
