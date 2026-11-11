import { useState } from 'preact/hooks'
import { addDays, cnMonthDay } from '../lib/dates'
import { dayMd, useFile, useStore, useToday, useTree } from '../lib/hooks'
import { fmtHours, getMeta, score } from '../lib/md'
import { parsePatterns, parseProposals, PATTERNS, PROPOSALS } from '../lib/memory'
import { parseMe } from '../lib/me'
import { aiPrompt, nextSteps, periodLabel, prevWeek, reviewPath, weekOf, weekStats, type WeekStats } from '../lib/review'
import { store } from '../lib/store'
import { go, toast } from '../lib/ui'
import { Heatmap, type Metric, Trend } from '../components/Charts'
import { ListRow, Tabs } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Page } from '../components/Page'
import { SpentBars } from '../components/Spent'
import { titleOf } from './ThoughtPage'

export const thoughtIndex = () =>
  store.list('thoughts/').map((p) => {
    const md = store.read(p) ?? ''
    return { title: titleOf(p, md), created: getMeta(md, 'created') }
  })

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

export function ReviewPage() {
  const s = useStore()
  const today = useToday()
  useTree('days/', 'thoughts/', 'reviews/', 'memory/')
  const todo = useFile('todo.md') ?? ''
  const me = useFile('me.md') ?? ''
  const meDoc = parseMe(me)
  const [metric, setMetric] = useState<Metric>('mood')
  const [year, setYear] = useState(Number(today.slice(0, 4)))

  const r = weekOf(today)
  const stats = weekStats(r, dayMd, todo, thoughtIndex(), today)
  const done = s.read(reviewPath(r))
  const prev = prevWeek(r)
  const patterns = parsePatterns(s.read(PATTERNS))
  const proposals = parseProposals(s.read(PROPOSALS))
  const prevMissing = s.treeLoaded && today <= addDays(r.from, 1) && !s.read(reviewPath(prev))
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  const series = (k: Metric) => last30.map((d) => score(getMeta(dayMd(d) ?? '', k)))
  const hasTrend = series('mood').some((v) => v !== null) || series('energy').some((v) => v !== null)
  const reviews = s
    .list('reviews/')
    .filter((p) => !p.endsWith('_template.md'))
    .reverse()

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

      <p class="group-label">本周</p>
      <Stats s={stats} />
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

      <p class="group-label">迭代</p>
      <div class="group">
        <ListRow icon="sparkle" label="AI 的提议" detail={proposals.length ? `${proposals.length} 条等你决定` : '没有'} href="#/proposals" chev />
        <ListRow icon="pattern" label="模式" detail={patterns.length ? `${patterns.filter((p) => p.status === '观察中').length} 条观察中` : '还没有'} href="#/memory/patterns" chev />
        <ListRow icon="person" label="我是谁" detail={meDoc.filled ? `${meDoc.filled}/${meDoc.total}` : '未填写'} href="#/me" chev />
      </div>

      <p class="group-label">近 30 天</p>
      <div class="group chart-group">
        {hasTrend ? <Trend dates={last30} mood={series('mood')} energy={series('energy')} /> : <p class="group-empty">最近 30 天还没有打分。在「今天」页底部点情绪、精力打分。</p>}
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

      <div class="group">
        <ListRow
          icon="sparkle"
          label="复制给 AI"
          detail="本周上下文"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(aiPrompt(r, me, dayMd, todo, stats, { prevNext: nextSteps(s.read(reviewPath(prev))), patterns }))
              toast('已复制，粘贴到 Claude 里就能复盘')
            } catch {
              toast('复制失败，请检查浏览器权限')
            }
          }}
        />
        <ListRow icon="settings" label="设置" href="#/settings" chev />
      </div>

      {reviews.length > 0 && (
        <>
          <p class="group-label">历史复盘</p>
          <div class="group">
            {reviews.slice(0, 20).map((p) => {
              const id = p.replace(/^reviews\/|\.md$/g, '')
              return <ListRow icon="journal" label={periodLabel(id)} href={`#/file/${encodeURIComponent(p)}`} chev />
            })}
          </div>
        </>
      )}
    </Page>
  )
}
