import { useState } from 'preact/hooks'
import { addDays, dayPath, isoWeek } from '../lib/dates'
import { dayMd, useFile, useStore, useToday, useTree } from '../lib/hooks'
import { getMeta, score } from '../lib/md'
import { aiPrompt, reviewPath, weekOf, weekStats } from '../lib/review'
import { store } from '../lib/store'
import { toast } from '../lib/ui'
import { Heatmap, type Metric, Trend } from '../components/Charts'
import { ListRow, Segmented } from '../components/Controls'
import { Icon } from '../components/Icon'
import { Card, Page } from '../components/Page'
import { titleOf } from './ThoughtPage'

export const thoughtIndex = () =>
  store.list('thoughts/').map((p) => {
    const md = store.read(p) ?? ''
    return { title: titleOf(p, md), created: getMeta(md, 'created') }
  })

export function ReviewPage() {
  const s = useStore()
  const today = useToday()
  useTree('days/', 'thoughts/', 'reviews/')
  const todo = useFile('todo.md') ?? ''
  const me = useFile('me.md') ?? ''
  const [metric, setMetric] = useState<Metric>('mood')
  const [year, setYear] = useState(Number(today.slice(0, 4)))

  const r = weekOf(today)
  const stats = weekStats(r, dayMd, todo, thoughtIndex(), today)
  const done = s.read(reviewPath(r))
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
  const series = (k: Metric) => last30.map((d) => score(getMeta(dayMd(d) ?? '', k)))
  const reviews = s
    .list('reviews/')
    .filter((p) => !p.endsWith('_template.md') && p !== reviewPath(r))
    .reverse()
  // 周一、周二时，上周的复盘更有意义
  const prev = weekOf(addDays(r.from, -1))
  const prevMissing = ['1', '2'].includes(String(new Date().getDay())) && !s.read(reviewPath(prev)) && s.treeLoaded

  return (
    <Page title="复盘" subtitle="按周回看，再规划下一周">
      <section class="hero">
        <div class="hero-text">
          <span class="hero-eyebrow">
            {r.from.slice(5).replace('-', '/')} – {r.to.slice(5).replace('-', '/')}
          </span>
          <h2>第 {r.week} 周复盘</h2>
          <p>{done ? '已经写过了，可以继续补充。' : '回顾这周、清理待办、写下反思，再排好下周。大约 10 分钟。'}</p>
        </div>
        <div class="hero-actions">
          <a class="btn primary" href={`#/week/${r.id}`}>
            {done ? '继续' : '开始复盘'}
          </a>
          {done && (
            <a class="btn on-hero" href={`#/file/${encodeURIComponent(reviewPath(r))}`}>
              查看
            </a>
          )}
        </div>
      </section>
      {prevMissing && (
        <a class="banner" href={`#/week/${prev.id}`}>
          <Icon name="review" />
          <span>上周（第 {prev.week} 周）还没复盘</span>
          <Icon name="right" size={18} />
        </a>
      )}

      <div class="tiles">
        <div class="tile">
          <span class="tile-num">{stats.completed.length}</span>
          <span class="tile-label">本周完成</span>
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

      <Card title="近 30 天">
        {series('mood').some((v) => v !== null) || series('energy').some((v) => v !== null) ? (
          <Trend dates={last30} mood={series('mood')} energy={series('energy')} />
        ) : (
          <p class="empty">最近 30 天还没有打分。在「今天」点情绪、精力卡片打分。</p>
        )}
      </Card>

      <Card
        title={
          <span class="year-nav">
            <button type="button" class="icon-btn small" aria-label="上一年" onClick={() => setYear(year - 1)}>
              <Icon name="back" size={18} />
            </button>
            {year}
            <button type="button" class="icon-btn small" aria-label="下一年" onClick={() => setYear(year + 1)}>
              <Icon name="right" size={18} />
            </button>
          </span>
        }
        action={
          <Segmented
            value={metric}
            options={[
              { value: 'mood', label: '情绪' },
              { value: 'energy', label: '精力' },
            ]}
            onChange={setMetric}
          />
        }
      >
        <Heatmap year={year} metric={metric} value={(d) => score(getMeta(dayMd(d) ?? '', metric))} has={(d) => !!dayMd(d)} />
      </Card>

      <Card class="ai-card">
        <div class="ai-row">
          <span class="ai-icon">
            <Icon name="sparkle" />
          </span>
          <div>
            <h3>让 Claude 帮你复盘</h3>
            <p>把「我是谁」、本周每天的记录和待办整理成一段话，粘贴到 Claude 即可。</p>
          </div>
        </div>
        <button
          type="button"
          class="btn tonal block"
          onClick={async () => {
            const text = aiPrompt(r, me, dayMd, todo, stats)
            try {
              await navigator.clipboard.writeText(text)
              toast('已复制，去 Claude 里粘贴吧')
            } catch {
              toast('复制失败，请检查浏览器权限')
            }
          }}
        >
          <Icon name="copy" size={18} />
          复制本周上下文
        </button>
      </Card>

      <div class="list-group">
        <ListRow icon="person" label="我是谁" detail={me ? '' : '未填写'} href="#/file/me.md" />
        {reviews.slice(0, 12).map((p) => {
          const id = p.replace(/^reviews\/|\.md$/g, '')
          const m = id.match(/^(\d{4})-W(\d+)$/)
          return <ListRow icon="review" label={m ? `${m[1]} 年第 ${Number(m[2])} 周` : id} href={`#/file/${encodeURIComponent(p)}`} />
        })}
        <ListRow icon="settings" label="设置" href="#/settings" />
      </div>
      <p class="footnote">第 {isoWeek(today)[1]} 周 · 数据都在你的 GitHub 仓库里，<code>{dayPath(today)}</code></p>
    </Page>
  )
}
