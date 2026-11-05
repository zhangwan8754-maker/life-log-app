import { useEffect, useState } from 'preact/hooks'
import { capture } from './lib/actions'
import { useStore } from './lib/hooks'
import { store } from './lib/store'
import { isLegacy } from './lib/todo'
import { cx, toastBox, useBox } from './lib/ui'
import { GlobalSheets } from './components/GlobalSheets'
import { Icon } from './components/Icon'
import { FilePage } from './pages/FilePage'
import { JournalPage } from './pages/JournalPage'
import { NotesPage } from './pages/NotesPage'
import { PlanPage } from './pages/PlanPage'
import { ProjectPage } from './pages/ProjectPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { ThoughtPage } from './pages/ThoughtPage'
import { TodayPage } from './pages/TodayPage'
import { WeekPage } from './pages/WeekPage'

type Tab = 'today' | 'plan' | 'notes' | 'review'
const TABS: [Tab, string, string, string][] = [
  ['today', '#/', '今天', 'today'],
  ['plan', '#/plan', '计划', 'plan'],
  ['notes', '#/notes', '笔记', 'notes'],
  ['review', '#/review', '复盘', 'review'],
]

interface Route {
  name: string
  args: string[]
}
const parse = (): Route => {
  const [name = '', ...args] = location.hash.replace(/^#\/?/, '').split('/')
  return { name, args: args.map(decodeURIComponent) }
}

const TAB_OF: Record<string, Tab> = {
  '': 'today', day: 'today', journal: 'today',
  plan: 'plan', project: 'plan',
  notes: 'notes', thought: 'notes',
  review: 'review', week: 'review', file: 'review', settings: 'review',
}
/** 显示 ＋ 按钮的页面，以及它的默认值 */
const FAB: Record<string, () => Parameters<typeof capture.set>[0]> = {
  '': () => ({ mode: 'task' }),
  day: () => ({ mode: 'task' }),
  plan: () => ({ mode: 'task', date: '' }),
  project: () => ({ mode: 'task', date: '', group: parse().args[0] }),
  notes: () => ({ mode: 'note' }),
  review: () => ({ mode: 'task' }),
}

function useRoute(): Route {
  const [r, setR] = useState(parse)
  useEffect(() => {
    const on = () => {
      const next = parse()
      const vt = (document as any).startViewTransition
      if (vt && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        vt.call(document, async () => {
          setR(next)
          await new Promise((res) => setTimeout(res, 0))
          scrollTo(0, 0)
        })
      } else {
        setR(next)
        scrollTo(0, 0)
      }
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return r
}

function Page({ r }: { r: Route }) {
  const [a = '', b = ''] = r.args
  switch (r.name) {
    case '': return <TodayPage />
    case 'day': return <TodayPage date={a} />
    case 'journal': return <JournalPage date={a} />
    case 'plan': return <PlanPage seg={a === 'projects' ? 'projects' : 'agenda'} />
    case 'project': return <ProjectPage name={a} />
    case 'notes': return <NotesPage seg={a === 'stream' ? 'stream' : 'thoughts'} />
    case 'thought': return <ThoughtPage arg={[a, b].filter(Boolean).join('/')} />
    case 'review': return <ReviewPage />
    case 'week': return <WeekPage id={a} />
    case 'file': return <FilePage path={r.args.join('/')} />
    case 'settings': return <SettingsPage />
    default: return <TodayPage />
  }
}

function ToastView() {
  const t = useBox(toastBox)
  return (
    <div class={cx('toast', t && 'show')} role="status" aria-live="polite">
      {t && (
        <>
          <span>{t.msg}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run()
                toastBox.set(null)
              }}
            >
              {t.action.label}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function App() {
  const s = useStore()
  const r = useRoute()
  const tab = TAB_OF[r.name] ?? 'today'
  const connected = !!s.config

  useEffect(() => {
    if (!connected && r.name !== 'settings') location.replace('#/settings')
  }, [connected, r.name])

  // 旧版待办格式：第一次读到时自动升级一次
  const todo = connected ? s.read('todo.md') : undefined
  useEffect(() => {
    if (todo && isLegacy(todo) && !s.hasPending('todo.md', 'todo.migrate')) store.enqueue('todo.md', { kind: 'todo.migrate' })
  }, [todo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea') && FAB[parse().name] && !capture.value) {
        e.preventDefault()
        capture.set(FAB[parse().name]())
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const fab = connected ? FAB[r.name] : undefined
  return (
    <div class={cx('shell', !connected && 'setup')}>
      {connected && (
        <nav class="nav" aria-label="主导航">
          <a class="brand" href="#/">
            <i class="brand-mark" />
            <span>Life Log</span>
          </a>
          {TABS.map(([id, href, label, icon]) => (
            <a class={cx('tab', tab === id && 'on')} href={href} aria-current={tab === id ? 'page' : undefined}>
              <span class="tab-icon">
                <Icon name={icon} />
              </span>
              <span class="tab-label">{label}</span>
            </a>
          ))}
          <button type="button" class="nav-new" onClick={() => capture.set((fab ?? FAB[''])())}>
            <Icon name="plus" />
            新建
          </button>
        </nav>
      )}
      <main class="main">{connected || r.name === 'settings' ? <Page r={r} /> : null}</main>
      {fab && (
        <button type="button" class="fab" aria-label="新建" onClick={() => capture.set(fab())}>
          <Icon name="plus" size={26} />
        </button>
      )}
      <GlobalSheets />
      <ToastView />
    </div>
  )
}
