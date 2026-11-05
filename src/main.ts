import './styles.css'
import { dayPath, hm, isYmd, ymd } from './lib/dates'
import { store } from './lib/store'
import { go, h, toast } from './lib/ui'
import { mountFile } from './views/file'
import { mountReview } from './views/review'
import { mountSettings } from './views/settings'
import { mountThought, mountThoughts } from './views/thought'
import { mountDay } from './views/today'
import { mountTodo } from './views/todo'

type Mount = (root: HTMLElement, arg: string) => (() => void) | void

const routes: Record<string, { tab: string; mount: Mount; capture?: boolean }> = {
  '': { tab: 'today', mount: (r) => mountDay(r), capture: true },
  day: { tab: 'today', mount: (r, a) => mountDay(r, isYmd(a) ? a : ymd()), capture: true },
  todo: { tab: 'todo', mount: mountTodo, capture: true },
  thoughts: { tab: 'thoughts', mount: mountThoughts, capture: true },
  thought: { tab: 'thoughts', mount: mountThought },
  review: { tab: 'review', mount: mountReview, capture: true },
  file: { tab: 'review', mount: (r, a) => mountFile(r, decodeURIComponent(a)) },
  settings: { tab: 'review', mount: mountSettings },
}

const TABS = [
  ['today', '#/', '今天'],
  ['todo', '#/todo', '待办'],
  ['thoughts', '#/thoughts', '思想'],
  ['review', '#/review', '回看'],
] as const

// ───── 外壳 ─────

const viewEl = h('main.view')
const tabs = TABS.map(([id, href, label]) => h('a.tab', { href, 'data-tab': id }, label))
const sync = h('button.sync', { type: 'button', onclick: () => (store.status === 'error' ? go('#/settings') : store.flush()) })

const capInput = h('input.capture-input', {
  placeholder: '记下此刻……　以 [] 开头记为待办',
  enterkeyhint: 'send',
  autocomplete: 'off',
})
const capture = h(
  'form.capture',
  {
    onsubmit: (e: Event) => {
      e.preventDefault()
      const v = capInput.value.trim()
      if (!v) return
      const todo = v.match(/^\[\s?\]\s*(.+)$/)
      if (todo) {
        store.enqueue('todo.md', { kind: 'todo.add', text: todo[1], section: '现在' })
        toast('已加入待办')
      } else {
        const date = ymd()
        store.enqueue(dayPath(date), { kind: 'note', date, time: hm(), text: v })
        if (!/^#\/?$/.test(location.hash) && location.hash !== `#/day/${date}`) toast('已记入今天')
      }
      capInput.value = ''
    },
  },
  capInput,
)

document.querySelector('#app')!.replaceChildren(
  h('nav.nav', h('a.brand', { href: '#/', 'aria-label': 'Life Log' }, h('i.seal')), tabs),
  sync,
  viewEl,
  capture,
)

function renderSync() {
  const n = store.pendingCount()
  const s = store.status
  sync.dataset.state = s === 'idle' && n ? 'pending' : s
  sync.textContent =
    s === 'syncing' ? '同步中' : s === 'offline' ? `离线${n ? ` · ${n}` : ''}` : s === 'error' ? '同步出错' : n ? `待同步 · ${n}` : '已同步'
  sync.title = store.error || (s === 'offline' ? '联网后自动同步' : '点击立即同步')
}

// ───── 路由 ─────

let cleanup: (() => void) | void
function route() {
  const [, name = '', ...rest] = location.hash.replace(/^#\/?/, '#/').split('/')
  const arg = rest.join('/')
  if (!store.config && name !== 'settings') return go('#/settings')
  const r = routes[name] ?? routes['']
  cleanup?.()
  window.scrollTo(0, 0)
  tabs.forEach((t) => t.classList.toggle('on', t.dataset.tab === r.tab))
  document.body.classList.toggle('with-capture', !!r.capture && !!store.config)
  cleanup = r.mount(viewEl, arg)
}

addEventListener('hashchange', route)
addEventListener('keydown', (e) => {
  // 任意页面按 / 聚焦速记框
  if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea') && document.body.classList.contains('with-capture')) {
    e.preventDefault()
    capInput.focus()
  }
})

store.subscribe(renderSync)
await store.init()
renderSync()
route()

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js')
