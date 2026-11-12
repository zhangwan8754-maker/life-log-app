import { useEffect, useState } from 'preact/hooks'
import { ymd } from '../lib/dates'
import { useAutoGrow, useFile } from '../lib/hooks'
import * as A from '../lib/actions'
import { parseMe, type MeField } from '../lib/me'
import { TARGET_SUB } from '../lib/targets'
import { store } from '../lib/store'
import { cx, markdown } from '../lib/ui'
import { Page } from '../components/Page'
import { Sheet } from '../components/Sheet'

const PATH = 'me.md'

/** 我是谁：五个问题，每一栏是一张可以单独编辑的卡片 */
export function MePage() {
  const md = useFile(PATH)
  const me = parseMe(md)
  const [editing, setEditing] = useState<MeField | null>(null)

  const sub = [
    `已填 ${me.filled} / ${me.total}`,
    me.updated && `更新于 ${me.updated.slice(5).replace('-', '/')}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Page
      title="我是谁"
      icon="person"
      subtitle={sub}
      back={{ href: '#/review', label: '复盘' }}
      actions={
        <a class="text-btn" href="#/file/me.md">
          编辑原文
        </a>
      }
    >
      {me.groups.map((g) => {
        const edit = (f: MeField) => (f.sub === TARGET_SUB ? A.targetSheet.set(true) : setEditing(f))
        return (
        <>
          <p class="group-label me-label">
            {g.title}
            {g.note && <span>{g.note}</span>}
          </p>
          <div class={cx('group', md === undefined && 'loading')}>
            {g.fields.map((f) => (
              <div
                class="me-row tap"
                role="button"
                tabIndex={0}
                aria-label={`编辑 ${g.title}${f.sub ? ` · ${f.sub}` : ''}`}
                onClick={() => edit(f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    edit(f)
                  }
                }}
              >
                {f.sub && <span class="me-sub">{f.sub}</span>}
                {f.text ? <div class="me-text prose" dangerouslySetInnerHTML={{ __html: markdown(f.text) }} /> : <span class="me-hint">{f.hint}</span>}
              </div>
            ))}
          </div>
        </>
        )
      })}
      {me.extras.length > 0 && (
        <>
          <p class="group-label me-label">
            其他
            <span>手写的栏目，点右上角「编辑原文」修改</span>
          </p>
          <div class="group">
            {me.extras.map((e) => (
              <div class="me-row plain">
                <span class="me-sub">{e.title}</span>
                <div class="prose me-extra" dangerouslySetInnerHTML={{ __html: markdown(e.text) }} />
              </div>
            ))}
          </div>
        </>
      )}
      <p class="group-note">AI 复盘时最先读这一页。「借来的」不会被当成你的结论。</p>
      <FieldSheet field={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}

function FieldSheet({ field, onClose }: { field: MeField | null; onClose: () => void }) {
  const [f, setF] = useState<MeField | null>(null)
  const [text, setText] = useState('')
  const ref = useAutoGrow(text)
  useEffect(() => {
    if (field) {
      setF(field)
      setText(field.text)
      setTimeout(() => ref.current?.focus(), 80)
    }
  }, [field])

  const close = () => {
    if (f && text.trim() !== f.text) store.enqueue(PATH, { kind: 'me.set', section: f.section, sub: f.sub, text: text.trim(), date: ymd() })
    onClose()
  }

  return (
    <Sheet open={!!field} onClose={close} title={f ? f.sub || f.section : ''} label="编辑我是谁">
      {f && (
        <div class="me-sheet">
          <p class="sheet-sub">{f.hint}</p>
          <textarea ref={ref} class="me-edit" rows={5} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} aria-label={f.sub || f.section} />
          <div class="quick-bottom">
            <span class="hint">{f.sub ? f.section : ''}</span>
            <button type="button" class="text-btn strong" onClick={close}>
              完成
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
