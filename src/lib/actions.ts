/** 任务相关的用户动作 + 全局弹层状态 */
import { dayPath, hm, ymd } from './dates'
import { fmtMinutes } from './md'
import { store } from './store'
import { INBOX, type Task } from './todo'
import { Box, haptic, toast } from './ui'

const P = 'todo.md'

export const taskSheet = new Box<Task | null>(null)
export const dateSheet = new Box<Task | null>(null)
export const capture = new Box<{ mode: 'task' | 'note'; group?: string; date?: string } | null>(null)

/** 刚勾掉的任务：先停留（可反悔），再淡出，最后从列表里消失 */
export const recent = new Box<Record<string, 'done' | 'leaving'>>({})
export const taskId = (t: Task) => `${t.group}|${t.key}`
const timers: Record<string, number[]> = {}

function setRecent(id: string, v: 'done' | 'leaving' | null) {
  const next = { ...recent.value }
  if (v) next[id] = v
  else delete next[id]
  recent.set(next)
}

export function toggle(t: Task) {
  const id = taskId(t)
  store.enqueue(P, { kind: 'task.toggle', key: t.key, group: t.group, today: ymd() })
  timers[id]?.forEach(clearTimeout)
  if (!t.done) {
    haptic(10)
    setRecent(id, 'done')
    timers[id] = [window.setTimeout(() => setRecent(id, 'leaving'), 1700), window.setTimeout(() => setRecent(id, null), 2100)]
  } else setRecent(id, null)
}

/** 列表里要显示的任务：未完成的 + 刚勾掉、还在停留的 */
export const visible = (t: Task, rec: Record<string, string>) => !t.done || !!rec[taskId(t)]

export function setDate(t: Task, date: string): Task {
  store.enqueue(P, { kind: 'task.date', key: t.key, group: t.group, date })
  const key = (t.key.replace(/(?:^|\s)@\d{4}-\d{2}-\d{2}(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim() + (date ? ` @${date}` : '')).trim()
  return { ...t, key, date }
}

export function move(t: Task, to: string): Task {
  store.enqueue(P, { kind: 'task.move', key: t.key, group: t.group, to })
  return { ...t, group: to }
}

export function edit(t: Task, text: string): Task {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || clean === t.key) return t
  store.enqueue(P, { kind: 'task.edit', key: t.key, group: t.group, text: clean })
  return { ...t, key: clean }
}

export function remove(t: Task) {
  store.enqueue(P, { kind: 'task.delete', key: t.key, group: t.group })
  toast(`已删除「${t.text}」`, {
    label: '撤销',
    run: () => store.enqueue(P, { kind: 'task.add', text: t.key, group: t.group, date: t.date }),
  })
}

export function add(text: string, group = INBOX, date = '') {
  store.enqueue(P, { kind: 'task.add', text, group, date })
}

// ───── 速记 ─────

export interface NoteRef {
  date: string
  time: string
  text: string
}
export const noteSheet = new Box<NoteRef | null>(null)

export function editNote(n: NoteRef, next: string): NoteRef {
  const clean = next.replace(/\s*\n\s*/g, ' ').trim()
  if (!clean || clean === n.text) return n
  store.enqueue(dayPath(n.date), { kind: 'note.edit', date: n.date, time: n.time, text: n.text, next: clean })
  return { ...n, text: clean }
}

export function deleteNote(n: NoteRef) {
  store.enqueue(dayPath(n.date), { kind: 'note.delete', date: n.date, time: n.time, text: n.text })
  toast('已删除这条速记', {
    label: '撤销',
    run: () => store.enqueue(dayPath(n.date), { kind: 'note.restore', date: n.date, time: n.time, text: n.text }),
  })
}

/** 记一条速记。补记过去某天的不带时间 */
export function addNote(date: string, text: string) {
  store.enqueue(dayPath(date), { kind: 'note', date, time: date === ymd() ? hm() : '', text })
}

/** 「记一笔投入」弹层：记到哪一天 */
export const spentSheet = new Box<{ date: string } | null>(null)

/** 「每周目标」弹层 */
export const targetSheet = new Box(false)

// ───── 计时：开始 → 结束，自动记成一笔投入 ─────
// 只存在这台设备上（localStorage）；关掉页面也在走，因为记的是开始的时刻。

export interface Timer {
  name: string
  /** 开始的时刻，毫秒 */
  start: number
}
const TIMER_KEY = 'll.timer'
/** 超过这么久，多半是忘了结束：先问实际学了多久，不直接记 */
export const LONG_TIMER_MIN = 240

function loadTimer(): Timer | null {
  try {
    const t = JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null')
    return t && typeof t.name === 'string' && typeof t.start === 'number' ? { name: t.name, start: t.start } : null
  } catch {
    return null
  }
}
export const timer = new Box<Timer | null>(loadTimer())
/** 计时太久时弹出来确认的那一次 */
export const timerStop = new Box<Timer | null>(null)

function setTimer(t: Timer | null) {
  timer.set(t)
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t))
    else localStorage.removeItem(TIMER_KEY)
  } catch {}
}
// 另一个标签页里开始或结束了计时
if (typeof addEventListener === 'function')
  addEventListener('storage', (e) => {
    if (e.key === TIMER_KEY) timer.set(loadTimer())
  })

export const timerMinutes = (t: Timer, now = Date.now()) => Math.max(0, Math.round((now - t.start) / 60000))
/** 47 → 47 分钟，125 → 2 小时 5 分 */
export const minutesLabel = (min: number) => (min < 60 ? `${min} 分钟` : `${Math.floor(min / 60)} 小时${min % 60 ? ` ${min % 60} 分` : ''}`)

export function startTimer(name: string) {
  setTimer({ name, start: Date.now() })
  haptic(10)
}

/** 结束计时，记成今天的一笔投入；撤销会删掉这一笔并接着计时 */
export function logTimer(t: Timer, min: number) {
  setTimer(null)
  if (min < 1) return toast('不到 1 分钟，没有记下', { label: '继续计时', run: () => setTimer(t) })
  const date = ymd()
  const time = hm()
  const text = `投入：${t.name} ${fmtMinutes(min)}`
  store.enqueue(dayPath(date), { kind: 'note', date, time, text })
  haptic(10)
  toast(`已记下 ${t.name} ${minutesLabel(min)}`, {
    label: '撤销',
    run: () => {
      store.enqueue(dayPath(date), { kind: 'note.delete', date, time, text })
      setTimer(t)
    },
  })
}

export function stopTimer() {
  const t = timer.value
  if (!t) return
  const min = timerMinutes(t)
  if (min >= LONG_TIMER_MIN) timerStop.set(t)
  else logTimer(t, min)
}

export function discardTimer() {
  const t = timer.value
  if (!t) return
  setTimer(null)
  toast('已放弃这次计时', { label: '撤销', run: () => setTimer(t) })
}
