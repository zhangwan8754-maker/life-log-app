/** 任务相关的用户动作 + 全局弹层状态 */
import { dayPath, ymd } from './dates'
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

// ───── 提炼为思想：把速记带进新建思想页 ─────

let draft: { body: string; from: string } | null = null
export const setDraft = (d: typeof draft) => {
  draft = d
}
export const takeDraft = () => {
  const d = draft
  draft = null
  return d
}
