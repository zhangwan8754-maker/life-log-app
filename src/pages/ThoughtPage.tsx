import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { takeDraft } from '../lib/actions'
import { hm, ymd } from '../lib/dates'
import { useAutoGrow, useFile, useStore } from '../lib/hooks'
import { getMeta, newThought, safeTitle, setMeta, setThoughtBody, stripFrontmatter, thoughtBody } from '../lib/md'
import { store } from '../lib/store'
import { debounce, markdown } from '../lib/ui'
import { Page, Empty } from '../components/Page'


export const titleOf = (path: string, md?: string | null) =>
  (md && stripFrontmatter(md).match(/^\s*# (.+)$/m)?.[1]?.trim()) || path.replace(/^.*\//, '').replace(/\.md$/, '')

export const tagsOf = (md: string) =>
  getMeta(md, 'tags').replace(/^\[|\]$/g, '').split(/[,，\s]+/).filter(Boolean)

export function ThoughtPage({ arg }: { arg: string }) {
  useStore()
  const isNew = arg === 'new'
  const [path, setPath] = useState(isNew ? '' : arg)
  const [d] = useState(() => (isNew ? takeDraft() : null))
  const md = useFile(path || null)
  const [editing, setEditing] = useState(isNew)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState(d?.body ?? '')
  const [tags, setTags] = useState('')
  const [dirty, setDirty] = useState(false)
  const filled = useRef(isNew)
  const bodyRef = useAutoGrow(body)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (md && !filled.current) {
      filled.current = true
      setTitle(titleOf(path, md))
      setBody(thoughtBody(md))
      setTags(tagsOf(md).join(' '))
    }
  }, [md])

  const save = useMemo(
    () =>
      debounce((st: { title: string; body: string; tags: string; path: string }) => {
        const t = safeTitle(st.title) || (st.path ? titleOf(st.path) : '')
        if (!t && !st.body.trim()) return
        let p = st.path
        if (!p) {
          const name = t || `${ymd()} ${hm().replace(':', '')}`
          const taken = new Set(store.list('thoughts/'))
          p = `thoughts/${name}.md`
          for (let i = 2; taken.has(p); i++) p = `thoughts/${name} ${i}.md`
          setPath(p)
          history.replaceState(null, '', `#/thought/${encodeURIComponent(p)}`)
        }
        const cur = store.read(p) ?? newThought(t, '', ymd(), d?.from ?? '')
        let out = setThoughtBody(cur, st.title.trim() || t, st.body)
        out = setMeta(out, 'tags', `[${st.tags.split(/[,，\s]+/).filter(Boolean).join(', ')}]`)
        store.enqueue(p, { kind: 'write', content: out, label: `思想 ${t}` })
        setDirty(false)
      }, 1000),
    [],
  )
  const change = (patch: Partial<{ title: string; body: string; tags: string }>) => {
    const next = { title, body, tags, ...patch }
    if (patch.title !== undefined) setTitle(patch.title)
    if (patch.body !== undefined) setBody(patch.body)
    if (patch.tags !== undefined) setTags(patch.tags)
    setDirty(true)
    save({ ...next, path })
  }
  useEffect(() => () => save.flush(), [])
  useEffect(() => {
    if (isNew) setTimeout(() => (d ? titleRef.current : bodyRef.current)?.focus(), 80)
  }, [])

  const toggle = (
    <button
      type="button"
      class="text-btn strong"
      onClick={() => {
        if (editing) save.flush()
        else if (md) {
          setTitle(titleOf(path, md))
          setBody(thoughtBody(md))
          setTags(tagsOf(md).join(' '))
        }
        setEditing(!editing)
      }}
    >
      {editing ? '完成' : '编辑'}
    </button>
  )

  const shownTitle = editing ? title || '新的思想' : titleOf(path, md)
  return (
    <Page title={shownTitle} back={{ href: '#/memory/thoughts', label: '记忆' }} actions={toggle} subtitle={dirty ? '编辑中' : undefined} class="thought-page">
      {editing ? (
        <div class="editor">
          <input ref={titleRef} class="title-input" value={title} placeholder="标题" onInput={(e) => change({ title: (e.target as HTMLInputElement).value })} />
          <textarea
            ref={bodyRef}
            class="body-input"
            value={body}
            placeholder="把想法写完整：是什么，为什么，怎么用。"
            onInput={(e) => change({ body: (e.target as HTMLTextAreaElement).value })}
          />
          <input class="tags-input" value={tags} placeholder="标签，用空格分隔" onInput={(e) => change({ tags: (e.target as HTMLInputElement).value })} />
        </div>
      ) : md ? (
        <article class="reader">
          <div class="reader-meta">
            <span>{getMeta(md, 'created')}</span>
            {getMeta(md, 'from') && <a href={`#/day/${getMeta(md, 'from')}`}>来自 {getMeta(md, 'from')}</a>}
            {tagsOf(md).map((t) => (
              <span class="tag">#{t}</span>
            ))}
          </div>
          <div class="prose" dangerouslySetInnerHTML={{ __html: markdown(thoughtBody(md)) }} />
        </article>
      ) : (
        <Empty>{md === null ? '这条思想不存在。' : '加载中…'}</Empty>
      )}
    </Page>
  )
}
