import { useEffect, useRef, useState } from 'preact/hooks'
import { addDays, parseYmd, ymd } from '../lib/dates'
import { cx, go } from '../lib/ui'

export type Metric = 'mood' | 'energy'
export const METRIC_NAME: Record<Metric, string> = { mood: '情绪', energy: '精力' }

/** 近 N 天的情绪与精力（同一 1–10 量表，同一坐标轴），断开没打分的日子 */
export function Trend({ dates, mood, energy }: { dates: string[]; mood: (number | null)[]; energy: (number | null)[] }) {
  // 按容器真实宽度绘制，文字和线条在手机上不会被缩小
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(340)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 170, P = { l: 26, r: 40, t: 12, b: 24 }
  const n = dates.length
  const x = (i: number) => P.l + (n > 1 ? i / (n - 1) : 0.5) * (W - P.l - P.r)
  const y = (v: number) => P.t + (1 - (v - 1) / 9) * (H - P.t - P.b)
  const [hover, setHover] = useState<number | null>(null)
  const series = [
    { k: 'mood' as Metric, v: mood },
    { k: 'energy' as Metric, v: energy },
  ]
  const segs = (vs: (number | null)[]) => {
    const out: string[][] = []
    let cur: string[] = []
    vs.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur)
        cur = []
      } else cur.push(`${x(i)},${y(v)}`)
    })
    if (cur.length) out.push(cur)
    return out
  }
  const lastIdx = (vs: (number | null)[]) => vs.reduce<number>((a, v, i) => (v !== null ? i : a), -1)
  const onMove = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1)))))
  }
  // 两条线的末端标签挤在一起时错开
  const ends = series.map((s) => ({ ...s, i: lastIdx(s.v) })).filter((s) => s.i >= 0)
  if (ends.length === 2) {
    const [a, b] = ends.map((s) => y(s.v[s.i]!))
    if (Math.abs(a - b) < 14) {
      const mid = (a + b) / 2
      ends[0] = { ...ends[0], dy: (a <= b ? -7 : 7) + mid - a } as any
      ends[1] = { ...ends[1], dy: (a <= b ? 7 : -7) + mid - b } as any
    }
  }
  return (
    <div class="trend" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        class="trend-svg"
        role="img"
        aria-label={`${dates[0]} 至 ${dates[n - 1]} 的情绪与精力`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={() => hover !== null && go(`#/day/${dates[hover]}`)}
      >
        {[1, 5, 10].map((v) => (
          <g>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} class="grid" />
            <text x={P.l - 8} y={y(v) + 4} class="axis" text-anchor="end">
              {v}
            </text>
          </g>
        ))}
        <text x={x(0)} y={H - 4} class="axis">
          {dates[0].slice(5).replace('-', '/')}
        </text>
        <text x={x(n - 1)} y={H - 4} class="axis" text-anchor="end">
          {dates[n - 1].slice(5).replace('-', '/')}
        </text>
        {series.map((s) => (
          <g class={s.k}>
            {segs(s.v).map((pts) => (pts.length > 1 ? <polyline points={pts.join(' ')} class="line" /> : null))}
            {s.v.map((v, i) => (v === null ? null : <circle cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} class="pt" />))}
          </g>
        ))}
        {ends.map((s: any) => (
          <text x={x(s.i) + 9} y={y(s.v[s.i]) + 4 + (s.dy ?? 0)} class="label">
            {METRIC_NAME[s.k as Metric]}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} class="cross" />}
      </svg>
      <div class="legend">
        <span>
          <i class="sw mood" />
          情绪
        </span>
        <span>
          <i class="sw energy" />
          精力
        </span>
        <span class="readout">
          {hover !== null ? `${dates[hover]}　情绪 ${mood[hover] ?? '—'}　精力 ${energy[hover] ?? '—'}` : ''}
        </span>
      </div>
    </div>
  )
}

export function MiniBars({ values, metric }: { values: (number | null)[]; metric: Metric }) {
  return (
    <div class={cx('minibars', metric)} aria-hidden="true">
      {values.map((v) => (
        <i class={v === null ? 'none' : ''} style={{ height: `${v === null ? 3 : 4 + (v / 10) * 20}px` }} />
      ))}
    </div>
  )
}

