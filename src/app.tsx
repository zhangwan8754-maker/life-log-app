import { useEffect, useRef, useState } from 'preact/hooks'
import { capture } from './lib/actions'
import { useStore } from './lib/hooks'
import { store } from './lib/store'
import { INBOX, isLegacy } from './lib/todo'
import { cx, toastBox, useBox } from './lib/ui'
import * as A from './lib/actions'
import { GlobalSheets } from './components/GlobalSheets'
import { BrandMark, Icon } from './components/Icon'
import { FilePage } from './pages/FilePage'
import { PlanHome, SideNav } from './pages/HomePage'
import { JournalPage } from './pages/JournalPage'
import { MePage } from './pages/MePage'
import { MemoryPage } from './pages/MemoryPage'
import { AdvicePage } from './pages/AdvicePage'
import { UpcomingPage } from './pages/UpcomingPage'
import { ProjectPage } from './pages/ProjectPage'
import { HistoryPage, ReviewPage, StatsPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'
import { WeekPage } from './pages/WeekPage'

interface Route {
  name: string
  args: string[]
}
const parse = (): Route => {
  const [name = '', ...args] = location.hash.replace(/^#\/?/, '').split('/')
  return { name, args: args.map(decodeURIComponent) }
}

/** 层级：四个主页 0，进入一层 1，再深一层 2。决定切换动画的方向 */
const DEPTH: Record<string, number> = {
  '': 0, day: 0, home: 0, plan: 0, memory: 0, notes: 0, review: 0,
  upcoming: 1, project: 1, journal: 1, week: 1, me: 1, settings: 1, advice: 1, proposals: 1, stats: 1, history: 1,
  file: 2,
}

type Tab = 'today' | 'plan' | 'memory' | 'review'
const TAB_OF: Record<string, Tab> = {
  '': 'today', day: 'today', journal: 'today',
  home: 'plan', plan: 'plan', upcoming: 'plan', project: 'plan',
  memory: 'memory', notes: 'memory',
  review: 'review', week: 'review', me: 'review', file: 'review', settings: 'review', advice: 'review', proposals: 'review', stats: 'review', history: 'review',
}
const TABS: [Tab, string, string, string][] = [
  ['today', '#/', '今天', 'today'],
  ['plan', '#/plan', '计划', 'plan'],
  ['memory', '#/memory', '记忆', 'memory'],
  ['review', '#/review', '复盘', 'review'],
]

/** 显示 ＋ 的页面，以及它的默认值 */
const FAB: Record<string, () => Parameters<typeof capture.set>[0]> = {
  '': () => ({ mode: 'task' }),
  home: () => ({ mode: 'task', date: '' }),
  day: () => ({ mode: 'task' }),
  upcoming: () => ({ mode: 'task', date: '' }),
  plan: () => ({ mode: 'task', date: '' }),
  project: () => ({ mode: 'task', date: '', group: parse().args[0] || INBOX }),
  memory: () => ({ mode: 'note' }),
  notes: () => ({ mode: 'note' }),
  review: () => ({ mode: 'task' }),
}

function useRoute(): Route {
  const [r, setR] = useState(parse)
  useEffect(() => {
    let cur = parse()
    const on = () => {
      const next = parse()
      const a = DEPTH[cur.name] ?? 1
      const b = DEPTH[next.name] ?? 1
      cur = next
      document.documentElement.dataset.nav = b > a ? 'push' : b < a ? 'pop' : 'fade'
      const vt = (document as any).startViewTransition
      if (vt && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const t = vt.call(document, async () => {
          setR(next)
          await new Promise((res) => setTimeout(res, 0))
          scrollTo(0, 0)
        })
        // 快速连续跳转时，前一个过渡会被取消：这是正常的，不算错误
        for (const p of [t.ready, t.finished, t.updateCallbackDone]) p?.catch(() => {})
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
  const [a = ''] = r.args
  switch (r.name) {
    case 'home':
    case 'plan': return <PlanHome />
    case '': return <TodayPage />
    case 'day': return <TodayPage date={a} />
    case 'journal': return <JournalPage date={a} />
    case 'upcoming': return <UpcomingPage />
    case 'project': return <ProjectPage name={a} />
    case 'memory': return <MemoryPage seg={a === 'notes' || a === 'patterns' ? a : 'timeline'} />
    // 旧地址：笔记 → 记忆
    case 'notes': return <MemoryPage seg="notes" />
    case 'advice':
    case 'proposals': return <AdvicePage agent={a} />
    case 'stats': return <StatsPage />
    case 'history': return <HistoryPage />
    case 'review': return <ReviewPage />
    case 'week': return <WeekPage id={a} />
    case 'me': return <MePage />
    case 'file': return <FilePage path={r.args.join('/')} />
    case 'settings': return <SettingsPage />
    default: return <TodayPage />
  }
}

/** 侧栏「计划」下面高亮哪一项 */
const currentOf = (r: Route) => (r.name === 'project' ? r.args[0] : r.name === 'upcoming' ? 'upcoming' : undefined)

function ToastView() {
  const cur = useBox(toastBox)
  // 淡出时保留最后一条内容，避免出现一个空的小方块
  const last = useRef(cur)
  if (cur) last.current = cur
  const t = cur ?? last.current
  return (
    <div class={cx('toast', cur && 'show')} role="status" aria-live="polite">
      {t && (
        <>
          <span>{t.msg}</span>
          {t.action && (
            <button
              type="button"
              tabIndex={cur ? 0 : -1}
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
  const connected = !!s.config
  const timing = useBox(A.timer)

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
  // 记忆层的文件（大事记等）从「记忆」进来，其余文件属于「复盘」
  const tab = r.name === 'file' && r.args[0] === 'memory' ? 'memory' : (TAB_OF[r.name] ?? 'today')
  return (
    <div class={cx('shell', !connected && 'setup')}>
      {connected && (
        <aside class="side">
          <div class="side-brand">
            <BrandMark size={22} />
            Life Log
          </div>
          <SideNav tab={tab} current={currentOf(r)} />
        </aside>
      )}
      <main class="main">{connected || r.name === 'settings' ? <Page r={r} /> : null}</main>
      {connected && (
        <nav class="tabbar" aria-label="主导航">
          {TABS.map(([id, href, label, icon]) => (
            <a href={href} class={cx(tab === id && 'on')} aria-current={tab === id ? 'page' : undefined}>
              <Icon name={icon} size={25} />
              <span>{label}</span>
              {id === 'today' && timing && <i class={cx('tab-dot', !!timing.paused && 'paused')} aria-label="正在计时" />}
            </a>
          ))}
        </nav>
      )}
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
