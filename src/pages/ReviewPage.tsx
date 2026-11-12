import { useState } from 'preact/hooks'
import * as A from '../lib/actions'
import { addDays, cnMonthDay } from '../lib/dates'
import { dayMd, useFile, useStore, useToday, useTree } from '../lib/hooks'
import { fmtHours, getMeta, score } from '../lib/md'
import { parseMe } from '../lib/me'
import { parsePatterns, PATTERNS } from '../lib/memory'
import { aiPrompt, nextSteps, periodLabel, prevWeek, reviewPath, weekOf, weekStats, type WeekStats } from '../lib/review'
import { store } from '../lib/store'
import { go, toast } from '../lib/ui'
import { Heatmap, type Metric, Trend } from '../components/Charts'
import { ListRow, Tabs } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Empty, Page } from '../components/Page'
import { SpentBars } from '../components/Spent'
import { TargetBars } from '../components/Targets'
import { useAdvisors } from './AdvicePage'

/** 一行四个数字 */
export function Stats({ s }: { s: WeekStats }) {
  const items: [string | number, string][] = [
    [s.completed.length, '完成'],
    [`${s.daysLogged}/7`, '记录天数'],
    [s.moodAvg, '平均情绪'],
    [s.energyAvg, '平均精力'],
  ]
  return (
    <div class="group stats">
      {items.map(([v, k]) => (
        <div class="stat">
          <span class="stat-num">{v}</span>
          <span class="stat-label">{k}</span>
        </div>
      ))}
    </div>
  )
}

const reviewFiles = () =>
  store
    .list('reviews/')
    .filter((p) => !p.endsWith('_template.md'))
    .reverse()

/**
 * 「复盘」主页只留四件事：这一周的复盘、各个 AI 的建议、往回看（数据 / 历史 / 我是谁）、工具。
 * 图表都收在「数据」里。
 */
export function ReviewPage() {
  const s = useStore()
  const today = useToday()
  useTree('days/', 'reviews/', 'memory/')
  const todo = useFile('todo.md') ?? ''
  const me = useFile('me.md') ?? ''
  const meDoc = parseMe(me)
  const all = useAdvisors()

  const r = weekOf(today)
  const stats = weekStats(r, dayMd, todo, today, me)
  const done = s.read(reviewPath(r))
  const prev = prevWeek(r)
  const prevMissing = s.treeLoaded && today <= addDays(r.from, 1) && !s.read(reviewPath(prev))
  const history = reviewFiles().length
  const weekLine = [`记录 ${stats.daysLogged}/7 天`, stats.spentTotal > 0 && `投入 ${fmtHours(stats.spentTotal)}`].filter(Boolean).join(' · ')

  return (
    <Page title="复盘" icon="review">
      <div class="group week-card">
        <div class="week-card-text">
          <span class="week-card-title">第 {r.week} 周</span>
          <span class="week-card-sub">
            {cnMonthDay(r.from)} – {cnMonthDay(r.to)} · {done ? '已经写过，可以继续补充' : '回顾这周，再排好下周'}
          </span>
        </div>
        <button type="button" class="btn primary block" onClick={() => go(`#/week/${r.id}`)}>
          {done ? '继续复盘' : '开始复盘'}
        </button>
        {prevMissing && (
          <button type="button" class="text-btn small" onClick={() => go(`#/week/${prev.id}`)}>
            上周（第 {prev.week} 周）还没复盘 ›
          </button>
        )}
      </div>

      {all.length > 0 && (
        <>
          <p class="group-label">AI 的建议</p>
          <div class="group advisors">
            {all.map((a) => (
              <ListRow icon="sparkle" label={a.name} detail={a.items.length ? `${a.items.length} 条` : '没有新的'} href={`#/advice/${encodeURIComponent(a.agent)}`} chev />
            ))}
          </div>
        </>
      )}

      <div class="group">
        <ListRow icon="chart" label="数据" detail={weekLine} href="#/stats" chev />
        <ListRow icon="person" label="我是谁" detail={meDoc.filled ? `${meDoc.filled}/${meDoc.total}` : '未填写'} href="#/me" chev />
        <ListRow icon="journal" label="历史复盘" detail={history ? `${history} 篇` : ''} href="#/history" chev />
      </div>

      <div class="group">
        <ListRow
          icon="copy"
          label="复制给 AI"
          detail="本周上下文"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(aiPrompt(r, me, dayMd, todo, stats, { prevNext: nextSteps(s.read(reviewPath(prev))), patterns: parsePatterns(s.read(PATTERNS)) }))
              toast('已复制，粘贴给任何一个 AI 都能复盘')
            } catch {
              toast('复制失败，请检查浏览器权限')
            }
          }}
        />
        <ListRow icon="settings" label="设置" href="#/settings" chev />
      </div>
    </Page>
  )
}

