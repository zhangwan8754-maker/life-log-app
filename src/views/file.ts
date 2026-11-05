import { stripFrontmatter } from '../lib/md'
import { store } from '../lib/store'
import { autoGrow, debounce, h, markdown } from '../lib/ui'

const TEMPLATE_ME = `---\nupdated:\n---\n# 我是谁\n\n## 价值观\n-\n\n## 长期目标（3–5 年）\n-\n\n## 今年\n-\n\n## 原则\n-\n\n## 当前关注\n-\n\n## 已知的我\n-\n`

/** 通用 Markdown 文件：阅读 / 编辑（用于 me.md 与复盘） */
export function mountFile(root: HTMLElement, path: string) {
  const area = h('textarea.journal.mono', { rows: 16, spellcheck: false })
  const fit = autoGrow(area)
  const hint = h('span.hint')
  const reader = h('div.reader')
  let editing = false
  const toggle = h('button.btn', { type: 'button', onclick: () => setMode(!editing) })
  const back = path.startsWith('reviews/') || path === 'me.md' ? h('a', { href: '#/review' }, '‹ 回看') : null
  root.replaceChildren(h('article.fade', h('header.page-head', h('div.eyebrow', back, hint), toggle), reader, area))

  const save = debounce(() => {
    store.enqueue(path, { kind: 'write', content: area.value, label: path === 'me.md' ? '我是谁' : path })
    hint.textContent = ''
  }, 1500)
  area.addEventListener('input', () => {
    hint.textContent = '编辑中'
    save()
  })

  function setMode(edit: boolean) {
    if (!edit && hint.textContent) save.flush()
    editing = edit
    area.hidden = !edit
    reader.hidden = edit
    toggle.textContent = edit ? '完成' : '编辑'
    if (edit) {
      const md = store.read(path)
      area.value = md ?? (path === 'me.md' ? TEMPLATE_ME : '')
      fit()
      area.focus()
    }
    render()
  }

  function render() {
    if (editing) return
    const md = store.read(path)
    reader.replaceChildren(
      md === undefined
        ? h('p.empty', '加载中…')
        : md === null
          ? h('p.empty', '还没有这个文件，点「编辑」开始写。')
          : markdown(stripFrontmatter(md)),
    )
  }

  setMode(false)
  store.load(path)
  const off = store.subscribe(render)
  return () => {
    if (hint.textContent) save.flush()
    off()
  }
}
