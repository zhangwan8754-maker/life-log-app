import { useState } from 'preact/hooks'
import { useToday, useTodo } from '../lib/hooks'
import { store } from '../lib/store'
import { allTasks, INBOX, SOMEDAY, type Group } from '../lib/todo'
import { go, toast } from '../lib/ui'
import { ListRow, Pie } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Page } from '../components/Page'
import { Sheet } from '../components/Sheet'

const undone = (g: Group) => g.tasks.filter((t) => !t.done).length || ''
const pie = (g: Group, size = 20) => <Pie done={g.tasks.filter((t) => t.done).length} total={g.tasks.length} size={size} />

/** 「计划」主页：收件箱、日程、各个项目、将来 */
export function PlanHome() {
  const today = useToday()
  const { groups } = useTodo()
  const [newProject, setNewProject] = useState(false)
  const projects = groups.filter((g) => g.kind === 'project')
  const inbox = groups.find((g) => g.kind === 'inbox')!
  const someday = groups.find((g) => g.kind === 'someday')!
  const upcoming = allTasks(groups).filter((t) => !t.done && t.date > today).length

  return (
    <Page title="计划" icon="plan">
      <div class="group">
        <ListRow icon="inbox" label="收件箱" detail={undone(inbox)} href={`#/project/${encodeURIComponent(INBOX)}`} chev />
        <ListRow icon="upcoming" label="日程" detail={upcoming || ''} href="#/upcoming" chev />
      </div>
      <p class="group-label">项目</p>
      <div class="group">
        {projects.map((g) => (
          <ListRow lead={pie(g)} label={g.name} detail={undone(g)} href={`#/project/${encodeURIComponent(g.name)}`} chev />
        ))}
        <ListRow icon="plus" label={<span class="muted">新项目</span>} onClick={() => setNewProject(true)} />
      </div>
      <div class="group">
        <ListRow icon="box" label="将来" detail={undone(someday)} href={`#/project/${encodeURIComponent(SOMEDAY)}`} chev />
      </div>
      <NewProjectSheet open={newProject} onClose={() => setNewProject(false)} />
    </Page>
  )
}

/** 桌面端左侧栏：四个主页，计划下面列出项目 */
export function SideNav({ tab, current }: { tab: string; current?: string }) {
  const today = useToday()
  const { groups } = useTodo()
  const open = allTasks(groups).filter((t) => !t.done)
  const projects = groups.filter((g) => g.kind === 'project')
  return (
    <nav aria-label="主导航">
      <div class="side-group">
        <ListRow icon="today" label="今天" detail={open.filter((t) => t.date && t.date <= today).length || ''} href="#/" on={tab === 'today'} />
        <ListRow icon="plan" label="计划" href="#/plan" on={tab === 'plan' && !current} />
        <ListRow icon="memory" label="记忆" href="#/memory" on={tab === 'memory'} />
        <ListRow icon="review" label="复盘" href="#/review" on={tab === 'review'} />
      </div>
      <div class="side-group">
        <p class="side-label">计划</p>
        {groups
          .filter((g) => g.kind === 'inbox')
          .map((g) => (
            <ListRow icon="inbox" label={g.name} detail={undone(g)} href={`#/project/${encodeURIComponent(g.name)}`} on={current === g.name} />
          ))}
        <ListRow icon="upcoming" label="日程" href="#/upcoming" on={current === 'upcoming'} />
        {projects.map((g) => (
          <ListRow lead={pie(g, 18)} label={g.name} detail={undone(g)} href={`#/project/${encodeURIComponent(g.name)}`} on={current === g.name} />
        ))}
        <ListRow icon="box" label={SOMEDAY} href={`#/project/${encodeURIComponent(SOMEDAY)}`} on={current === SOMEDAY} />
      </div>
    </nav>
  )
}

export function NewProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const { groups } = useTodo()
  const clean = name.trim()
  const taken = groups.some((g) => g.name === clean)
  return (
    <Sheet open={open} onClose={onClose} title="新项目" label="新项目">
      <form
        class="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!clean || taken) return
          store.enqueue('todo.md', { kind: 'project.add', name: clean, goal: goal.trim() })
          toast(`已创建「${clean}」`)
          setName('')
          setGoal('')
          onClose()
          go(`#/project/${encodeURIComponent(clean)}`)
        }}
      >
        <input class="field-input big" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="项目名称" aria-label="项目名称" />
        <input class="field-input" value={goal} onInput={(e) => setGoal((e.target as HTMLInputElement).value)} placeholder="做到什么程度算完成？（可选）" aria-label="项目目标" />
        {taken && <p class="hint late">已经有同名的分组了。</p>}
        <div class="quick-bottom">
          <button type="button" class="text-btn muted" onClick={onClose}>
            取消
          </button>
          <button type="submit" class="text-btn strong" disabled={!clean || taken}>
            <Icon name="plus" size={18} />
            创建
          </button>
        </div>
      </form>
    </Sheet>
  )
}
