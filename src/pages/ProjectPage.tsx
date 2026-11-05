import { useEffect, useState } from 'preact/hooks'
import { add } from '../lib/actions'
import { useToday, useTodo } from '../lib/hooks'
import { store } from '../lib/store'
import { go, toast } from '../lib/ui'
import { Icon } from '../components/Icon'
import { Card, Empty, Page } from '../components/Page'
import { Sheet } from '../components/Sheet'
import { TaskRow } from '../components/TaskRow'
import { progress } from './PlanPage'

export function ProjectPage({ name }: { name: string }) {
  const today = useToday()
  const { groups, loading } = useTodo()
  const g = groups.find((x) => x.name === name)
  const [text, setText] = useState('')
  const [edit, setEdit] = useState(false)
  const back = { href: g?.kind === 'project' ? '#/plan/projects' : '#/plan', label: '计划' }

  if (!g)
    return (
      <Page title={name} back={back}>
        {loading ? <div class="loading-block" /> : <Empty>找不到这个项目，可能已被改名或删除。</Empty>}
      </Page>
    )

  const p = progress(g)
  const open = g.tasks.filter((t) => !t.done)
  const done = g.tasks.filter((t) => t.done).sort((a, b) => b.doneOn.localeCompare(a.doneOn))
  return (
    <Page
      title={g.name}
      subtitle={g.goal || (g.kind === 'inbox' ? '还没归到项目的事' : g.kind === 'someday' ? '也许某天会做' : undefined)}
      back={back}
      actions={
        g.kind === 'project' && (
          <button type="button" class="icon-btn" aria-label="项目设置" onClick={() => setEdit(true)}>
            <Icon name="more" />
          </button>
        )
      }
    >
      {g.kind === 'project' && p.total > 0 && (
        <div class="project-progress">
          <div class="bar large">
            <i style={{ width: `${p.pct}%` }} />
          </div>
          <span>
            {p.done}/{p.total} · {p.pct}%
          </span>
        </div>
      )}
      <Card>
        <form
          class="inline-add top"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            add(text.trim(), g.name, '')
            setText('')
          }}
        >
          <Icon name="plus" size={20} />
          <input value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} placeholder={`添加到「${g.name}」`} enterKeyHint="done" aria-label="新任务" />
        </form>
        <div class="tasks">
          {open.map((t) => (
            <TaskRow task={t} today={today} showGroup={false} />
          ))}
        </div>
        {!open.length && <Empty>{done.length ? '这里的事都做完了。' : '还没有任务。'}</Empty>}
      </Card>
      {done.length > 0 && (
        <details class="card done-card">
          <summary>
            <h2>已完成</h2>
            <span class="count">{done.length}</span>
          </summary>
          <div class="tasks">
            {done.slice(0, 50).map((t) => (
              <TaskRow task={t} today={today} showGroup={false} showDate={false} />
            ))}
          </div>
        </details>
      )}
      {g.kind === 'project' && <ProjectSheet open={edit} onClose={() => setEdit(false)} name={g.name} goal={g.goal} canDelete={!open.length} />}
    </Page>
  )
}

function ProjectSheet({ open, onClose, name, goal, canDelete }: { open: boolean; onClose: () => void; name: string; goal: string; canDelete: boolean }) {
  const [n, setN] = useState(name)
  const [gl, setGl] = useState(goal)
  const { groups } = useTodo()
  useEffect(() => {
    if (open) {
      setN(name)
      setGl(goal)
    }
  }, [open])
  const clean = n.trim()
  const taken = clean !== name && groups.some((g) => g.name === clean)
  return (
    <Sheet open={open} onClose={onClose} title="项目设置" label="项目设置">
      <form
        class="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!clean || taken) return
          if (gl.trim() !== goal) store.enqueue('todo.md', { kind: 'project.goal', name, goal: gl.trim() })
          if (clean !== name) {
            store.enqueue('todo.md', { kind: 'project.rename', from: name, to: clean })
            go(`#/project/${encodeURIComponent(clean)}`)
          }
          onClose()
        }}
      >
        <label class="field">
          <span>名称</span>
          <input value={n} onInput={(e) => setN((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>目标</span>
          <input value={gl} onInput={(e) => setGl((e.target as HTMLInputElement).value)} placeholder="做到什么程度算完成？" />
        </label>
        {taken && <p class="hint over">已经有同名的分组了。</p>}
        <button type="submit" class="btn primary block" disabled={!clean || taken}>
          保存
        </button>
        <button
          type="button"
          class="btn danger block"
          disabled={!canDelete}
          onClick={() => {
            if (!confirm(`删除项目「${name}」？已完成的任务也会一起删除。`)) return
            store.enqueue('todo.md', { kind: 'project.delete', name })
            toast(`已删除「${name}」`)
            onClose()
            go('#/plan/projects')
          }}
        >
          <Icon name="trash" size={18} />
          {canDelete ? '删除项目' : '还有未完成的任务，不能删除'}
        </button>
      </form>
    </Sheet>
  )
}
