import { useEffect, useRef, useState } from 'preact/hooks'
import { add, recent, visible } from '../lib/actions'
import { useToday, useTodo } from '../lib/hooks'
import { store } from '../lib/store'
import { go, toast, useBox } from '../lib/ui'
import { groupIcon } from '../components/GlobalSheets'
import { Icon } from '../components/Icon'
import { Empty, Page } from '../components/Page'
import { Sheet } from '../components/Sheet'
import { TaskRow } from '../components/TaskRow'

export function ProjectPage({ name }: { name: string }) {
  const today = useToday()
  const { groups, loading } = useTodo()
  const rec = useBox(recent)
  const g = groups.find((x) => x.name === name)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [edit, setEdit] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (adding) input.current?.focus()
  }, [adding])

  if (!g)
    return (
      <Page title={name} back={{ href: '#/plan', label: '计划' }}>
        {loading ? null : <Empty icon="box">找不到这个项目，可能已经改名或删除了。</Empty>}
      </Page>
    )

  const open = g.tasks.filter((t) => visible(t, rec))
  const done = g.tasks.filter((t) => t.done && !rec[`${t.group}|${t.key}`]).sort((a, b) => b.doneOn.localeCompare(a.doneOn))
  const note = g.goal || (g.kind === 'inbox' ? '还没想好放哪儿的事，先放这里。' : g.kind === 'someday' ? '也许某天会做的事。' : '')

  return (
    <Page
      title={g.name}
      icon={groupIcon(g, 26)}
      back={{ href: '#/plan', label: '计划' }}
      subtitle={note && <span class="goal">{note}</span>}
      actions={
        g.kind === 'project' && (
          <button type="button" class="icon-btn" aria-label="项目设置" onClick={() => setEdit(true)}>
            <Icon name="more" size={22} />
          </button>
        )
      }
    >
      <div class="group">
        <div class="tasks">
          {open.map((t) => (
            <TaskRow task={t} today={today} showGroup={false} />
          ))}
        </div>
        {adding ? (
          <form
            class="add-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim()) return setAdding(false)
              add(text.trim(), g.name, '')
              setText('')
            }}
          >
            <span class="add-box" />
            <input
              ref={input}
              value={text}
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
              onBlur={() => !text.trim() && setAdding(false)}
              placeholder="新的待办"
              enterKeyHint="done"
              aria-label="新任务"
            />
          </form>
        ) : (
          <button type="button" class="add-row ghost" onClick={() => setAdding(true)}>
            <Icon name="plus" size={20} />
            新待办
          </button>
        )}
      </div>
      {done.length > 0 && (
        <>
          <div class="below">
            <button type="button" class="text-btn muted small" onClick={() => setShowDone(!showDone)}>
              {showDone ? '收起已完成' : `已完成 ${done.length} 件`}
            </button>
          </div>
          {showDone && (
            <div class="group done-group">
              <div class="tasks">
                {done.slice(0, 60).map((t) => (
                  <TaskRow task={t} today={today} showGroup={false} showDate={false} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {g.kind === 'project' && <ProjectSheet open={edit} onClose={() => setEdit(false)} name={g.name} goal={g.goal} canDelete={!g.tasks.some((t) => !t.done)} />}
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
    <Sheet open={open} onClose={onClose} title="项目" label="项目设置">
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
        <input class="field-input big" value={n} onInput={(e) => setN((e.target as HTMLInputElement).value)} aria-label="名称" />
        <input class="field-input" value={gl} onInput={(e) => setGl((e.target as HTMLInputElement).value)} placeholder="做到什么程度算完成？" aria-label="目标" />
        {taken && <p class="hint late">已经有同名的分组了。</p>}
        <div class="quick-bottom">
          <button
            type="button"
            class="text-btn danger"
            disabled={!canDelete}
            title={canDelete ? '' : '还有未完成的任务'}
            onClick={() => {
              if (!confirm(`删除项目「${name}」？已完成的任务也会一起删除。`)) return
              store.enqueue('todo.md', { kind: 'project.delete', name })
              toast(`已删除「${name}」`)
              onClose()
              go('#/plan')
            }}
          >
            删除项目
          </button>
          <button type="submit" class="text-btn strong" disabled={!clean || taken}>
            保存
          </button>
        </div>
        {!canDelete && <p class="hint">还有未完成的任务时不能删除。</p>}
      </form>
    </Sheet>
  )
}
