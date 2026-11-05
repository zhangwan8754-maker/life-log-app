import { addDays, parseYmd, ymd } from '../lib/dates'
import { getMeta, getSection, parseNotes, score, stripFrontmatter } from '../lib/md'
import { store } from '../lib/store'
import { go, h } from '../lib/ui'
import { titleOf } from './thought'

type Metric = 'mood' | 'energy'
const NAMES: Record<Metric, string> = { mood: '情绪', energy: '精力' }
const SVG = 'http://www.w3.org/2000/svg'
const s = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

let year = new Date().getFullYear()
let metric: Metric = 'mood'

export function mountReview(root: HTMLElement) {
  const yearLabel = h('span.year')
  const metricBtns = (['mood', 'energy'] as Metric[]).map((m) =>
    h('button.chip', { type: 'button', onclick: () => ((metric = m), render()) }, NAMES[m]),
  )
  const heat = h('div.heat')
  const stats = h('dl.stats')
  const trend = h('div.trend')
  const q = h('input.line-input', { type: 'search', placeholder: '搜索日记、速记、思想', oninput: () => search() })
  const results = h('ul.results')
  const reviews = h('ul.links')
  const tip = h('div.tip', { role: 'tooltip' })

  const view = h(
    'article.fade.wide',
    h('header.page-head', h('div.eyebrow', '复盘'), h('h1.title', '回看')),
    h('nav.quick', h('a', { href: '#/file/me.md' }, '我是谁'), h('a', { href: '#/settings' }, '设置')),
    h(
      'section',
      h(
        'div.heat-head',
        h('button.icon', { type: 'button', title: '上一年', onclick: () => (year--, render()) }, '‹'),
        yearLabel,
        h('button.icon', { type: 'button', title: '下一年', onclick: () => (year++, render()) }, '›'),
        h('span.spacer'),
        ...metricBtns,
      ),
      h('div.heat-wrap', heat, tip),
      stats,
    ),
    h('section', h('h2.sec', '近 30 天'), trend),
    h('section', h('h2.sec', '搜索'), q, results),
    h('section', h('h2.sec', '复盘'), reviews),
  )
  root.replaceChildren(view)

  const days = () =>
    store.list('days/').map((p) => ({ p, date: p.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1] ?? '', md: store.read(p) ?? '' }))

  function render() {
    view.classList.toggle('loading', !store.treeLoaded)
    yearLabel.textContent = String(year)
    metricBtns.forEach((b, i) => b.classList.toggle('on', ['mood', 'energy'][i] === metric))
    const all = days()
    const byDate = new Map(all.map((d) => [d.date, d]))

    // 年度热力图：列 = 周（周一开始），行 = 星期
    const jan1 = new Date(year, 0, 1)
    let cur = addDays(ymd(jan1), -((jan1.getDay() + 6) % 7))
    const end = `${year}-12-31`
    const today = ymd()
    const cols: HTMLElement[] = []
    const months: HTMLElement[] = []
    let lastMonth = -1
    while (cur <= end) {
      const col = h('div.heat-col')
      for (let r = 0; r < 7; r++) {
        const date = cur
        const inYear = date.startsWith(String(year))
        const d = byDate.get(date)
        const v = d ? score(getMeta(d.md, metric)) : null
        const cell = h('button.cell', { type: 'button', 'aria-label': date, disabled: !inYear })
        if (!inYear) cell.classList.add('out')
        else if (v !== null) cell.style.setProperty('--v', String(v / 10)), cell.classList.add('val', metric)
        else if (d) cell.classList.add('has')
        if (date === today) cell.classList.add('today')
        if (inYear) {
          cell.onclick = () => go(`#/day/${date}`)
          cell.onmouseenter = cell.onfocus = () => {
            const n = d ? parseNotes(d.md).length : 0
            tip.textContent = `${date}　${NAMES[metric]} ${v ?? '—'}${n ? `　速记 ${n}` : ''}`
            tip.style.left = `${cell.offsetLeft + col.offsetLeft}px`
            tip.style.top = `${cell.offsetTop - 30}px`
            tip.classList.add('show')
          }
          cell.onmouseleave = cell.onblur = () => tip.classList.remove('show')
        }
        col.append(cell)
        cur = addDays(cur, 1)
      }
      const m = parseYmd(addDays(cur, -7)).getMonth()
      months.push(h('span', m !== lastMonth && addDays(cur, -7).startsWith(String(year)) ? `${m + 1}月` : ''))
      if (addDays(cur, -7).startsWith(String(year))) lastMonth = m
      cols.push(col)
    }
    heat.replaceChildren(h('div.heat-months', months), h('div.heat-grid', cols))
    // 窄屏：默认滚到今天附近
    const wrap = heat.parentElement!
    const t = heat.querySelector<HTMLElement>('.cell.today')
    if (t && wrap.scrollWidth > wrap.clientWidth && !wrap.dataset.scrolled) {
      wrap.dataset.scrolled = '1'
      requestAnimationFrame(() => (wrap.scrollLeft = t.parentElement!.offsetLeft - wrap.clientWidth * 0.7))
    }

    // 统计
    const inYear = all.filter((d) => d.date.startsWith(String(year)))
    const avg = (k: Metric) => {
      const xs = inYear.map((d) => score(getMeta(d.md, k))).filter((x): x is number => x !== null)
      return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—'
    }
    const notes = inYear.reduce((a, d) => a + parseNotes(d.md).length, 0)
    stats.replaceChildren(
      ...([
        ['记录天数', inYear.length],
        ['平均情绪', avg('mood')],
        ['平均精力', avg('energy')],
        ['速记', notes],
        ['思想', store.list('thoughts/').length],
      ] as const).flatMap(([k, v]) => [h('div', h('dt', k), h('dd', v))]),
    )

    renderTrend(byDate)

    reviews.replaceChildren(
      ...store
        .list('reviews/')
        .filter((p) => !p.endsWith('_template.md'))
        .reverse()
        .map((p) => h('li', h('a', { href: `#/file/${encodeURIComponent(p)}` }, p.replace(/^reviews\/|\.md$/g, '')))),
    )
    if (!reviews.children.length) reviews.replaceChildren(h('li.empty', '还没有复盘。可以让 Claude 读仓库，按 reviews/_template.md 写一份。'))
    if (q.value) search()
  }

  // 近 30 天：情绪与精力（同一 1–10 量表，同一坐标轴）
  function renderTrend(byDate: Map<string, { md: string }>) {
    const W = 640, H = 160, P = { l: 24, r: 44, t: 12, b: 22 }
    const dates = Array.from({ length: 30 }, (_, i) => addDays(ymd(), i - 29))
    const x = (i: number) => P.l + (i / 29) * (W - P.l - P.r)
    const y = (v: number) => P.t + (1 - (v - 1) / 9) * (H - P.t - P.b)
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'trend-svg', role: 'img', 'aria-label': '近 30 天情绪与精力' })
    for (const v of [1, 5, 10]) {
      svg.append(s('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'grid' }))
      const t = s('text', { x: P.l - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' })
      t.textContent = String(v)
      svg.append(t)
    }
    for (const [i, d] of [[0, dates[0]], [29, dates[29]]] as const) {
      const t = s('text', { x: x(i), y: H - 4, class: 'axis', 'text-anchor': i ? 'end' : 'start' })
      t.textContent = d.slice(5).replace('-', '/')
      svg.append(t)
    }
    const series = (['mood', 'energy'] as Metric[]).map((k) => ({
      k,
      pts: dates.map((d, i) => ({ i, d, v: score(getMeta(byDate.get(d)?.md ?? '', k)) })),
    }))
    let any = false
    for (const { k, pts } of series) {
      // 断开没有打分的日子，不做插值
      let seg: string[] = []
      const flush = () => {
        if (seg.length > 1) svg.append(s('polyline', { points: seg.join(' '), class: `line ${k}` }))
        seg = []
      }
      for (const p of pts) {
        if (p.v === null) flush()
        else {
          any = true
          seg.push(`${x(p.i)},${y(p.v)}`)
          svg.append(s('circle', { cx: x(p.i), cy: y(p.v), r: 3, class: `pt ${k}` }))
        }
      }
      flush()
      const last = [...pts].reverse().find((p) => p.v !== null)
      if (last) {
        const t = s('text', { x: x(last.i) + 8, y: y(last.v!) + 4, class: 'label' })
        t.textContent = NAMES[k]
        svg.append(t)
      }
    }
    // 悬停：竖线 + 当日数值
    const cross = s('line', { y1: P.t, y2: H - P.b, class: 'cross', visibility: 'hidden' })
    const readout = h('div.readout')
    svg.append(cross)
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect()
      const px = ((e.clientX - r.left) / r.width) * W
      const i = Math.max(0, Math.min(29, Math.round(((px - P.l) / (W - P.l - P.r)) * 29)))
      cross.setAttribute('x1', String(x(i)))
      cross.setAttribute('x2', String(x(i)))
      cross.setAttribute('visibility', 'visible')
      const [m, en] = series.map((sr) => sr.pts[i].v ?? '—')
      readout.textContent = `${dates[i]}　情绪 ${m}　精力 ${en}`
    })
    svg.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden')
      readout.textContent = ''
    })
    svg.addEventListener('click', () => {
      const t = readout.textContent?.slice(0, 10)
      if (t) go(`#/day/${t}`)
    })
    const legend = h(
      'div.legend',
      h('span', h('i.sw.mood'), '情绪'),
      h('span', h('i.sw.energy'), '精力'),
      readout,
    )
    trend.replaceChildren(any ? svg : h('p.empty', '最近 30 天还没有打分。在「今天」页点选情绪和精力。'), any ? legend : '')
  }

  function search() {
    const kw = q.value.trim().toLowerCase()
    if (!kw) return results.replaceChildren()
    const hits: { href: string; title: string; snip: string; sort: string }[] = []
    const snip = (text: string) => {
      const i = text.toLowerCase().indexOf(kw)
      if (i < 0) return null
      return (i > 30 ? '…' : '') + text.slice(Math.max(0, i - 30), i + kw.length + 60).replace(/\s+/g, ' ')
    }
    for (const d of days()) {
      const text = `${getSection(d.md, '日记') ?? ''}\n${parseNotes(d.md).map((n) => n.text).join('\n')}`
      const sn = snip(text)
      if (sn) hits.push({ href: `#/day/${d.date}`, title: d.date, snip: sn, sort: d.date })
    }
    for (const p of store.list('thoughts/')) {
      const md = store.read(p) ?? ''
      const sn = snip(titleOf(p, md) + '\n' + stripFrontmatter(md))
      if (sn) hits.push({ href: `#/thought/${encodeURIComponent(p)}`, title: titleOf(p, md), snip: sn, sort: getMeta(md, 'created') })
    }
    hits.sort((a, b) => b.sort.localeCompare(a.sort))
    const mark = (t: string) => {
      const i = t.toLowerCase().indexOf(kw)
      return i < 0 ? [t] : [t.slice(0, i), h('mark', t.slice(i, i + kw.length)), t.slice(i + kw.length)]
    }
    results.replaceChildren(
      ...hits.slice(0, 40).map((r) => h('li', h('a', { href: r.href }, h('span.r-title', r.title), h('span.r-snip', mark(r.snip))))),
    )
    if (!hits.length) results.replaceChildren(h('li.empty', '没有找到。'))
  }

  render()
  store.loadTree(['days/', 'thoughts/'])
  return store.subscribe(render)
}

