import { hm, ymd } from '../lib/dates'
import { getMeta, newThought, safeTitle, setMeta, setThoughtBody, stripFrontmatter, thoughtBody } from '../lib/md'
import { store } from '../lib/store'
import { autoGrow, debounce, h, markdown } from '../lib/ui'

let draft: { body: string; from: string } | null = null
export const setDraft = (d: typeof draft) => (draft = d)

export const titleOf = (path: string, md?: string | null) =>
  (md && stripFrontmatter(md).match(/^\s*# (.+)$/m)?.[1]?.trim()) || path.replace(/^.*\//, '').replace(/\.md$/, '')

const tagsOf = (md: string) =>
  getMeta(md, 'tags').replace(/^\[|\]$/g, '').split(/[,，\s]+/).filter(Boolean)

// ───── 列表 ─────

export function mountThoughts(root: HTMLElement) {
  const q = h('input.line-input', { type: 'search', placeholder: '搜索思想', oninput: () => render() })
  const list = h('ul.cards')
  const view = h(
    'article.fade',
    h('header.page-head', h('div.eyebrow', '提炼'), h('h1.title', '思想')),
    h('div.toolbar', q, h('a.btn', { href: '#/thought/new' }, '新建')),
    list,
  )
  root.replaceChildren(view)

  const render = () => {
    const kw = q.value.trim().toLowerCase()
    const items = store
      .list('thoughts/')
      .map((p) => ({ p, md: store.read(p) ?? '' }))
      .filter(({ p, md }) => !kw || (p + md).toLowerCase().includes(kw))
      .sort((a, b) => (getMeta(b.md, 'created') || '').localeCompare(getMeta(a.md, 'created') || ''))
    view.classList.toggle('loading', !store.treeLoaded)
    list.replaceChildren(
      ...items.map(({ p, md }) =>
        h(
          'li',
          h(
            'a.card',
            { href: `#/thought/${encodeURIComponent(p)}` },
            h('h3', titleOf(p, md)),
            h('p', thoughtBody(md).replace(/^[\s>#*-]+/gm, '').replace(/[*_`[\]]/g, '').slice(0, 120)),
            h('div.card-meta', getMeta(md, 'created'), ...tagsOf(md).map((t) => h('span.tag', `#${t}`))),
          ),
        ),
      ),
    )
    if (!items.length && store.treeLoaded)
      list.replaceChildren(h('li.empty', kw ? '没有匹配的思想。' : '还没有思想卡片。从速记里点 ↗ 提炼一条。'))
  }
  render()
  store.loadTree(['thoughts/'])
  return store.subscribe(render)
}

// ───── 单篇：阅读 / 编辑 ─────

export function mountThought(root: HTMLElement, arg: string) {
  const isNew = arg === 'new'
  let path = isNew ? '' : decodeURIComponent(arg)
  const d = isNew ? draft : null
  draft = null

  const title = h('input.title-input', { placeholder: '标题', value: '' })
  const body = h('textarea.journal', { placeholder: '把想法写完整：是什么，为什么，怎么用。', rows: 10 })
  const tags = h('input.line-input.small', { placeholder: '标签，用空格分隔' })
  const fit = autoGrow(body)
  const hint = h('span.hint')
  const reader = h('div.reader')
  const editor = h('div.editor', title, body, tags)
  const toggle = h('button.btn', { type: 'button', onclick: () => setMode(!editing) })
  let editing = isNew

  const head = h('header.page-head', h('div.eyebrow', h('a', { href: '#/thoughts' }, '‹ 思想'), hint), toggle)
  root.replaceChildren(h('article.fade', head, reader, editor))

  const save = debounce(() => {
    const t = safeTitle(title.value) || (path ? titleOf(path) : '')
    if (!t && !body.value.trim()) return
    if (!path) {
      let name = t || `${ymd()} ${hm().replace(':', '')}`
      const taken = new Set(store.list('thoughts/'))
      let candidate = `thoughts/${name}.md`
      for (let i = 2; taken.has(candidate); i++) candidate = `thoughts/${name} ${i}.md`
      path = candidate
      history.replaceState(null, '', `#/thought/${encodeURIComponent(path)}`)
    }
    const cur = store.read(path) ?? newThought(t, '', ymd(), d?.from ?? '')
    let md = setThoughtBody(cur, title.value.trim() || t, body.value)
    md = setMeta(md, 'tags', `[${tags.value.split(/[,，\s]+/).filter(Boolean).join(', ')}]`)
    store.enqueue(path, { kind: 'write', content: md, label: `思想 ${t}` })
    hint.textContent = ''
  }, 1200)
  for (const el of [title, body, tags])
    el.addEventListener('input', () => {
      hint.textContent = '编辑中'
      save()
    })

  function setMode(edit: boolean) {
    if (!edit && hint.textContent) save.flush()
    editing = edit
    editor.hidden = !edit
    reader.hidden = edit
    toggle.textContent = edit ? '完成' : '编辑'
    if (edit) {
      fill(true)
      requestAnimationFrame(() => (title.value ? body : title).focus())
    } else render()
  }

  function fill(force = false) {
    const md = path ? store.read(path) : null
    if (!md && !force) return
    if (md) {
      title.value = titleOf(path, md)
      body.value = thoughtBody(md)
      tags.value = tagsOf(md).join(' ')
    } else if (d) body.value = d.body
    fit()
  }

  function render() {
    if (editing) return
    const md = path ? store.read(path) : undefined
    reader.replaceChildren(
      md
        ? h(
            'div',
            h('h1.title', titleOf(path, md)),
            h('div.card-meta', getMeta(md, 'created'), getMeta(md, 'from') && h('a', { href: `#/day/${getMeta(md, 'from')}` }, `来自 ${getMeta(md, 'from')}`), ...tagsOf(md).map((t) => h('span.tag', `#${t}`))),
            markdown(thoughtBody(md)),
          )
        : h('p.empty', md === null ? '这条思想不存在。' : '加载中…'),
    )
  }

  setMode(isNew)
  if (isNew && d) {
    body.value = d.body
    fit()
  }
  if (path) store.load(path)
  const off = store.subscribe(() => {
    if (editing && !hint.textContent && document.activeElement?.closest('.editor') == null) fill()
    render()
  })
  return () => {
    if (hint.textContent) save.flush()
    off()
  }
}
