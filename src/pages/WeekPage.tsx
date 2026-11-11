import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { setDate } from '../lib/actions'
import { addDays, cnMonthDay, shortWeekday } from '../lib/dates'
import { dayMd, useFile, useToday, useTodo, useTree } from '../lib/hooks'
import { fmtHours, getSection } from '../lib/md'
import { termGoals } from '../lib/me'
import { nextSteps, parseReview, prevWeek, reviewMarkdown, reviewPath, weekFromId, weekStats, type ReviewParts } from '../lib/review'
import { store } from '../lib/store'
import { allTasks, INBOX, SOMEDAY } from '../lib/todo'
import { cx, debounce, go, markdown, toast } from '../lib/ui'
import { Trend } from '../components/Charts'
import { Chip } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Empty, Page } from '../components/Page'
import { NoteRow } from '../components/NoteSheet'
import { SpentBars } from '../components/Spent'
import { TaskRow } from '../components/TaskRow'
import { Stats, thoughtIndex } from './ReviewPage'

const STEPS = ['回顾', '清理', '反思', '计划'] as const

export function WeekPage({ id }: { id: string }) {
  const r = weekFromId(id)
  const today = useToday()
  useTree('days/', 'thoughts/')
  const { md: todo } = useTodo()
  const me = useFile('me.md') ?? ''
  const path = r ? reviewPath(r) : null
  const existing = useFile(path)
  // 上一期说的下一步：这一期复盘的第一件事是回来看它们做了没有
  const promised = nextSteps(useFile(r ? reviewPath(prevWeek(r)) : null))
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

  if (!r)
    return (
      <Page title="复盘" back={{ href: '#/review', label: '复盘' }}>
        <Empty>无法识别的周：{id}</Empty>
      </Page>
    )

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
      <div class="steps" role="tablist">
        <span class="steps-text">
          {step + 1} / 4 · <b>{STEPS[step]}</b>
        </span>
        <span class="steps-dots">
          {STEPS.map((s, i) => (
            <button type="button" role="tab" aria-selected={i === step} aria-label={s} class={cx(i === step && 'on', i < step && 'done')} onClick={() => setStep(i)} />
          ))}
        </span>
      </div>

      {step === 0 && <Recap r={r} stats={stats} promised={promised} />}
      {step === 1 && <Tidy today={today} />}
      {step === 2 && <Reflect parts={parts} update={update} stats={stats} promised={promised} />}
      {step === 3 && <PlanNext today={today} me={me} />}

      <div class="step-actions">
        {step > 0 ? (
          <button type="button" class="btn" onClick={() => setStep(step - 1)}>
            上一步
          </button>
        ) : (
          <span />
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

function Recap({ r, stats, promised }: { r: NonNullable<ReturnType<typeof weekFromId>>; stats: ReturnType<typeof weekStats>; promised: string[] }) {
  const excerpts = r.days
    .map((d) => ({ d, j: (getSection(dayMd(d) ?? '', '日记') ?? '').split('\n').find((l) => l.trim()) }))
    .filter((x) => x.j)
  return (
    <>
      <p class="step-intro">先只看事实：这一周发生了什么。</p>
      {promised.length > 0 && (
        <>
          <p class="group-label">上周说要做的</p>
          <div class="group promised">
            <ol>
              {promised.map((x) => (
                <li>{x}</li>
              ))}
            </ol>
            <p class="group-foot">做了吗？到「反思」那一步，先把这几条写进事实。</p>
          </div>
          <p class="group-label">这一周</p>
        </>
      )}
      <Stats s={stats} />
      {stats.spent.length > 0 && (
        <>
          <p class="group-label label-bar">
            <span>投入</span>
            <span class="label-detail">合计 {fmtHours(stats.spentTotal)}</span>
          </p>
          <div class="group spent-group">
            <SpentBars items={stats.spent} />
          </div>
        </>
      )}
      {(stats.mood.some((v) => v !== null) || stats.energy.some((v) => v !== null)) && (
        <>
          <p class="group-label">情绪与精力</p>
          <div class="group chart-group">
            <Trend dates={r.days} mood={stats.mood} energy={stats.energy} />
          </div>
        </>
      )}
      <p class="group-label">完成了 {stats.completed.length} 件</p>
      <div class="group">
        {stats.completed.length ? (
          stats.completed.map((t) => (
            <div class="row plain">
              <span class="row-icon">
                <Icon name="check" size={20} />
              </span>
              <span class="row-label">{t.text}</span>
              <span class="row-detail">{t.group}</span>
            </div>
          ))
        ) : (
          <p class="group-empty">这周还没有完成的待办。</p>
        )}
      </div>
      {excerpts.length > 0 && (
        <>
          <p class="group-label">日记摘录</p>
          <div class="group">
            {excerpts.map((x) => (
              <a class="row excerpt" href={`#/journal/${x.d}`}>
                <span class="excerpt-day">{shortWeekday(x.d)}</span>
                <span class="row-label">{x.j}</span>
              </a>
            ))}
          </div>
        </>
      )}
      {stats.marked.length > 0 && (
        <>
          <p class="group-label">标了「学到 / 问题」的速记</p>
          <div class="group">
            <ul class="notes in-group">
              {stats.marked.map((n) => (
                <NoteRow date={n.date} note={n} />
              ))}
            </ul>
            <p class="group-foot">点开一条，可以提炼成思想。</p>
          </div>
        </>
      )}
      {stats.thoughts.length > 0 && (
        <>
          <p class="group-label">新的思想</p>
          <div class="group">
            <p class="group-text">{stats.thoughts.join('、')}</p>
          </div>
        </>
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
      <p class="group-label late">逾期 {overdue.length}</p>
      <div class="group">
        {overdue.length ? (
          <div class="tasks">
            {overdue.map((t) => (
              <TaskRow task={t} today={today} />
            ))}
          </div>
        ) : (
          <p class="group-empty">没有逾期的事。</p>
        )}
      </div>
      <p class="group-label">收件箱 {inbox.length}</p>
      <div class="group">
        {inbox.length ? (
          <div class="tasks">
            {inbox.map((t) => (
              <TaskRow task={t} today={today} />
            ))}
          </div>
        ) : (
          <p class="group-empty">收件箱已经清空。</p>
        )}
      </div>
    </>
  )
}

function Reflect({ parts, update, stats, promised }: { parts: ReviewParts; update: (p: Partial<ReviewParts>) => void; stats: ReturnType<typeof weekStats>; promised: string[] }) {
  // 上周的下一步里，还没在「事实」里提到的
  const missing = promised.filter((x) => !parts.facts.includes(x))
  const field = (k: keyof ReviewParts, label: string, hint: string) => (
    <>
      <p class="group-label">{label}</p>
      <label class="group reflect">
        <textarea rows={4} value={parts[k]} placeholder={hint} aria-label={label} onInput={(e) => update({ [k]: (e.target as HTMLTextAreaElement).value })} />
      </label>
    </>
  )
  return (
    <>
      <p class="step-intro">数据会自动写进复盘，你只需要写三件事。</p>
      {field('facts', '事实', `这周发生了什么？只写事实。（完成 ${stats.completed.length} 件，记录 ${stats.daysLogged} 天）`)}
      {missing.length > 0 && (
        <div class="below">
          <button
            type="button"
            class="text-btn small"
            onClick={() => update({ facts: [parts.facts.trim(), ...missing.map((x) => `- 上周说「${x}」：`)].filter(Boolean).join('\n') })}
          >
            带入上周的 {missing.length} 条下一步
          </button>
        </div>
      )}
      {field('patterns', '模式', '什么在重复？哪些事让状态变好或变差？说的和做的一致吗？')}
      {field('next', '下一步', '最多 3 条，写成能执行的动作。每条都是一次小实验，下周复盘时先回来看它。')}
    </>
  )
}

function PlanNext({ today, me }: { today: string; me: string }) {
  const { groups } = useTodo()
  const goals = termGoals(me)
  const mon = addDays(today, ((8 - new Date().getDay()) % 7) || 7)
  const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  const open = allTasks(groups).filter((t) => !t.done)
  const scheduled = open.filter((t) => t.date >= week[0] && t.date <= week[6]).sort((a, b) => a.date.localeCompare(b.date))
  const candidates = open.filter((t) => !t.date && t.group !== SOMEDAY)
  return (
    <>
      <p class="step-intro">对照这学期的方向，挑出下周最重要的几件，排上日子。</p>
      <p class="group-label">这学期的方向</p>
      <div class="group">
        {goals ? (
          <div class="prose group-text" dangerouslySetInnerHTML={{ __html: markdown(goals) }} />
        ) : (
          <p class="group-empty">
            还没写。<a href="#/me">去「我是谁」里填上「方向 · 这学期」</a>，复盘时就能对照。
          </p>
        )}
      </div>
      <p class="group-label">下周已安排 {scheduled.length}</p>
      <div class="group">
        {scheduled.length ? (
          <div class="tasks">
            {scheduled.map((t) => (
              <TaskRow task={t} today={today} />
            ))}
          </div>
        ) : (
          <p class="group-empty">下周还没有安排。</p>
        )}
      </div>
      <p class="group-label">还没排日期 {candidates.length}</p>
      <div class="group">
        {candidates.length ? (
          candidates.map((t) => (
            <div class="pick-item">
              <div class="pick-text">
                {t.text}
                {t.group !== INBOX && <span class="muted"> · {t.group}</span>}
              </div>
              <div class="chips tight">
                {week.map((d) => (
                  <Chip onClick={() => setDate(t, d)}>{shortWeekday(d).slice(1)}</Chip>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p class="group-empty">所有任务都排好了。</p>
        )}
      </div>
    </>
  )
}
