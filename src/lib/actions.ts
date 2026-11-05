/** 任务相关的用户动作 + 全局弹层状态 */
import { ymd } from './dates'
import { store } from './store'
import { INBOX, type Task } from './todo'
import { Box, haptic, toast } from './ui'

const P = 'todo.md'

export const taskSheet = new Box<Task | null>(null)
export const dateSheet = new Box<Task | null>(null)
export const capture = new Box<{ mode: 'task' | 'note'; group?: string; date?: string } | null>(null)

export function toggle(t: Task) {
  store.enqueue(P, { kind: 'task.toggle', key: t.key, group: t.group, today: ymd() })
  if (!t.done) {
    haptic(12)
    toast(`已完成「${t.text}」`, {
      label: '撤销',
      run: () => store.enqueue(P, { kind: 'task.toggle', key: t.key, group: t.group, today: ymd() }),
    })
  }
}

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