/** 数据：本周数字、投入、近 30 天趋势、年度热力图 */
export function StatsPage() {
  const today = useToday()
  useTree('days/')
  const todo = useFile('todo.md') ?? ''
  const [metric, setMetric] = useState<Metric>('mood')
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const me = useFile('me.md')

  const r = weekOf(today)
  const stats = weekStats(r, dayMd, todo, today, me)
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  const series = (k: Metric) => last30.map((d) => score(getMeta(dayMd(d) ?? '', k)))
  const hasTrend = series('mood').some((v) => v !== null) || series('energy').some((v) => v !== null)

  return (
    <Page title="数据" icon="chart" back={{ href: '#/review', label: '复盘' }} class="stats-page">
      <p class="group-label">本周</p>
      <Stats s={stats} />
      <p class="group-label label-bar">
        <span>本周目标</span>
        <button type="button" class="text-btn small label-btn" onClick={() => A.targetSheet.set(true)}>
          {stats.targets.length ? '改目标' : '设目标'}
        </button>
      </p>
      <div class="group spent-group">
        {stats.targets.length ? <TargetBars items={stats.targets} /> : <p class="group-empty">给每科定一个每周目标，比如数学 10 小时。这里会显示这一周实际投入了多少。</p>}
      </div>
      {stats.spent.length > 0 && (
        <>
          <p class="group-label label-bar">
            <span>本周投入</span>
            <span class="label-detail">合计 {fmtHours(stats.spentTotal)}</span>
          </p>
          <div class="group spent-group">
            <SpentBars items={stats.spent} />
          </div>
        </>
      )}

      <p class="group-label">近 30 天</p>
      <div class="group chart-group">
        {hasTrend ? <Trend dates={last30} mood={series('mood')} energy={series('energy')} /> : <p class="group-empty">最近 30 天还没有打分。在「今天」页点情绪、精力打分。</p>}
      </div>

      <div class="group-label row-label-bar">
        <span class="year-nav">
          <button type="button" class="icon-btn tiny" aria-label="上一年" onClick={() => setYear(year - 1)}>
            <Icon name="back" size={16} />
          </button>
          {year} 年
          <button type="button" class="icon-btn tiny" aria-label="下一年" onClick={() => setYear(year + 1)}>
            <Icon name="right" size={16} />
          </button>
        </span>
        <Tabs
          value={metric}
          options={[
            { value: 'mood', label: '情绪' },
            { value: 'energy', label: '精力' },
          ]}
          onChange={setMetric}
        />
      </div>
      <div class="group chart-group">
        <Heatmap year={year} metric={metric} value={(d) => score(getMeta(dayMd(d) ?? '', metric))} has={(d) => !!dayMd(d)} />
      </div>
    </Page>
  )
}

/** 历史复盘：所有周、月复盘，新的在前 */
export function HistoryPage() {
  const s = useStore()
  useTree('reviews/')
  const files = reviewFiles()
  return (
    <Page title="历史复盘" icon="journal" back={{ href: '#/review', label: '复盘' }}>
      <div class="group">
        {files.map((p) => (
          <ListRow icon="journal" label={periodLabel(p.replace(/^reviews\/|\.md$/g, ''))} href={`#/file/${encodeURIComponent(p)}`} chev />
        ))}
        {s.treeLoaded && !files.length && <Empty icon="journal">还没有复盘。从这一周开始。</Empty>}
      </div>
    </Page>
  )
}
