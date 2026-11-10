import { useEffect, useMemo, useState } from 'preact/hooks'
import { useAutoGrow, useFile } from '../lib/hooks'
import { emptyMe } from '../lib/me'
import { stripFrontmatter } from '../lib/md'
import { store } from '../lib/store'
import { debounce, markdown } from '../lib/ui'
import { Empty, Page } from '../components/Page'

const titleFor = (path: string) => {
  if (path === 'me.md') return '我是谁'
  const m = path.match(/^reviews\/(\d{4})-W(\d+)\.md$/)
  return m ? `第 ${Number(m[2])} 周复盘` : path.replace(/^.*\//, '').replace(/\.md$/, '')
}

/** 通用 Markdown 文件：阅读 / 编辑（我是谁、复盘） */
export function FilePage({ path }: { path: string }) {
  const md = useFile(path)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const ref = useAutoGrow(editing ? text : '')
  const week = path.match(/^reviews\/(\d{4}-W\d{2})\.md$/)?.[1]

  const save = useMemo(
    () =>
      debounce((v: string) => {
        store.enqueue(path, { kind: 'write', content: v, label: titleFor(path) })
        setDirty(false)
      }, 1200),
    [path],
  )
  useEffect(() => () => save.flush(), [save])

  const toggle = (
    <button
      type="button"
      class="text-btn strong"
      onClick={() => {
        if (editing) save.flush()
        else {
          setText(md ?? (path === 'me.md' ? emptyMe() : ''))
          setTimeout(() => ref.current?.focus(), 50)
        }
        setEditing(!editing)
      }}
    >
      {editing ? '完成' : '编辑'}
    </button>
  )
  const body = stripFrontmatter(md ?? '').replace(/^\s*# .*\n?/, '')

  return (
    <Page
      title={titleFor(path)}
      subtitle={dirty ? '编辑中' : path === 'me.md' ? '整页 Markdown 原文' : undefined}
      back={path === 'me.md' ? { href: '#/me', label: '我是谁' } : { href: '#/review', label: '复盘' }}
      actions={
        <>
          {week && !editing && (
            <a class="text-btn" href={`#/week/${week}`}>
              重走流程
            </a>
          )}
          {toggle}
        </>
      }
    >
      {editing ? (
        <textarea
          ref={ref}
          class="source-input"
          value={text}
          spellcheck={false}
          onInput={(e) => {
            const v = (e.target as HTMLTextAreaElement).value
            setText(v)
            setDirty(true)
            save(v)
          }}
        />
      ) : md === undefined ? (
        <div class="loading-block" />
      ) : md === null ? (
        <div class="group">
          <Empty icon="journal">还没有这个文件，点右上角「编辑」开始写。</Empty>
        </div>
      ) : (
        <article class="group prose doc" dangerouslySetInnerHTML={{ __html: markdown(body) }} />
      )}
    </Page>
  )
}
