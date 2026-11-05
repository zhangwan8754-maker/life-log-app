import { useState } from 'preact/hooks'
import { addDays, cnMonthDay, relDay, shortWeekday } from '../lib/dates'
import { useToday, useTodo } from '../lib/hooks'
import { store } from '../lib/store'
import { allTasks, INBOX, SOMEDAY, type Group, type Task } from '../lib/todo'
import { go, toast } from '../lib/ui'
import { ListRow, Segmented } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Card, Empty, Page } from '../components/Page'
import { Sheet } from '../components/Sheet'
import { TaskRow } from '../components/TaskRow'

export function PlanPage({ seg }: { seg: 'agenda' | 'projects' }) {
  const [newProject, setNewProject] = useState(false)
  return (
    <Page
      title="计划"
      actions={
        seg === 'projects' && (
          <button type="button" class="icon-btn" aria-label="新项目" onClick={() => setNewProject(true)}>
            <Icon name="plus" />
          </button>
        )
      }
    >
      <Segmented
        value={seg}
        options={[
          { value: 'agenda', label: '日程' },
          { value: 'projects', label: '项目' },
        ]}
        onChange={(v) => go(v === 'projects' ? '#/plan/projects' : '#/plan')}
      />
      {seg === 'agenda' ? <Agenda /> : <Projects onNew={() => setNewProject(true)} />}
      <NewProjectSheet open={newProject} onClose={() => setNewProject(false)} />
    </Page>
  )
}

function Agenda() {
  const today = useToday()
  const { groups, loading } = useTodo()
  const open = allTasks(groups).filter((t) => !t.done)
  const inbox = groups.find((g) => g.name === INBOX)!.tasks.filter((t) => !t.done && !t.date)
  const overdue = open.filter((t) => t.date && t.date < today)
  const horizon = addDays(today, 14)
  const byDay = new Map<string, Task[]>()
  for (const t of open) if (t.date >= today && t.date <= horizon) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t])
  const later = open.filter((t) => t.date > horizon).sort((a, b) => a.date.localeCompare(b.date))
  const days = [...byDay.keys()].sort()
  const undatedInProjects = open.filter((t) => !t.date && t.group !== INBOX && t.group !== SOMEDAY).length

  if (loading) return <div class="loading-block" />
  return (
    <>
      <Card title={<><Icon name="inbox" size={18} /> 收件箱</>} action={<span class="count">{inbox.length || ''}</span>}>
        {inbox.length ? (
          <>
            <p class="card-hint">左滑安排日期，点开可以归到项目。</p>
            <div class="tasks">
              {inbox.map((t) => (
                <TaskRow task={t} today={today} />
              ))}
            </div>
          </>
        ) : (
          <Empty>收件箱是空的。</Empty>
        )}
      </Card>
      {overdue.length > 0 && (
        <Card title={<span class="over">逾期</span>} action={<span class="count">{overdue.length}</span>}>
          <div class="tasks">
            {overdue.map((t) => (
              <TaskRow task={t} today={today} />
            ))}
          </div>
        </Card>
      )}
      {days.map((d) => (
        <Card
          title={
            <>
              {relDay(d, today) === cnMonthDay(d) ? shortWeekday(d) : relDay(d, today)}
              <span class="card-title-sub">{cnMonthDay(d)}</span>
            </>
          }
          action={<span class="count">{byDay.get(d)!.length}</span>}
        >
          <div class="tasks">
            {byDay.get(d)!.map((t) => (
              <TaskRow task={t} today={today} showDate={false} />
            ))}
          </div>
        </Card>
      ))}
      {later.length > 0 && (
        <Card title="以后">
          <div class="tasks">
            {later.map((t) => (
              <TaskRow task={t} today={today} />
            ))}
          </div>
        </Card>
      )}
      {!days.length && !overdue.length && !later.length && <Empty>未来两周还没有安排。点右下角 ＋ 新建，或在「项目」里给任务排上日期。</Empty>}
      {undatedInProjects > 0 && (
        <a class="banner subtle" href="#/plan/projects">
          <Icon name="folder" />
          <span>项目里还有 {undatedInProjects} 件没排日期</span>
          <Icon name="right" size={18} />
        </a>
      )}
    </>
  )
}

export const progress = (g: Group) => {
  const total = g.tasks.length
  const done = g.tasks.filter((t) => t.done).length
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}

function Projects({ onNew }: { onNew: () => void }) {
  const today = useToday()
  const { groups, loading } = useTodo()
  const projects = groups.filter((g) => g.kind === 'project')
  const inbox = groups.find((g) => g.kind === 'inbox')!
  const someday = groups.find((g) => g.kind === 'someday')!
  if (loading) return <div class="loading-block" />
  return (
    <>
      <div class="project-grid">
        {projects.map((g) => {
          const p = progress(g)
          const next = g.tasks.filter((t) => !t.done).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0]
          return (
            <a class="card project-card" href={`#/project/${encodeURIComponent(g.name)}`}>
              <div class="project-head">
                <h3>{g.name}</h3>
                <span class="count">
                  {p.done}/{p.total}
                </span>
              </div>
              {g.goal && <p class="project-goal">{g.goal}</p>}
              <div class="bar" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${p.pct}%` }} />
              </div>
              <p class="project-next">
                {next ? (
                  <>
                    下一步：{next.text}
                    {next.date && <span class={next.date < today ? 'over' : ''}> · {relDay(next.date, today)}</span>}
                  </>
                ) : p.total ? (
                  '全部完成 🎉'
                ) : (
                  '还没有任务'
                )}
              </p>
            </a>
          )
        })}
        <button type="button" class="card project-card new" onClick={onNew}>
          <Icon name="plus" />
          新项目
        </button>
      </div>
      <div class="list-group">
        <ListRow icon="inbox" label="收件箱" detail={inbox.tasks.filter((t) => !t.done).length || ''} href={`#/project/${encodeURIComponent(INBOX)}`} />
        <ListRow icon="flag" label="将来 · 也许会做" detail={someday.tasks.filter((t) => !t.done).length || ''} href={`#/project/${encodeURIComponent(SOMEDAY)}`} />
      </div>
    </>
  )
}

function NewProjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        <label class="field">
          <span>名称</span>
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="例如：读书计划" autoFocus />
        </label>
        <label class="field">
          <span>目标（可选）</span>
          <input value={goal} onInput={(e) => setGoal((e.target as HTMLInputElement).value)} placeholder="做到什么程度算完成？" />
        </label>
        {taken && <p class="hint over">已经有同名的分组了。</p>}
        <button type="submit" class="btn primary block" disabled={!clean || taken}>
          创建
        </button>
      </form>
    </Sheet>
  )
}
