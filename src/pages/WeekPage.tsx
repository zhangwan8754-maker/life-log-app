import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { setDate } from '../lib/actions'
import { addDays, cnMonthDay, shortWeekday } from '../lib/dates'
import { dayMd, useFile, useToday, useTodo, useTree } from '../lib/hooks'
import { getSection } from '../lib/md'
import { parseReview, reviewMarkdown, reviewPath, weekFromId, weekStats, type ReviewParts } from '../lib/review'
import { store } from '../lib/store'
import { allTasks, INBOX, SOMEDAY } from '../lib/todo'
import { cx, debounce, go, markdown, toast } from '../lib/ui'
import { Trend } from '../components/Charts'
import { Chip } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Card, Empty, Page } from '../components/Page'
import { TaskRow } from '../components/TaskRow'
import { thoughtIndex } from './ReviewPage'

const STEPS = ['回顾', '清理', '反思', '计划'] as const

export function WeekPage({ id }: { id: string }) {
  const r = weekFromId(id)
  const today = useToday()
  useTree('days/', 'thoughts/')
  const { md: todo } = useTodo()
  const me = useFile('me.md') ?? ''
  const path = r ? reviewPath(r) : null
  const existing = useFile(path)
  const [step, setStep] = useState(0)
  const [parts, setParts] = useState<ReviewParts>({ facts: '', patterns: '', next: '' })
  const loaded = useRef(false)

  useEffect(() => {
    if (existing !== undefined && !loaded.current) {
      loaded.current = true
      setParts(parseReview(existing))
    }
  }, [existing])

  const save = useMemo(
    () =>
      debounce((p: ReviewParts) => {
        if (!r || !path) return
        const s = weekStats(r, dayMd, store.read('todo.md') ?? '', thoughtIndex(), today)
        store.enqueue(path, { kind: 'write', content: reviewMarkdown(r, s, p, store.read(path)), label: `复盘 ${r.id}` })
      }, 1200),
    [id],
  )
  useEffect(() => () => save.flush(), [save])

  if (!r) return <Page title="复盘" back={{ href: '#/review', label: '复盘' }}><Empty>无法识别的周：{id}</Empty></Page>

  const stats = weekStats(r, dayMd, todo, thoughtIndex(), today)
  const update = (patch: Partial<ReviewParts>) => {
    const p = { ...parts, ...patch }
    setParts(p)
    save(p)
  }
  const finish = () => {
    save(parts)
    save.flush()
    toast(`已保存 ${r.id} 复盘`)
    go(`#/file/${encodeURIComponent(path!)}`)
  }

  return (
    <Page title={`第 ${r.week} 周`} subtitle={`${cnMonthDay(r.from)} – ${cnMonthDay(r.to)}`} back={{ href: '#/review', label: '复盘' }} class="week-page">
      <ol class="stepper">
        {STEPS.map((s, i) => (
          <li class={cx(i === step && 'on', i < step && 'done')}>
            <button type="button" onClick={() => setStep(i)}>
              <span class="step-dot">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              <span>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <Recap r={r} stats={stats} />}
      {step === 1 && <Tidy today={today} />}
      {step === 2 && <Reflect parts={parts} update={update} stats={stats} />}
      {step === 3 && <PlanNext today={today} me={me} />}

      <div class="step-actions">
        {step > 0 && (
          <button type="button" class="btn" onClick={() => setStep(step - 1)}>
            上一步
          </button>
        )}
        {step < 3 ? (
          <button type="button" class="btn primary" onClick={() => setStep(step + 1)}>
            下一步：{STEPS[step + 1]}
          </button>
        ) : (
          <button type="button" class="btn primary" onClick={finish}>
            <Icon name="check" size={18} />
            完成复盘
          </button>
        )}
      </div>
    </Page>
  )
}

function Recap({ r, stats }: { r: NonNullable<ReturnType<typeof weekFromId>>; stats: ReturnType<typeof weekStats> }) {
  const excerpts = r.days
    .map((d) => ({ d, j: (getSection(dayMd(d) ?? '', '日记') ?? '').split('\n').find((l) => l.trim()) }))
    .filter((x) => x.j)
  return (
    <>
      <p class="step-intro">先只看事实：这一周发生了什么。</p>
      <div class="tiles">
        <div class="tile">
          <span class="tile-num">{stats.completed.length}</span>
          <span class="tile-label">完成</span>
        </div>
        <div class="tile">
          <span class="tile-num">{stats.daysLogged}/7</span>
          <span class="tile-label">记录天数</span>
        </div>
        <div class="tile">
          <span class="tile-num">{stats.moodAvg}</span>
          <span class="tile-label">平均情绪</span>
        </div>
        <div class="tile">
          <span class="tile-num">{stats.energyAvg}</span>
          <span class="tile-label">平均精力</span>
        </div>
      </div>
      {(stats.mood.some((v) => v !== null) || stats.energy.some((v) => v !== null)) && (
        <Card title="情绪与精力">
          <Trend dates={r.days} mood={stats.mood} energy={stats.energy} />
        </Card>
      )}
      <Card title="完成了" action={<span class="count">{stats.completed.length}</span>}>
        {stats.completed.length ? (
          <ul class="plain-list">
            {stats.completed.map((t) => (
              <li>
                <Icon name="check" size={16} />
                {t.text}
                <span class="muted"> · {t.group}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>这周还没有完成的待办。</Empty>
        )}
      </Card>
      {excerpts.length > 0 && (
        <Card title="日记摘录">
          <ul class="plain-list excerpts">
            {excerpts.map((x) => (
              <li>
                <a href={`#/journal/${x.d}`}>
                  <span class="muted">{shortWeekday(x.d)}</span> {x.j}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {stats.thoughts.length > 0 && (
        <Card title="新的思想">
          <p>{stats.thoughts.join('、')}</p>
        </Card>
      )}
    </>
  )
}

function Tidy({ today }: { today: string }) {
  const { groups } = useTodo()
  const open = allTasks(groups).filter((t) => !t.done)
  const overdue = open.filter((t) => t.date && t.date < today)
  const inbox = open.filter((t) => t.group === INBOX && !t.date)
  return (
    <>
      <p class="step-intro">把悬着的事处理掉：右滑完成，左滑改期，点开可以归到项目或删除。</p>
      <Card title={<span class="over">逾期</span>} action={<span class="count">{overdue.length}</span>}>
        {overdue.length ? (
          <div class="tasks">
            {overdue.map((t) => (
              <TaskRow task={t} today={today} />
            ))}
          </div>
        ) : (
          <Empty>没有逾期的事。</Empty>
        )}
      </Card>
      <Card title="收件箱" action={<span class="count">{inbox.length}</span>}>
        {inbox.length ? (
          <div class="tasks">
            {inbox.map((t) => (
              <TaskRow task={t} today={today} />
            ))}
          </div>
        ) : (
          <Empty>收件箱已清空。</Empty>
        )}
      </Card>
    </>
  )
}

function Reflect({ parts, update, stats }: { parts: ReviewParts; update: (p: Partial<ReviewParts>) => void; stats: ReturnType<typeof weekStats> }) {
  const field = (k: keyof ReviewParts, label: string, hint: string) => (
    <label class="card reflect">
      <span class="reflect-label">{label}</span>
      <span class="reflect-hint">{hint}</span>
      <textarea rows={4} value={parts[k]} onInput={(e) => update({ [k]: (e.target as HTMLTextAreaElement).value })} />
    </label>
  )
  return (
    <>
      <p class="step-intro">数据会自动写进复盘。你只需要写三件事。</p>
      {field('facts', '事实', `这周发生了什么？只写事实。（完成 ${stats.completed.length} 件，记录 ${stats.daysLogged} 天）`)}
      {field('patterns', '模式', '什么在重复？哪些事让状态变好或变差？说的和做的一致吗？')}
      {field('next', '下一步', '最多 3 条，写成能执行的动作。下一页可以直接排进日程。')}
    </>
  )
}

function PlanNext({ today, me }: { today: string; me: string }) {
  const { groups } = useTodo()
  const goals = getSection(me, '今年')?.replace(/^-\s*$/gm, '').trim()
  const mon = addDays(today, ((8 - new Date().getDay()) % 7) || 7)
  const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  const open = allTasks(groups).filter((t) => !t.done)
  const scheduled = open.filter((t) => t.date >= week[0] && t.date <= week[6])
  const candidates = open.filter((t) => !t.date && t.group !== SOMEDAY)
  return (
    <>
      <p class="step-intro">对照今年的目标，挑出下周最重要的几件，排上日子。</p>
      <Card title="今年的目标">
        {goals ? (
          <div class="prose small" dangerouslySetInnerHTML={{ __html: markdown(goals) }} />
        ) : (
          <Empty>
            还没写。<a href="#/file/me.md">去「我是谁」里填上</a>，复盘时就能对照。
          </Empty>
        )}
      </Card>
      <Card title="下周已安排" action={<span class="count">{scheduled.length}</span>}>
        {scheduled.length ? (
          <div class="tasks">
            {scheduled
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((t) => (
                <TaskRow task={t} today={today} />
              ))}
          </div>
        ) : (
          <Empty>下周还没有安排。</Empty>
        )}
      </Card>
      <Card title="还没排日期" action={<span class="count">{candidates.length}</span>}>
        {candidates.length ? (
          <ul class="pick-list">
            {candidates.map((t) => (
              <li>
                <div class="pick-text">
                  {t.text}
                  {t.group !== INBOX && <span class="muted"> · {t.group}</span>}
                </div>
                <div class="chips tight">
                  {week.map((d) => (
                    <Chip onClick={() => setDate(t, d)}>{shortWeekday(d).slice(1)}</Chip>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>所有任务都排好了。</Empty>
        )}
      </Card>
    </>
  )
}
