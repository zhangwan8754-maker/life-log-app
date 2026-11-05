import { ymd } from '../lib/dates'
import { parseTodos, type Todo, type TodoSection } from '../lib/md'
import { store } from '../lib/store'
import { h } from '../lib/ui'

const PATH = 'todo.md'

export function mountTodo(root: HTMLElement) {
  const input = h('input.line-input', { placeholder: '新的待办　@2026-12-01 截止　#标签', enterkeyhint: 'done' })
  const form = h(
    'form.add',
    {
      onsubmit: (e: Event) => {
        e.preventDefault()
        const v = input.value.trim()
        if (!v) return
        store.enqueue(PATH, { kind: 'todo.add', text: v, section: '现在' })
        input.value = ''
      },
    },
    input,
  )
  const now = h('ul.todos')
  const later = h('ul.todos')
  const done = h('ul.todos.done')
  const counts = { 现在: h('span.count'), 之后: h('span.count'), 完成: h('span.count') }
  const doneBox = h('details.done-box', h('summary', h('h2.sec', '完成', counts.完成)), done)

  const view = h(
    'article.fade',
    h('header.page-head', h('div.eyebrow', '行动'), h('h1.title', '待办')),
    form,
    h('section', h('h2.sec', '现在', counts.现在), now),
    h('section', h('h2.sec', '之后', counts.之后), later),
    doneBox,
  )
  root.replaceChildren(view)

  const today = ymd()
  const item = (t: Todo, sec: TodoSection) => {
    const overdue = !t.done && t.due && t.due < today
    const meta = [
      t.due && h('span', { class: overdue ? 'due over' : 'due' }, t.due.slice(5).replace('-', '/')),
      ...t.tags.map((g) => h('span.tag', `#${g}`)),
      t.done && t.doneOn && h('span.due', t.doneOn.slice(5).replace('-', '/')),
    ]
    const act = (label: string, title: string, fn: () => void) =>
      h('button.icon', { type: 'button', title, onclick: fn }, label)
    return h(
      'li.todo',
      h('button.check', {
        type: 'button',
        'aria-label': t.done ? '标记为未完成' : '完成',
        'aria-pressed': String(t.done),
        onclick: () => store.enqueue(PATH, { kind: 'todo.toggle', key: t.key, today: ymd() }),
      }),
      h('span.todo-text', t.text || t.key, h('span.todo-meta', meta)),
      h(
        'span.actions',
        sec === '现在' && act('↓', '移到之后', () => store.enqueue(PATH, { kind: 'todo.move', key: t.key, section: '之后' })),
        sec === '之后' && act('↑', '移到现在', () => store.enqueue(PATH, { kind: 'todo.move', key: t.key, section: '现在' })),
        act('×', '删除', () => {
          if (confirm(`删除「${t.text}」？`)) store.enqueue(PATH, { kind: 'todo.delete', key: t.key })
        }),
      ),
    )
  }

  const render = () => {
    const md = store.read(PATH)
    view.classList.toggle('loading', md === undefined)
    const t = parseTodos(md ?? '')
    now.replaceChildren(...t.现在.map((x) => item(x, '现在')))
    later.replaceChildren(...t.之后.map((x) => item(x, '之后')))
    done.replaceChildren(...t.完成.slice(0, 50).map((x) => item(x, '完成')))
    counts.现在.textContent = String(t.现在.length || '')
    counts.之后.textContent = String(t.之后.length || '')
    counts.完成.textContent = String(t.完成.length || '')
    if (!t.现在.length) now.replaceChildren(h('li.empty', '此刻没有要做的事。'))
  }
  render()
  store.load(PATH)
  return store.subscribe(render)
}
