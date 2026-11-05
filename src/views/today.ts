import { addDays, cnMonthDay, dayPath, isoWeek, weekday, ymd } from '../lib/dates'
import { getMeta, getSection, parseNotes, score } from '../lib/md'
import { store } from '../lib/store'
import { autoGrow, debounce, go, h } from '../lib/ui'
import { setDraft } from './thought'

export function mountDay(root: HTMLElement, date = ymd()) {
  const path = dayPath(date)
  const isToday = date === ymd()
  const [, week] = isoWeek(date)

  const dots = (key: 'mood' | 'energy') => {
    const btns = Array.from({ length: 10 }, (_, i) =>
      h('button.dot', {
        type: 'button',
        'aria-label': `${i + 1} 分`,
        onclick: () => {
          const cur = score(getMeta(store.read(path) ?? '', key))
          store.enqueue(path, { kind: 'meta', date, key, value: cur === i + 1 ? '' : String(i + 1) })
        },
      }),
    )
    const val = h('span.score-val')
    const row = h('div.score', h('span.score-label', key === 'mood' ? '情绪' : '精力'), h('div.dots', btns), val)
    const update = (md: string) => {
      const n = score(getMeta(md, key))
      btns.forEach((b, i) => b.classList.toggle('on', n !== null && i < n))
      val.textContent = n === null ? '—' : String(n)
    }
    return { row, update }
  }
  const mood = dots('mood')
  const energy = dots('energy')

  const journal = h('textarea.journal', {
    placeholder: isToday ? '今天发生了什么？感受如何？' : '这一天发生了什么？',
    rows: 6,
  })
  const fit = autoGrow(journal)
  const saved = h('span.hint')
  const save = debounce(() => {
    store.enqueue(path, { kind: 'journal', date, text: journal.value })
    saved.textContent = ''
  }, 1500)
  journal.addEventListener('input', () => {
    saved.textContent = '编辑中'
    save()
  })
  journal.addEventListener('blur', () => {
    if (saved.textContent) save.flush()
  })

  const notes = h('ol.notes')
  const emptyNotes = h('p.empty', isToday ? '用下方输入框随手记下此刻的想法。' : '这一天没有速记。')

  const view = h(
    'article.day.fade',
    h(
      'header.page-head',
      h('div.eyebrow', `${date.slice(0, 4)} · 第${week}周 · ${weekday(date)}`),
      h('h1.title', cnMonthDay(date)),
      h(
        'nav.day-nav',
        h('a', { href: `#/day/${addDays(date, -1)}` }, '‹ 前一天'),
        isToday ? h('span.muted', '今天') : h('a', { href: '#/' }, '回到今天'),
        h('a', { href: `#/day/${addDays(date, 1)}` }, '后一天 ›'),
      ),
    ),
    h('section.scores', mood.row, energy.row),
    h('section', h('h2.sec', '日记', saved), journal),
    h('section', h('h2.sec', '速记'), notes, emptyNotes),
  )
  root.replaceChildren(view)

  const render = () => {
    const md = store.read(path)
    view.classList.toggle('loading', md === undefined)
    const text = md ?? ''
    mood.update(text)
    energy.update(text)
    const j = getSection(text, '日记') ?? ''
    if (document.activeElement !== journal && !saved.textContent && journal.value !== j) {
      journal.value = j
      fit()
    }
    const list = parseNotes(text)
    emptyNotes.hidden = list.length > 0
    notes.replaceChildren(
      ...list.map((n) =>
        h(
          'li',
          h('time', n.time),
          h('span', n.text),
          h('button.icon', {
            type: 'button',
            title: '提炼为思想',
            onclick: () => {
              setDraft({ body: n.text, from: date })
              go('#/thought/new')
            },
          }, '↗'),
        ),
      ),
    )
  }
  render()
  store.load(path)
  const off = store.subscribe(render)
  return () => {
    if (saved.textContent) save.flush()
    off()
  }
}