/** 一排竖条：本周每天、最近几周。条的高矮按这一排里最大的算 */
export function ColBars({ items, label }: { items: { key: string; label: string; value: number; text: string; href?: string; on?: boolean; dim?: boolean }[]; label: string }) {
  const max = Math.max(...items.map((x) => x.value), 0.01)
  return (
    <div class="colbars" role="group" aria-label={label}>
      {items.map((x) => {
        const body = (
          <>
            <span class="colbar-num">{x.value > 0 ? x.text : ''}</span>
            <span class="colbar-track" aria-hidden="true">
              <i style={{ height: x.value > 0 ? `${Math.max(6, (x.value / max) * 100)}%` : '0' }} />
            </span>
            <span class="colbar-label">{x.label}</span>
          </>
        )
        const cls = cx('colbar', x.on && 'on', x.dim && 'dim')
        const aria = `${x.key} ${x.value > 0 ? x.text : '没有投入'}`
        return x.href ? (
          <a class={cls} href={x.href} aria-label={aria}>
            {body}
          </a>
        ) : (
          <span class={cls} aria-label={aria}>
            {body}
          </span>
        )
      })}
    </div>
  )
}

/** 年度热力图：列 = 周（周一开始），行 = 星期。情绪、精力是 1–10 分；投入按小时，颜色深浅由 level 给 */
export function Heatmap({
  year,
  metric,
  name = METRIC_NAME[metric as Metric] ?? '',
  value,
  level = (v) => v / 10,
  fmt = String,
  has,
}: {
  year: number
  /** 决定颜色：mood / energy / spent */
  metric: Metric | 'spent'
  name?: string
  value: (date: string) => number | null
  /** 数值 → 0–1 的深浅 */
  level?: (v: number) => number
  fmt?: (v: number) => string
  has: (date: string) => boolean
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const today = ymd()
  const jan1 = new Date(year, 0, 1)
  let cur = addDays(ymd(jan1), -((jan1.getDay() + 6) % 7))
  const end = `${year}-12-31`
  const cols: { date: string; inYear: boolean }[][] = []
  while (cur <= end) {
    const col = []
    for (let r = 0; r < 7; r++) {
      col.push({ date: cur, inYear: cur.startsWith(String(year)) })
      cur = addDays(cur, 1)
    }
    cols.push(col)
  }
  let lastMonth = -1
  const months = cols.map((c) => {
    const first = c.find((d) => d.inYear)
    if (!first) return ''
    const m = parseYmd(first.date).getMonth()
    if (m === lastMonth) return ''
    lastMonth = m
    return `${m + 1}月`
  })
  useEffect(() => {
    const w = wrap.current
    const t = w?.querySelector<HTMLElement>('.cell.today')
    if (w && t && w.scrollWidth > w.clientWidth) w.scrollLeft = (t.parentElement?.offsetLeft ?? 0) - w.clientWidth * 0.7
  }, [year])
  return (
    <div class="heat-wrap" ref={wrap}>
      <div class="heat">
        <div class="heat-months">
          {months.map((m) => (
            <span>{m}</span>
          ))}
        </div>
        <div class="heat-grid">
          {cols.map((col) => (
            <div class="heat-col">
              {col.map(({ date, inYear }) => {
                const v = inYear ? value(date) : null
                return (
                  <button
                    type="button"
                    class={cx('cell', !inYear && 'out', v !== null && `val ${metric}`, v === null && inYear && has(date) && 'has', date === today && 'today')}
                    style={v !== null ? { '--v': Math.max(0, Math.min(1, level(v))) } : undefined}
                    disabled={!inYear}
                    aria-label={`${date} ${name} ${v !== null ? fmt(v) : '无'}`}
                    onClick={() => go(`#/day/${date}`)}
                    onPointerEnter={(e) => {
                      const el = e.currentTarget as HTMLElement
                      setTip({ x: el.offsetLeft + (el.parentElement?.offsetLeft ?? 0), y: el.offsetTop, text: `${date}　${name} ${v !== null ? fmt(v) : '—'}` })
                    }}
                    onPointerLeave={() => setTip(null)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      {tip && (
        <div class="tip" style={{ left: `${tip.x}px`, top: `${tip.y - 8}px` }}>
          {tip.text}
        </div>
      )}
    </div>
  )
}
